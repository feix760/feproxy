import http from 'http';
import net from 'net';
import Koa from 'koa';
import extendContext from '../src/extend/context';
import type { ProxyContext } from '../src/types';

interface CtxOptions {
  /** 请求行里的路径, MITM 之后只有 /path */
  url: string;
  host?: string;
  /** ProxyServer 打在 server 上的标记, 直连自身站点时为空 */
  proxy?: { hostname: string; port: number };
  /** 是否是解密后的 tls 连接 */
  encrypted?: boolean;
  /** ws 隧道 */
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
    // http 代理的请求行本来就是绝对地址
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
    // 请求行的 host 与 header 不一致时以 header 为准
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
