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

type AnyServer = http.Server | https.Server;

interface TSLServerOptions {
  hostname: string;
  port?: number;
  group?: string;
}

function getRootCASuffix() {
  const hostname = os.userInfo().username
    .replace(/\..*$/, '') // 去掉域名后缀, 如 .local
    .replace(/[^\w-]/g, '') // 过滤文件名非法字符
    .slice(0, 10)
    .replace(/-+$/, ''); // 去掉截断后残留的结尾连字符
  return `-${hostname}`;
}

class ServerFactory {
  static rootCA = `feproxy${getRootCASuffix()}.crt`;

  app: FeproxyApp;
  untrustRootCA: RootCA;
  trustedRootCA: RootCA;
  agent: HttpsAgent;
  servers: LRUCache<string, AnyServer | Promise<AnyServer>>;

  constructor(app: FeproxyApp) {
    this.app = app;

    const suffix = getRootCASuffix();
    this.untrustRootCA = ca.getRootCA(`feproxy.untrust${suffix}`, this.app.config.RC_DIR);
    this.trustedRootCA = ca.getRootCA(`feproxy${suffix}`, this.app.config.RC_DIR);
    this.agent = new HttpsAgent({
      keepAlive: false,
      timeout: 10000,
    });

    this.servers = new LRUCache({ max: 1000 });
  }

  async getHTTPServer() {
    let server = this.servers.get('http') as http.Server;

    if (!server) {
      server = http.createServer(this.app.callback());
      this.app.ws.listen({ server });

      this.servers.set('http', server);
    }

    return server;
  }

  async getTSLServer({ hostname, port = 443, group = '' }: TSLServerOptions) {
    const key = `${group}:${hostname}:${port}`;

    let server = this.servers.get(key);
    if (!server) {
      server = (async () => {
        const verifyResult = await this.verifyCertificate(hostname, port);
        const rootCA = verifyResult === 'SUCCESS' || this.app.config.ignoreCertError
          ? this.trustedRootCA
          : this.untrustRootCA;
        const { pem } = ca.createCertificate(rootCA, hostname);

        const realServer = https.createServer(pem, this.app.callback());
        this.app.ws.listen({ server: realServer });
        this.servers.set(key, realServer);
        return realServer;
      })()
        .catch(err => {
          this.servers.delete(key);
          return Promise.reject(err);
        });

      this.servers.set(key, server);
    }

    if (server instanceof Promise) {
      server = await server;
    }
    return server;
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
