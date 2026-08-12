import fetch from 'node-fetch';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('proxy test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('start server normal', async () => {
    expect(app).toBeTruthy();
  });

  test('proxy http', async () => {
    const response = await fetch(util.getURL(app), {
      agent: util.getProxyAgent(app),
    });

    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('proxy https', async () => {
    const response = await fetch(`https://${app.config.hostname}/`, {
      agent: util.getProxyAgent(app),
    });

    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('proxy keep alive', async () => {
    const agent = util.getProxyAgent(app, { keepAlive: true });
    const first = await fetch(util.getURL(app), { agent });
    await first.text();

    const response = await fetch(util.getURL(app), { agent });

    expect(response.headers.get('proxy-connection')).toEqual('keep-alive');
    expect(await response.text()).toBeTruthy();
  });

  test('proxy https use connect', async () => {
    app.config.https = false;
    const response = await fetch(util.getTestURL(), {
      // 裸 TCP 对穿, 拿到的是上游真实证书, 所以要校验
      agent: util.getProxyAgent(app, { rejectUnauthorized: true }),
    });
    app.config.https = true;

    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });
});
