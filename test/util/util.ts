import path from 'path';
import fs from 'fs-extra';
import getPort from 'get-port';
import App from '../../src/App';
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

export const getTestURL = (https = true) => {
  return `${https ? 'https' : 'http'}://www.baidu.com/`;
};
