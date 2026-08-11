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

  // 直连 feproxy 自身端口的 https 地址
  const getSiteURL = () => `https://127.0.0.1:${app.config.port}/`;

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

  test('site url without credentials should be 401', async () => {
    const response = await rp({
      url: util.getURL(app),
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic/);
  });

  test('site url with credentials should pass', async () => {
    const response = await rp({
      url: util.getURL(app),
      auth: { user: 'feproxy', pass: 'feproxy' },
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).not.toEqual(401);
  });

  test('https site url without credentials should be 401', async () => {
    const response = await rp({
      url: getSiteURL(),
      strictSSL: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).toEqual(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic/);
  });

  test('https site url with credentials should pass', async () => {
    const response = await rp({
      url: getSiteURL(),
      auth: { user: 'feproxy', pass: 'feproxy' },
      strictSSL: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    expect(response.statusCode).not.toEqual(401);
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

