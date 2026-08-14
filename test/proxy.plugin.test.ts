import http from 'http';
import getPort from 'get-port';
import fetch from 'node-fetch';
import type { FeproxyApp, Rule } from '../src/types';
import * as util from './util/util';

describe('proxy plugin branch test', () => {
  let app: FeproxyApp;
  let upstream: http.Server;
  let upstreamURL: string;

  const setRule = (rule: Partial<Rule>) => {
    return app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: '127\\.0\\.0\\.1',
          ...rule,
        } as Rule ],
      } ],
    });
  };

  const proxyFetch = (path = '/', options = {}) => fetch(`${upstreamURL}${path}`, {
    agent: util.getProxyAgent(app),
    ...options,
  });

  beforeAll(async () => {
    app = await util.startApp();

    const port = await getPort();
    upstreamURL = `http://127.0.0.1:${port}`;
    upstream = http.createServer((req, res) => {
      if (req.url === '/echo') {
        req.pipe(res);
        return;
      }
      if (req.url === '/no-content-type') {
        // Upstream sends no content-type, and koa must not invent one
        res.writeHead(200);
        res.end('no-content-type');
        return;
      }
      if (req.url === '/with-length') {
        res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '2' });
        res.end(req.method === 'HEAD' ? undefined : 'ok');
        return;
      }
      if (req.url === '/304') {
        res.writeHead(304, { etag: 'W/"abc"' });
        res.end();
        return;
      }
      res.setHeader('content-type', 'text/plain');
      res.end('ok');
    });
    await new Promise<void>(resolve => upstream.listen(port, resolve));
  });

  afterAll(async () => {
    upstream.close();
    await util.stopApp(app);
  });

  test('forward without any rule', async () => {
    await app.config.update({ projects: [] });
    const response = await proxyFetch();

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('ok');
  });

  test('forward post body', async () => {
    const response = await proxyFetch('/echo', {
      method: 'POST',
      body: 'hello',
    });

    expect(await response.text()).toEqual('hello');
  });

  test('forward head request', async () => {
    const response = await proxyFetch('/', { method: 'HEAD' });

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('');
  });

  test('keep upstream content-length for head request', async () => {
    // A HEAD response's headers must match GET's, so this path can't set ctx.body: koa's body setter
    // rewrites content-length from the body length, and '' would turn this into 0
    const response = await proxyFetch('/with-length', { method: 'HEAD' });

    expect(response.headers.get('content-length')).toEqual('2');
    expect(await response.text()).toEqual('');
  });

  test('forward 304 without body', async () => {
    const response = await proxyFetch('/304');

    expect(response.status).toEqual(304);
    expect(response.headers.get('etag')).toEqual('W/"abc"');
    expect(await response.text()).toEqual('');
  });

  test('keep empty content-type', async () => {
    const response = await proxyFetch('/no-content-type');

    expect(response.headers.get('content-type')).toEqual(null);
    expect(await response.text()).toEqual('no-content-type');
  });

  test('500 when upstream is unreachable', async () => {
    // A port nobody listens on
    const port = await getPort();
    await setRule({ type: 'host', param: { port } });

    const response = await proxyFetch();

    expect(response.status).toEqual(500);
    expect(await response.text()).toEqual('ECONNREFUSED');
  });

  test('host rule without hostname and port', async () => {
    await setRule({ type: 'host', param: {} });

    expect(await (await proxyFetch()).text()).toEqual('ok');
  });

  test('delay rule without delay', async () => {
    await setRule({ type: 'delay', param: { delay: '' } });

    const st = Date.now();
    expect(await (await proxyFetch()).text()).toEqual('ok');
    expect(Date.now() - st).toBeLessThan(1000);
  });

  test('header rule with empty value', async () => {
    await setRule({ type: 'header', param: { 'x-empty': '' } });

    expect((await proxyFetch()).headers.get('x-empty')).toEqual('');
  });

  test('file rule with missing path', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await setRule({ type: 'file', param: { path: '/not/exists/feproxy.js' } });

    expect((await proxyFetch()).status).toEqual(404);

    await setRule({ type: 'file', param: {} });
    expect((await proxyFetch()).status).toEqual(404);

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test('match reference in param', async () => {
    await setRule({
      type: 'header',
      match: '127\\.0\\.0\\.1:(\\d+)',
      param: { 'x-port': '$1', 'x-miss': '$9', 'x-num': 1 },
    });

    const response = await proxyFetch();
    expect(response.headers.get('x-port')).toEqual(`${upstreamURL.split(':').pop()}`);
    expect(response.headers.get('x-miss')).toEqual('$9');
    expect(response.headers.get('x-num')).toEqual('1');
  });

  test('warn unsupported rule type', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await setRule({ type: 'unsupported', param: {} });

    expect(await (await proxyFetch()).text()).toEqual('ok');
    expect(warn).toHaveBeenCalledWith('unsupported proxy plugin', expect.objectContaining({
      type: 'unsupported',
    }));
    warn.mockRestore();
  });
});
