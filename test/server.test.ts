import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import fs from 'fs-extra';
import getPort from 'get-port';
import WebSocket from 'ws';
import * as ca from '../src/server/ca';
import ServerFactory from '../src/server/ServerFactory';
import type { FeproxyApp } from '../src/types';
import ProxyAgent from './util/ProxyAgent';
import * as util from './util/util';

describe('root ca test', () => {
  const dir = path.join(__dirname, `.tmp/ca-${Math.random()}`);

  afterAll(async () => {
    await fs.remove(dir);
  });

  test('reuse root ca on disk', () => {
    // 第一次生成并落盘, 第二次直接读文件
    const created = ca.getRootCA('feproxy-test', dir);
    expect(fs.existsSync(path.join(dir, 'feproxy-test.key'))).toEqual(true);

    const loaded = ca.getRootCA('feproxy-test', dir);
    expect(loaded.pem).toEqual(created.pem);
    expect(loaded.cert.subject.getField('CN').value).toEqual('feproxy-test');
  });
});

describe('server factory test', () => {
  let app: FeproxyApp;
  let factory: ServerFactory;
  // 用自签证书(签发者不在信任链里)起的本地 https 服务
  let selfSigned: https.Server;
  let selfSignedPort: number;

  beforeAll(async () => {
    app = await util.startApp();
    factory = new ServerFactory(app);

    const { pem } = ca.createCertificate(factory.trustedRootCA, '127.0.0.1');
    selfSignedPort = await getPort();
    selfSigned = https.createServer({ key: pem.key, cert: pem.cert }, (req, res) => res.end('ok'));
    await new Promise<void>(resolve => selfSigned.listen(selfSignedPort, resolve));
  });

  afterAll(async () => {
    selfSigned.close();
    await util.stopApp(app);
  });

  test('root ca is loaded from RC_DIR', () => {
    // startApp 时已经生成过, 这里应该是读出来的同一份
    const another = new ServerFactory(app);
    expect(another.trustedRootCA.pem).toEqual(factory.trustedRootCA.pem);
    expect(another.untrustRootCA.pem).toEqual(factory.untrustRootCA.pem);
  });

  test('verify certificate of self hostname', async () => {
    expect(await factory.verifyCertificate(app.config.hostname, 443)).toEqual('SUCCESS');
  });

  test('verify certificate failed', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(await factory.verifyCertificate('127.0.0.1', selfSignedPort)).toEqual('FAIL');
    expect(log).toHaveBeenCalledWith('127.0.0.1', expect.stringMatching(/CERT|SIGNATURE/));

    log.mockRestore();
  });

  test('verify certificate error', async () => {
    // 连不上的端口不属于证书错误, 直接抛出
    const port = await getPort();
    await expect(factory.verifyCertificate('127.0.0.1', port))
      .rejects.toContain('ECONNREFUSED');
  });

  test('cache tsl server', async () => {
    const server = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });

    expect(server).toBeInstanceOf(https.Server);
    // 命中缓存
    expect(await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort })).toBe(server);
  });

  test('remove cache when create tsl server failed', async () => {
    const port = await getPort();

    await expect(factory.getTSLServer({ hostname: '127.0.0.1', port })).rejects.toBeTruthy();
    // 失败的 promise 不能留在缓存里, 否则之后永远拿到失败结果
    expect(factory.tslServers.peek(`:127.0.0.1:${port}`)).toBeUndefined();
    expect(factory.certs.peek(`127.0.0.1:${port}`)).toBeUndefined();
  });

  test('close tsl server on evict', async () => {
    const server = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });
    const close = jest.spyOn(server, 'close');

    // server 实例带着原生 TLS context, 淘汰时必须 close 才能释放
    factory.tslServers.clear();
    await new Promise(resolve => setImmediate(resolve));

    expect(close).toHaveBeenCalled();
  });

  test('reuse cached certificate after server evicted', async () => {
    const verify = jest.spyOn(factory, 'verifyCertificate');

    // server 被淘汰后重建, 证书还在缓存里, 不该再验一次上游证书
    const rebuilt = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });

    expect(rebuilt).toBeInstanceOf(https.Server);
    expect(verify).not.toHaveBeenCalled();

    verify.mockRestore();
  });

  test('cache http server', async () => {
    const server = await factory.getHTTPServer();

    expect(server).toBeInstanceOf(http.Server);
    expect(await factory.getHTTPServer()).toBe(server);
  });

  test('share one ws server for all servers', async () => {
    const httpServer = await factory.getHTTPServer();
    const tslServer = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });

    // 以前是每个 server 一个 ws.Server, 现在共用一个 noServer 实例
    expect(app.ws.getServer()).toBe(app.ws.server);
    expect(httpServer.listenerCount('upgrade')).toEqual(1);
    expect(tslServer.listenerCount('upgrade')).toEqual(1);
  });
});

describe('websocket server test', () => {
  let app: FeproxyApp;
  let wsServer: WebSocket.Server;
  let wsPort: number;

  const proxyWS = (url: string) => new WebSocket(url, {
    agent: new ProxyAgent({
      proxy: {
        host: '127.0.0.1',
        port: app.config.port,
      },
    }),
  });

  beforeAll(async () => {
    app = await util.startApp();

    wsPort = await getPort();
    wsServer = new WebSocket.Server({ port: wsPort });
    // 上游握手响应里带一个自定义头, 转发时应该被带回客户端
    wsServer.on('headers', headers => headers.push('x-upstream: 1'));
  });

  afterAll(async () => {
    wsServer.close();
    await util.stopApp(app);
  });

  test('push response headers of upstream', async () => {
    const client = proxyWS(`ws://127.0.0.1:${wsPort}/`);

    const headers = await new Promise<Record<string, any>>((resolve, reject) => {
      client.once('upgrade', res => resolve(res.headers));
      client.once('error', reject);
    });

    expect(headers['x-upstream']).toEqual('1');
    client.close();
  });

  test('404 when no middleware accept', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${app.config.port}/not-exists`);

    const err = await new Promise<Error>(resolve => client.once('error', resolve));

    expect(err.message).toContain('404');
  });

  test('500 when middleware throw', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    // 上游不是 ws 服务, 握手失败, 代理插件抛错
    const httpPort = await getPort();
    const upstream = http.createServer((req, res) => res.end('not a websocket'));
    await new Promise<void>(resolve => upstream.listen(httpPort, resolve));

    const client = proxyWS(`ws://127.0.0.1:${httpPort}/`);
    const err = await new Promise<Error>(resolve => client.once('error', resolve));

    expect(err.message).toContain('500');
    expect(error).toHaveBeenCalled();

    upstream.close();
    error.mockRestore();
  });
});

describe('proxy server test', () => {
  let app: FeproxyApp;

  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('destroy socket of unrecognized protocol', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const socket = net.connect(app.config.port, '127.0.0.1');
    await new Promise<void>(resolve => socket.once('connect', () => resolve()));

    // 既不是 TLS(0x16) 也不是可打印的 HTTP 请求行
    socket.write(Buffer.from([ 0x01 ]));

    await new Promise<void>(resolve => socket.once('close', () => resolve()));

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Unrecognized protocol',
    }));

    log.mockRestore();
  });
});
