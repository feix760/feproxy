import rp from 'request-promise';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('proxy auth test', () => {
  let app: FeproxyApp;

  beforeAll(async () => {
    app = await util.startApp({
      auth: {
        enable: true,
        username: 'feproxy',
        password: 'feproxy',
      },
    });
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  const getProxy = (auth?: string) => {
    return `http://${auth ? `${auth}@` : ''}127.0.0.1:${app.config.port}`;
  };

  // 直连 feproxy 自身端口(不走代理)
  const getSiteURL = (https = false) => {
    return `${https ? 'https' : 'http'}://127.0.0.1:${app.config.port}/getConfig`;
  };

  test('http proxy without credentials should be 407', async () => {
    const response = await rp({
      url: util.getURL(app),
      proxy: getProxy(),
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(407);
    expect(response.headers['proxy-authenticate']).toMatch(/^Basic/);
  });

  test('http proxy with wrong credentials should be 407', async () => {
    const response = await rp({
      url: util.getURL(app),
      proxy: getProxy('feproxy:wrong'),
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(407);
  });

  test('http proxy with credentials should pass', async () => {
    const response = await rp({
      url: util.getURL(app),
      proxy: getProxy('feproxy:feproxy'),
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).not.toEqual(407);
  });

  test('site url without credentials should pass', async () => {
    const response = await rp({
      url: getSiteURL(),
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(200);
  });

  test('https site url without credentials should pass', async () => {
    const response = await rp({
      url: getSiteURL(true),
      strictSSL: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(200);
  });

  test('connect without credentials should fail', async () => {
    await expect(rp({
      url: `https://${app.config.hostname}/`,
      proxy: getProxy(),
      strictSSL: false,
    })).rejects.toThrow(/407/);
  });

  test('connect with credentials should pass', async () => {
    const response = await rp({
      url: `https://${app.config.hostname}/`,
      proxy: getProxy('feproxy:feproxy'),
      strictSSL: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).not.toEqual(407);
  });
});

