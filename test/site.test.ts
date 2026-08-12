import fetch from 'node-fetch';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('site router test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('home page', async () => {
    const response = await fetch(util.getURL(app));
    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('download crt file', async () => {
    const response = await fetch(`${util.getURL(app)}feproxy.crt`);
    expect(response.headers.get('content-type')).toEqual('application/octet-stream');
    expect(await response.text()).toBeTruthy();
  });

  test('log message', async () => {
    const url = `${util.getURL(app)}log?index=1&str=${encodeURIComponent(JSON.stringify([ 'message' ]))}`;
    const response = await fetch(url);
    expect(response.status).toEqual(204);
  });

  test('log message which is not an array', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    // 非 JSON 时原样打印
    const text = await fetch(`${util.getURL(app)}log?index=1&str=${encodeURIComponent('plain text')}`);
    expect(text.status).toEqual(204);
    expect(log).toHaveBeenCalledWith(expect.anything(), 'plain text');

    // JSON 但不是数组
    const json = await fetch(`${util.getURL(app)}log?index=2&str=${encodeURIComponent('{"a":1}')}`);
    expect(json.status).toEqual(204);
    expect(log).toHaveBeenCalledWith(expect.anything(), { a: 1 });

    log.mockRestore();
  });

  test('get config', async () => {
    const response = await fetch(`${util.getURL(app)}getConfig`);
    const data = await response.json();

    expect(data.port).toEqual(app.config.port);
    expect(data.devtoolsURL).toContain(`:${app.config.port}/ws`);
    // 代理账号不下发给前端
    expect(data.projects).toEqual(app.config.projects);
  });

  test('set config', async () => {
    const response = await fetch(`${util.getURL(app)}setConfig`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inspect: false }),
    });

    expect((await response.json()).inspect).toEqual(false);
    expect(app.config.inspect).toEqual(false);

    await app.config.update({ inspect: true });
  });

  test('set config with broken body', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await fetch(`${util.getURL(app)}setConfig`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ broken',
    });

    expect(response.status).toEqual(400);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test('devtools static file', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/inspector.html`);
    expect(response.status).toEqual(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBeTruthy();
  });

  test('devtools local override file', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/SupportedCSSProperties.js`);
    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('devtools missing file', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/not-exists.js`);
    expect(response.status).toEqual(404);
  });
});
