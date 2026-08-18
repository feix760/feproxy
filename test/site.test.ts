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

    // Non-JSON is printed as is
    const text = await fetch(`${util.getURL(app)}log?index=1&str=${encodeURIComponent('plain text')}`);
    expect(text.status).toEqual(204);
    expect(log).toHaveBeenCalledWith(expect.anything(), 'plain text');

    // JSON, but not an array
    const json = await fetch(`${util.getURL(app)}log?index=2&str=${encodeURIComponent('{"a":1}')}`);
    expect(json.status).toEqual(204);
    expect(log).toHaveBeenCalledWith(expect.anything(), { a: 1 });

    log.mockRestore();
  });

  test('get config', async () => {
    const response = await fetch(`${util.getURL(app)}getConfig`);
    const data = await response.json();

    expect(data.devtoolsURL).toContain(`:${app.config.port}/ws`);
    // A whitelist of what the page reads: only whether auth is on, and nothing else at all — no
    // credentials, no RC_DIR, no port
    expect(Object.keys(data).sort()).toEqual(
      [ 'auth', 'devtoolsURL', 'https', 'ignoreCertError', 'inspect', 'projects' ],
    );
    expect(data.projects).toEqual(app.config.projects);
    expect(data.auth).toEqual({ enable: false });
  });

  test('set config', async () => {
    const response = await fetch(`${util.getURL(app)}setConfig`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ignoreCertError: true, inspect: false }),
    });
    const data = await response.json();

    expect(data.ignoreCertError).toEqual(true);
    expect(app.config.ignoreCertError).toEqual(true);
    // Capturing is a startup decision, so the API drops it instead of writing it
    expect(data.inspect).toEqual(true);
    expect(app.config.inspect).toEqual(true);
    // The answer goes through the same whitelist as getConfig's, minus devtoolsURL
    expect(Object.keys(data).sort()).toEqual(
      [ 'auth', 'https', 'ignoreCertError', 'inspect', 'projects' ],
    );
    expect(data.auth).toEqual({ enable: false });

    await app.config.update({ ignoreCertError: false });
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
    // The entry script is injected before the devtools main chunk (default settings have to reach
    // localStorage first)
    expect(html).toMatch(/feproxy-entry\.js[\s\S]*chunk-[^"]*\.js/);
    // Some upstream versions pin connect-src to ws://127.0.0.1 in the CSP, which breaks phones
    // connecting over a LAN IP
    expect(html).not.toMatch(/connect-src (?![^;"]*ws:)/);
  });

  test('devtools bundle has no bare node import', async () => {
    // Upstream builds from 1.20252311.0 onwards leak `import*as x from"node:worker_threads"`, which
    // browsers can't parse, leaving devtools blank — hence @chrome-devtools/inspector is pinned to
    // 1.20251611.0. This case goes red on an upgrade instead of the blank screen showing up later.
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
    // The url is hardcoded in the devtools build (../../entrypoints/... relative to the main chunk),
    // so it lands on the site root. When the file is missing devtools only console.errors — the
    // promise neither rejects nor times out — and the Response panel of a compressed response hangs
    // on auto-formatting forever, showing an empty editor.
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
    // The filename comes from the url, so ../ must not reach files outside the package
    const response = await fetch(`${util.getURL(app)}devtools/${encodeURIComponent('../../package.json')}`);
    expect(response.status).toEqual(404);
  });
});
