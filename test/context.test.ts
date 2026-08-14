import http from 'http';
import net from 'net';
import Koa from 'koa';
import extendContext from '../src/extend/context';
import type { ProxyContext } from '../src/types';

interface CtxOptions {
  /** Path from the request line; after MITM it's only /path */
  url: string;
  host?: string;
  /** The marker ProxyServer puts on the server; empty for direct hits on our own site */
  proxy?: { hostname: string; port: number };
  /** Whether this is a decrypted tls connection */
  encrypted?: boolean;
  /** ws tunnel */
  websocket?: boolean;
}

const app = new Koa() as any;
extendContext(app);

function createCtx(options: CtxOptions): ProxyContext {
  const socket = new net.Socket();
  (socket as any).server = { proxy: options.proxy };
  (socket as any).encrypted = options.encrypted;

  const req = new http.IncomingMessage(socket);
  req.url = options.url;
  req.headers = options.host ? { host: options.host } : {};

  const ctx = app.createContext(req, new http.ServerResponse(req));
  if (options.websocket) {
    ctx.websocket = {};
  }
  return ctx;
}

describe('context url test', () => {
  test('rebuild https url', () => {
    expect(createCtx({
      url: '/a/b?c=1',
      proxy: { hostname: 'a.com', port: 443 },
      encrypted: true,
    }).url).toEqual('https://a.com/a/b?c=1');
  });

  test('keep non default port', () => {
    expect(createCtx({
      url: '/a/b',
      proxy: { hostname: 'a.com', port: 8443 },
      encrypted: true,
    }).url).toEqual('https://a.com:8443/a/b');
  });

  test('rebuild wss url', () => {
    expect(createCtx({
      url: '/socket',
      proxy: { hostname: 'a.com', port: 443 },
      encrypted: true,
      websocket: true,
    }).url).toEqual('wss://a.com/socket');
  });

  test('keep absolute url', () => {
    // An http proxy's request line is already absolute
    expect(createCtx({
      url: 'https://a.com/a/b',
      proxy: { hostname: 'b.com', port: 443 },
      encrypted: true,
    }).url).toEqual('https://a.com/a/b');
  });

  test('keep url of feproxy self site', () => {
    expect(createCtx({ url: '/getConfig' }).url).toEqual('/getConfig');
  });

  test('replace host with header host', () => {
    // When request line and header disagree on the host, the header wins
    expect(createCtx({
      url: 'http://a.com/a/b',
      host: 'b.com',
    }).url).toEqual('http://b.com/a/b');
  });

  test('keep url when host matched', () => {
    expect(createCtx({
      url: 'http://a.com/a/b',
      host: 'a.com',
    }).url).toEqual('http://a.com/a/b');
  });

  test('cache url', () => {
    const ctx = createCtx({ url: '/a', proxy: { hostname: 'a.com', port: 443 }, encrypted: true });
    expect(ctx.url).toEqual('https://a.com/a');
    ctx.req.url = '/b';
    expect(ctx.url).toEqual('https://a.com/a');
  });
});

describe('context routerPath test', () => {
  test('remove querystring but keep protocol', () => {
    const ctx = createCtx({
      url: '/a/b?c=1',
      proxy: { hostname: 'a.com', port: 443 },
      encrypted: true,
    });
    expect(ctx.routerPath).toEqual('https://a.com/a/b');
    expect(ctx.newRouterPath).toEqual('https://a.com/a/b');
  });

  test('swallow routerPath assignment from @koa/router', () => {
    const ctx = createCtx({ url: '/getConfig' });
    expect(() => {
      (ctx as any).routerPath = '/log';
    }).not.toThrow();
    expect(ctx.routerPath).toEqual('/getConfig');
  });
});
