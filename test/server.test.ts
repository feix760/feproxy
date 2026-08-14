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
    // The first call generates and writes it, the second one just reads the file
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
  // A local https server using a self-signed certificate (its issuer isn't in the trust chain)
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
    // startApp already generated it, so this should read back the very same one
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
    // An unreachable port isn't a certificate error, so it's thrown
    const port = await getPort();
    await expect(factory.verifyCertificate('127.0.0.1', port))
      .rejects.toContain('ECONNREFUSED');
  });

  test('cache tsl server', async () => {
    const server = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });

    expect(server).toBeInstanceOf(https.Server);
    // Cache hit
    expect(await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort })).toBe(server);
  });

  test('remove cache when create tsl server failed', async () => {
    const port = await getPort();

    await expect(factory.getTSLServer({ hostname: '127.0.0.1', port })).rejects.toBeTruthy();
    // A rejected promise must not stay cached, or every later call gets the same failure
    expect(factory.tslServers.peek(`:127.0.0.1:${port}`)).toBeUndefined();
    expect(factory.certs.peek(`127.0.0.1:${port}`)).toBeUndefined();
  });

  test('close tsl server on evict', async () => {
    const server = await factory.getTSLServer({ hostname: '127.0.0.1', port: selfSignedPort });
    const close = jest.spyOn(server, 'close');

    // A server instance holds a native TLS context, which is only released by close() on evict
    factory.tslServers.clear();
    await new Promise(resolve => setImmediate(resolve));

    expect(close).toHaveBeenCalled();
  });

  test('reuse cached certificate after server evicted', async () => {
    const verify = jest.spyOn(factory, 'verifyCertificate');

    // The server is rebuilt after eviction, but the certificate is still cached, so the upstream one
    // shouldn't be verified again
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

    // It used to be one ws.Server per server; now a single noServer instance is shared
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
    // A custom header on the upstream handshake response should make it back to the client
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

    // Upstream isn't a ws server, so the handshake fails and the proxy plugin throws
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

    // Neither TLS (0x16) nor a printable HTTP request line
    socket.write(Buffer.from([ 0x01 ]));

    await new Promise<void>(resolve => socket.once('close', () => resolve()));

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Unrecognized protocol',
    }));

    log.mockRestore();
  });
});
