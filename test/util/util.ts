import http from 'http';
import https from 'https';
import path from 'path';
import zlib from 'zlib';
import fs from 'fs-extra';
import getPort from 'get-port';
import App from '../../src/App';
import * as ca from '../../src/server/ca';
import proxyAgent from '../../src/util/proxyAgent';
import type { ConfigData } from '../../src/util/ProxyConfig';
import type { FeproxyApp } from '../../src/types';

const tmpDir = path.join(__dirname, '../.tmp');

export const startApp = async (config?: Partial<ConfigData>) => {
  jest.setTimeout(1000 * 30);

  const RC_DIR = path.join(tmpDir, `${Math.random()}`);

  const app = App({
    port: await getPort(10000 + Math.floor(Math.random() * 50000)),
    https: true,
    RC_DIR,
    // Auth off by default; cases that need it opt in
    auth: {
      enable: false,
      username: 'feproxy',
      password: 'feproxy',
    },
    ...config,
  });

  await app.start();

  return app;
};

export const stopApp = async (app: FeproxyApp) => {
  await app.stop();

  if (app.config.RC_DIR.startsWith(tmpDir)) {
    await fs.remove(app.config.RC_DIR);
  }
};

export const getURL = (app: FeproxyApp) => {
  return `http://127.0.0.1:${app.config.port}/`;
};

export interface TestUpstream {
  /** https address: CONNECT, MITM decryption, then forwarding */
  url: string;
  /** http address: plain http proxying */
  httpURL: string;
  /** Upstream certificate as base64 DER, to assert we got the real one and not the MITM's */
  cert: string;
  close: () => Promise<void>;
}

const upstreamBody = JSON.stringify({ upstream: 'feproxy test' });

const onUpstreamRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const body = Buffer.from(upstreamBody);
  res.setHeader('content-type', 'application/json');
  // The public site we used to proxy replied gzipped; keep that, since the capture side then has
  // to decompress to get a body
  if (/gzip/i.test(req.headers['accept-encoding'] as string || '')) {
    const gzipped = zlib.gzipSync(body);
    res.setHeader('content-encoding', 'gzip');
    res.setHeader('content-length', gzipped.length);
    // For HEAD, node drops the body itself and keeps only the headers
    res.end(gzipped);
    return;
  }
  res.setHeader('content-length', body.length);
  res.end(body);
};

/**
 * Boot a pair of local upstream servers (http + https) to stand in for a public site.
 *
 * These cases used to hit a real public url, which GitHub Actions machines reach slowly or not at
 * all, timing out every https case — including the rule-only ones, since MITM probes the upstream
 * certificate first.
 *
 * The https certificate is signed by its own root (neither of feproxy's two), which is what makes
 * "raw TCP passthrough returns the real upstream certificate" distinguishable from "MITM swapped in
 * a feproxy-signed one".
 */
export const startUpstream = async (): Promise<TestUpstream> => {
  const dir = path.join(tmpDir, `upstream-${Math.random()}`);
  const { pem } = ca.createCertificate(ca.getRootCA('upstream', dir), 'localhost');

  const httpServer = http.createServer(onUpstreamRequest);
  const httpsServer = https.createServer({ key: pem.key, cert: pem.cert }, onUpstreamRequest);

  // listen before asking for the next port, or two getPort calls can return the same one
  const httpPort = await getPort();
  await new Promise<void>(resolve => httpServer.listen(httpPort, resolve));
  const httpsPort = await getPort();
  await new Promise<void>(resolve => httpsServer.listen(httpsPort, resolve));

  return {
    // localhost rather than 127.0.0.1: the certificate's subjectAltName is DNS-only, so an IP
    // fails hostname verification
    url: `https://localhost:${httpsPort}/`,
    httpURL: `http://localhost:${httpPort}/`,
    cert: pem.cert.replace(/-----[^-]+-----|\s/g, ''),
    close: async () => {
      await Promise.all([
        new Promise<void>(resolve => httpServer.close(() => resolve())),
        new Promise<void>(resolve => httpsServer.close(() => resolve())),
      ]);
      await fs.remove(dir);
    },
  };
};

/** node-fetch agent going through feproxy; skips cert checks by default (MITM self-signs) */
export const getProxyAgent = (app: FeproxyApp, options?: https.AgentOptions) => {
  return proxyAgent(`http://127.0.0.1:${app.config.port}`, { rejectUnauthorized: false, ...options });
};

/** Ignores the self-signed cert when hitting feproxy's own https port directly, without the proxy */
export const insecureAgent = new https.Agent({ rejectUnauthorized: false });
