import https from 'https';
import path from 'path';
import fs from 'fs-extra';
import getPort from 'get-port';
import App from '../../src/App';
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

export const getTestURL = (secure = true) => {
  return `${secure ? 'https' : 'http'}://www.baidu.com/`;
};

/** 走 feproxy 代理的 node-fetch agent, 默认不校验证书(MITM 用的是自签根证书) */
export const getProxyAgent = (app: FeproxyApp, options?: https.AgentOptions) => {
  return proxyAgent(`http://127.0.0.1:${app.config.port}`, { rejectUnauthorized: false, ...options });
};

/** 直连 feproxy 自身的 https 端口(不走代理)时忽略自签证书 */
export const insecureAgent = new https.Agent({ rejectUnauthorized: false });
