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
    // 默认关闭代理账号验证, 需要验证的用例单独开启
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
  /** https 地址, 走 CONNECT + MITM 解密后再转发 */
  url: string;
  /** http 地址, 走普通 http 代理 */
  httpURL: string;
  /** 上游证书的 DER(base64), 用来断言拿到的是上游真实证书而不是 MITM 签的那张 */
  cert: string;
  close: () => Promise<void>;
}

const upstreamBody = JSON.stringify({ upstream: 'feproxy test' });

const onUpstreamRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const body = Buffer.from(upstreamBody);
  res.setHeader('content-type', 'application/json');
  // 以前拿外网站点当上游, 响应是 gzip 的, 这里保持一致(抓包侧要解压才拿得到响应体)
  if (/gzip/i.test(req.headers['accept-encoding'] as string || '')) {
    const gzipped = zlib.gzipSync(body);
    res.setHeader('content-encoding', 'gzip');
    res.setHeader('content-length', gzipped.length);
    // HEAD 请求 node 自己会丢掉响应体, 只留响应头
    res.end(gzipped);
    return;
  }
  res.setHeader('content-length', body.length);
  res.end(body);
};

/**
 * 起一对本地上游服务(http + https)顶替外网站点。
 *
 * 以前这些用例直接抓 `https://www.baidu.com/`, GitHub Actions 的机器连它要么很慢要么连不上,
 * 于是所有走 https 的用例(包括只测规则的那些 —— MITM 前会先探一次上游证书)全线超时。
 *
 * https 的证书用一份独立的根证书签发(不是 feproxy 的那两份), 这样「裸 TCP 对穿拿到的是上游真实证书」
 * 和「MITM 换成了 feproxy 签的证书」两种情况才区分得开。
 */
export const startUpstream = async (): Promise<TestUpstream> => {
  const dir = path.join(tmpDir, `upstream-${Math.random()}`);
  const { pem } = ca.createCertificate(ca.getRootCA('upstream', dir), 'localhost');

  const httpServer = http.createServer(onUpstreamRequest);
  const httpsServer = https.createServer({ key: pem.key, cert: pem.cert }, onUpstreamRequest);

  // 先 listen 再取下一个端口, 免得两次 getPort 拿到同一个
  const httpPort = await getPort();
  await new Promise<void>(resolve => httpServer.listen(httpPort, resolve));
  const httpsPort = await getPort();
  await new Promise<void>(resolve => httpsServer.listen(httpsPort, resolve));

  return {
    // 用 localhost 而不是 127.0.0.1: 证书的 subjectAltName 只有 DNS 类型, IP 过不了域名校验
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

/** 走 feproxy 代理的 node-fetch agent, 默认不校验证书(MITM 用的是自签根证书) */
export const getProxyAgent = (app: FeproxyApp, options?: https.AgentOptions) => {
  return proxyAgent(`http://127.0.0.1:${app.config.port}`, { rejectUnauthorized: false, ...options });
};

/** 直连 feproxy 自身的 https 端口(不走代理)时忽略自签证书 */
export const insecureAgent = new https.Agent({ rejectUnauthorized: false });
