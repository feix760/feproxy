import http from 'http';
import https from 'https';
import os from 'os';
import { LRUCache } from 'lru-cache';
import { HttpsAgent } from '../util/agent';
import type { FeproxyApp } from '../types';
import * as ca from './ca';
import type { RootCA } from './ca';

const certErrorCodes = [
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
];

const ignoreCertErrorCodes = [
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
];

// Under MITM there's one https server per domain, each holding a native TLS SecureContext (not on
// the JS heap, it only grows RSS), so keep the count down and let the ttl drop idle domains.
const SERVER_CACHE_MAX = 200;
const SERVER_CACHE_TTL = 30 * 60 * 1000;
// Certificates are just a few KB of PEM, so they can be cached longer and wider than servers:
// rebuilding an evicted server then skips re-probing the upstream cert (a round trip) and re-signing.
const CERT_CACHE_MAX = 1000;
const CERT_CACHE_TTL = 60 * 60 * 1000;

interface TSLServerOptions {
  hostname: string;
  port?: number;
  group?: string;
}

type CertPem = RootCA['pem'];

function getRootCASuffix() {
  const hostname = os.userInfo().username
    .replace(/\..*$/, '') // strip a domain suffix such as .local
    .replace(/[^\w-]/g, '') // drop characters illegal in filenames
    .slice(0, 10)
    .replace(/-+$/, ''); // drop a trailing hyphen left by the truncation
  return `-${hostname}`;
}

class ServerFactory {
  static rootCA = `feproxy${getRootCASuffix()}.crt`;

  app: FeproxyApp;
  untrustRootCA: RootCA;
  trustedRootCA: RootCA;
  agent: HttpsAgent;
  httpServer: http.Server;
  /** Caches the promise so concurrent requests for one domain share a single creation */
  tslServers: LRUCache<string, Promise<https.Server>>;
  certs: LRUCache<string, Promise<CertPem>>;

  constructor(app: FeproxyApp) {
    this.app = app;

    const suffix = getRootCASuffix();
    this.untrustRootCA = ca.getRootCA(`feproxy.untrust${suffix}`, this.app.config.RC_DIR);
    this.trustedRootCA = ca.getRootCA(`feproxy${suffix}`, this.app.config.RC_DIR);
    this.agent = new HttpsAgent({
      keepAlive: false,
      timeout: 10000,
    });

    this.tslServers = new LRUCache({
      max: SERVER_CACHE_MAX,
      ttl: SERVER_CACHE_TTL,
      updateAgeOnGet: true,
      // Close on eviction, otherwise idle keep-alive connections linger and hold the
      // SecureContext from being collected (already-upgraded ws tunnels are unaffected, verified)
      dispose: promise => {
        promise.then(server => server.close(), () => { /* failed entry, already cleaned in catch */ });
      },
    });

    // updateAgeOnGet is deliberately off: an absolute ttl guarantees that after ignoreCertError
    // changes or the upstream rotates its certificate, we re-probe within one ttl at most
    this.certs = new LRUCache({
      max: CERT_CACHE_MAX,
      ttl: CERT_CACHE_TTL,
    });
  }

  async getHTTPServer() {
    // There's only one plaintext server; keep it out of the LRU so https servers or the ttl
    // can't evict it
    if (!this.httpServer) {
      this.httpServer = http.createServer(this.app.callback());
      this.app.ws.attach(this.httpServer);
    }

    return this.httpServer;
  }

  async getTSLServer({ hostname, port = 443, group = '' }: TSLServerOptions) {
    const key = `${group}:${hostname}:${port}`;

    let promise = this.tslServers.get(key);
    if (!promise) {
      promise = this.createTSLServer(hostname, port)
        .catch(err => {
          // Don't keep failed entries cached, so the next request retries
          if (this.tslServers.peek(key) === promise) {
            this.tslServers.delete(key);
          }
          return Promise.reject(err);
        });

      this.tslServers.set(key, promise);
    }

    return await promise;
  }

  async createTSLServer(hostname: string, port: number) {
    const pem = await this.getCertificate(hostname, port);

    const server = https.createServer(pem, this.app.callback());
    this.app.ws.attach(server);
    return server;
  }

  /** Get (and cache) the self-signed certificate for a domain */
  async getCertificate(hostname: string, port: number) {
    const key = `${hostname}:${port}`;

    let promise = this.certs.get(key);
    if (!promise) {
      promise = (async () => {
        const verifyResult = await this.verifyCertificate(hostname, port);
        // Sites whose upstream certificate is already broken get signed by the untrust root,
        // so the browser keeps erroring
        const rootCA = verifyResult === 'SUCCESS' || this.app.config.ignoreCertError
          ? this.trustedRootCA
          : this.untrustRootCA;

        return ca.createCertificate(rootCA, hostname).pem;
      })()
        .catch(err => {
          if (this.certs.peek(key) === promise) {
            this.certs.delete(key);
          }
          return Promise.reject(err);
        });

      this.certs.set(key, promise);
    }

    return await promise;
  }

  async verifyCertificate(hostname: string, port: number) {
    if (hostname === this.app.config.hostname) {
      return 'SUCCESS';
    }
    return await new Promise<string>((resolve, reject) => {
      const req = https.request({
        hostname,
        port,
        path: '/',
        method: 'GET',
        agent: this.agent,
      }, res => {
        res.destroy();
        resolve('SUCCESS');
      });
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (ignoreCertErrorCodes.includes(err.code)) {
          resolve('SUCCESS');
        } else if (certErrorCodes.includes(err.code)) {
          console.log(hostname, err.code);
          resolve('FAIL');
        } else {
          reject(`Verify certificate error ${hostname} ${err.code}`);
        }
      });
      req.end();
    });
  }
}

export default ServerFactory;
