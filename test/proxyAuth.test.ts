import fetch from 'node-fetch';
import proxyAgent from '../src/util/proxyAgent';
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

  const getAgent = (auth?: string) => {
    return proxyAgent(`http://${auth ? `${auth}@` : ''}127.0.0.1:${app.config.port}`, {
      rejectUnauthorized: false,
    });
  };

  // Hits feproxy's own port directly, without the proxy
  const getSiteURL = (https = false) => {
    return `${https ? 'https' : 'http'}://127.0.0.1:${app.config.port}/getConfig`;
  };

  test('http proxy without credentials should be 407', async () => {
    const response = await fetch(util.getURL(app), {
      agent: getAgent(),
    });

    expect(response.status).toEqual(407);
    expect(response.headers.get('proxy-authenticate')).toMatch(/^Basic/);
  });

  test('http proxy with wrong credentials should be 407', async () => {
    const response = await fetch(util.getURL(app), {
      agent: getAgent('feproxy:wrong'),
    });

    expect(response.status).toEqual(407);
  });

  test('http proxy with credentials should pass', async () => {
    const response = await fetch(util.getURL(app), {
      agent: getAgent('feproxy:feproxy'),
    });

    expect(response.status).not.toEqual(407);
  });

  test('site url without credentials should pass', async () => {
    const response = await fetch(getSiteURL());

    expect(response.status).toEqual(200);
  });

  test('https site url without credentials should pass', async () => {
    const response = await fetch(getSiteURL(true), {
      agent: util.insecureAgent,
    });

    expect(response.status).toEqual(200);
  });

  test('connect without credentials should fail', async () => {
    const response = await fetch(`https://${app.config.hostname}/`, {
      agent: getAgent(),
    });

    expect(response.status).toEqual(407);
    expect(response.headers.get('proxy-authenticate')).toMatch(/^Basic/);
  });

  test('connect with credentials should pass', async () => {
    const response = await fetch(`https://${app.config.hostname}/`, {
      agent: getAgent('feproxy:feproxy'),
    });

    expect(response.status).not.toEqual(407);
  });
});
