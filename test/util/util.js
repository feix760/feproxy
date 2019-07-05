
const path = require('path');
const fs = require('fs-extra');
const getPort = require('get-port');
const App = require('../../lib/App');

const tmpDir = path.join(__dirname, '../.tmp');

exports.startApp = async config => {
  jest.setTimeout(1000 * 30);

  const RC_DIR = path.join(tmpDir, `${Math.random()}`);

  const app = App({
    port: await getPort(10000 + Math.floor(Math.random() * 50000)),
    https: true,
    RC_DIR,
    ...config,
  });

  await app.start();

  return app;
};

exports.stopApp = async app => {
  await app.stop();

  if (app.config.RC_DIR.startsWith(tmpDir)) {
    await fs.remove(tmpDir);
  }
};

exports.getURL = app => {
  return `http://127.0.0.1:${app.config.port}/`;
};

exports.getTestURL = (https = true) => {
  return `${https ? 'https' : 'http'}://www.baidu.com/`;
};
