import https from 'https';
import type http from 'http';
import type { TLSSocket } from 'tls';
import fetch from 'node-fetch';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('proxy test', () => {
  let app: FeproxyApp;
  let upstream: util.TestUpstream;

  beforeAll(async () => {
    app = await util.startApp();
    upstream = await util.startUpstream();
  });

  afterAll(async () => {
    await upstream.close();
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
    // 用原生 https 请求(不用 node-fetch), 这样才拿得到握手拿到的证书
    const agent = util.getProxyAgent(app)(new URL(upstream.url));
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      https.get(upstream.url, { agent }, resolve).on('error', reject);
    });
    app.config.https = true;

    // 裸 TCP 对穿, 拿到的应该是上游真实证书; 被 MITM 的话这里是 feproxy 现签的那张
    const cert = (response.socket as TLSSocket).getPeerCertificate();
    expect(cert.raw.toString('base64')).toEqual(upstream.cert);

    expect(response.statusCode).toEqual(200);
    response.resume();
  });
});
