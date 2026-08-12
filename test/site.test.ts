import fs from 'fs';
import path from 'path';
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

  test('devtools entry html is patched', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/inspector.html`);
    const html = await response.text();

    expect(response.status).toEqual(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    // 设置入口脚本注入进去了, 且排在 devtools 主 chunk 之前(要先写 localStorage 里的默认设置)
    expect(html).toMatch(/feproxy-entry\.js[\s\S]*chunk-[^"]*\.js/);
    // 上游有的版本会在 CSP 里把 connect-src 限死 ws://127.0.0.1, 那样手机连局域网 IP 就连不上
    expect(html).not.toMatch(/connect-src (?![^;"]*ws:)/);
  });

  test('devtools bundle has no bare node import', async () => {
    // 上游 1.20252311.0 ~ 至今的构建产物里混进了 `import*as x from"node:worker_threads"`,
    // 浏览器解析不了整个 devtools 白屏, 所以 @chrome-devtools/inspector 锁定在 1.20251611.0。
    // 升级依赖时这条会先红, 而不是等到打开界面才发现是白屏。
    const dir = path.dirname(require.resolve('@chrome-devtools/inspector/inspector.html'));
    const chunk = fs.readdirSync(dir).filter(name => /^chunk-.*\.js$/.test(name));

    expect(chunk.length).toBeGreaterThan(0);
    chunk.forEach(name => {
      expect(fs.readFileSync(path.join(dir, name), 'utf8')).not.toMatch(/from\s*"node:/);
    });
  });

  test('devtools local override file', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/feproxy-entry.js`);
    expect(response.status).toEqual(200);
    expect(await response.text()).toContain('screencast-enabled');
  });

  test('devtools formatter worker', async () => {
    // 这个 url 是 devtools 构建产物里写死的(相对主 chunk 的 ../../entrypoints/...), 落在站点根上。
    // 拿不到文件的话 devtools 只 console.error, promise 既不 reject 也不超时, 点开压缩过的响应时
    // Response 面板会永远卡在自动格式化上, 只剩一个空编辑器。
    const response = await fetch(`${util.getURL(app)}entrypoints/formatter_worker/formatter_worker-entrypoint.js`);

    expect(response.status).toEqual(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toContain('workerReady');
  });

  test('devtools missing file', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/not-exists.js`);
    expect(response.status).toEqual(404);
  });

  test('devtools file outside root', async () => {
    // 文件名来自 url, 不能用 ../ 读到包外的文件
    const response = await fetch(`${util.getURL(app)}devtools/${encodeURIComponent('../../package.json')}`);
    expect(response.status).toEqual(404);
  });
});
