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

// MITM 下每个域名一个 https server, 各自带一份原生 TLS SecureContext(不算 JS heap, 只涨 RSS),
// 所以数量要收着, 并配 ttl 让长时间没访问的域名及时掉出去
const SERVER_CACHE_MAX = 200;
const SERVER_CACHE_TTL = 30 * 60 * 1000;
// 证书只是几 KB 的 PEM 字符串, 可以比 server 缓存得更多更久:
// server 被淘汰后重建时不用再验一次上游证书(一次网络往返) + 重新签一次名
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
  httpServer: http.Server;
  /** 缓存 promise, 让同一域名的并发请求共享一次创建过程 */
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
      // 淘汰时要 close, 否则 server 上的空闲 keep-alive 连接会一直挂着,
      // 连带 SecureContext 等不到回收(已经升级完的 ws 隧道不受影响, 实测验证过)
      dispose: promise => {
        promise.then(server => server.close(), () => { /* 创建失败的条目, 已在 catch 里清理 */ });
      },
    });

    // 这里故意不开 updateAgeOnGet: ttl 走绝对时间, 保证改了 ignoreCertError
    // 或上游换了证书之后, 最多一个 ttl 就会重新探测一次
    this.certs = new LRUCache({
      max: CERT_CACHE_MAX,
      ttl: CERT_CACHE_TTL,
    });
  }

  async getHTTPServer() {
    // 明文 server 只有一个, 不进 LRU, 免得被 https server 挤掉或被 ttl 淘汰
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
          // 失败的条目不留在缓存里, 下次请求重试
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

  /** 取(并缓存)某个域名的自签证书 */
  async getCertificate(hostname: string, port: number) {
    const key = `${hostname}:${port}`;

    let promise = this.certs.get(key);
    if (!promise) {
      promise = (async () => {
        const verifyResult = await this.verifyCertificate(hostname, port);
        // 上游证书本来就有问题的站点用 untrust 根证书签, 让浏览器保持报错
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
