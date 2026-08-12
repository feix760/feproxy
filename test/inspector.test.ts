import http from 'http';
import getPort from 'get-port';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import type { FeproxyApp } from '../src/types';
import ProxyAgent from './util/ProxyAgent';
import * as util from './util/util';

class InspectorWS {
  url: string;
  msgId: number;
  client: WebSocket;

  constructor(url: string) {
    this.url = url;
    this.msgId = 0;
  }

  async open() {
    const client = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);

      ws.on('open', () => {
        ws.removeEventListener('error', reject);
        resolve(ws);
      });

      ws.on('error', reject);
    });

    client.on('error', err => {
      console.error(err);
      process.exit(1);
    });

    client.on('message', msg => {
      const { id, result, error, method, params } = JSON.parse(msg as string);
      if (id) {
        // 没实现的方法回的是协议 error, 没有 result
        client.emit(`callback_${id}`, error ? { error } : result);
      }
      if (method) {
        client.emit(`method_${method}`, params);
      }
    });

    this.client = client;
  }

  sendMsg(method: string, params?: any, hasCallback = true): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.client.send(JSON.stringify({
        id,
        method,
        params,
      }));

      if (hasCallback) {
        const timer = setTimeout(() => reject('wait callback timeout'), 5000);
        this.client.on(`callback_${id}`, msg => {
          clearTimeout(timer);
          resolve(msg);
        });
      } else {
        resolve(undefined);
      }
    });
  }

  waitMethod(method: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject('wait method timeout'), 10000);
      this.client.once(`method_${method}`, msg => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  close() {
    this.client.close();
  }
}

describe('inspect test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('inspect http test', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    expect(inspector.client).toBeTruthy();

    const ret = await Promise.all([
      inspector.sendMsg('Network.enable'),
      inspector.sendMsg('Page.getResourceTree'),
      inspector.sendMsg('Page.getResourceContent'),
    ]);

    expect(ret[0].result).toEqual(true);
    expect(ret[1].frameTree).toBeTruthy();
    expect(ret[2].content).toBeTruthy();

    const url = util.getTestURL();
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      fetch(url, {
        method: 'GET',
        agent: util.getProxyAgent(app),
      }).then(res => res.text()),
    ]);

    expect(request.requestId).toBeTruthy();

    const response = await inspector.sendMsg('Network.getResponseBody', {
      requestId: request.requestId,
    });

    expect(response.body).toBeTruthy();

    inspector.close();
  });

  test('inspect websockt test', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    const port = await getPort();
    const wsServer = new WebSocket.Server({ port });

    wsServer.on('connection', req => {
      req.on('message', msg => {
        req.send('server msg');
        wsServer.emit('client_message', msg);
      });
    });

    let client: WebSocket;
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.webSocketCreated'),
      // connect wsServer
      new Promise<void>((resolve, reject) => {
        client = new WebSocket(`ws://127.0.0.1:${port}/`, {
          agent: new ProxyAgent({
            proxy: {
              host: '127.0.0.1',
              port: app.config.port,
            },
          }),
        });

        client.on('open', () => {
          client.removeEventListener('error', reject);
          resolve();
        });

        client.once('error', reject);
      }),
    ]);

    expect(request.requestId).toBeTruthy();

    const [
      msgServerReceived,
      msgClientReceived,
      webSocketFrameSent,
      webSocketFrameReceived,
    ] = await Promise.all([
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject('wait client message timeout'), 5000);
        wsServer.once('client_message', msg => {
          clearTimeout(timer);
          resolve(msg);
        });
      }),
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject('wait server message timeout'), 5000);
        client.send('client msg');
        client.once('message', msg => {
          clearTimeout(timer);
          resolve(msg);
        });
      }),
      inspector.waitMethod('Network.webSocketFrameSent'),
      inspector.waitMethod('Network.webSocketFrameReceived'),
    ]);

    expect(webSocketFrameSent.response).toBeTruthy();
    expect(webSocketFrameReceived.response).toBeTruthy();
    expect(msgServerReceived).toBeTruthy();
    expect(msgClientReceived).toBeTruthy();

    client.close();
    wsServer.close();

    inspector.close();
  });

  test('blocked URLs test', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    expect(inspector.client).toBeTruthy();

    const url = util.getTestURL();
    await inspector.sendMsg('Network.setBlockedURLs', {
      urls: [ url ],
    });

    let response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    await response.text();
    expect(response.status).toEqual(404);

    inspector.close();

    response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    await response.text();
    expect(response.status).toEqual(200);
  });

  test('devtools static files', async () => {
    const response = await fetch(`${util.getURL(app)}devtools/Images.js`);

    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('gzip test', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    const url = util.getTestURL();
    const [
      responseReceived,
      loadingFinished,
      response,
    ] = await Promise.all([
      inspector.waitMethod('Network.responseReceived'),
      inspector.waitMethod('Network.loadingFinished'),
      // node-fetch 默认带 accept-encoding: gzip,deflate
      fetch(url, {
        agent: util.getProxyAgent(app),
      }).then(res => res.text()),
    ]);

    expect(/gzip/i.test(responseReceived.response.requestHeaders['accept-encoding'])).toEqual(true);
    expect(loadingFinished.encodedDataLength).toBeTruthy();
    expect(response).toBeTruthy();

    inspector.close();
  });

  test('Network.replayXHR test', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    const url = util.getTestURL();

    const [ requestSendInfo ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      fetch(url, {
        agent: util.getProxyAgent(app),
      }).then(res => res.text()),
    ]);

    expect(requestSendInfo.requestId).toBeTruthy();

    const [ requestSendInfo2 ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      inspector.sendMsg('Network.replayXHR', {
        requestId: requestSendInfo.requestId,
      }),
      inspector.waitMethod('Network.loadingFinished'),
    ]);

    expect(requestSendInfo.request).toEqual(requestSendInfo2.request);
    inspector.close();
  });
});

describe('inspect local upstream test', () => {
  let app: FeproxyApp;
  let inspector: InspectorWS;
  let upstream: http.Server;
  let upstreamURL: string;

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8AAAwAB/AF+3ksHAAAAAElFTkSuQmCC',
    'base64',
  );

  const proxyFetch = (path: string, options = {}) => fetch(`${upstreamURL}${path}`, {
    agent: util.getProxyAgent(app),
    ...options,
  });

  beforeAll(async () => {
    app = await util.startApp();

    const port = await getPort();
    upstreamURL = `http://127.0.0.1:${port}`;
    upstream = http.createServer((req, res) => {
      if (req.url === '/sse') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: sse message\n\n');
        setTimeout(() => res.end(), 100);
        return;
      }
      if (req.url === '/slow') {
        // 响应头先到, 响应体拖一会儿, 用来模拟「还在传输中」的请求
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.write('slow ');
        setTimeout(() => res.end('body'), 300);
        return;
      }
      if (req.url === '/png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
        return;
      }
      if (req.url === '/304' || req.url === '/204') {
        res.writeHead(Number(req.url.slice(1)));
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: 1 }));
    });
    await new Promise<void>(resolve => upstream.listen(port, resolve));

    inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);
    await inspector.open();
  });

  afterAll(async () => {
    inspector.close();
    upstream.close();
    await util.stopApp(app);
  });

  test('read post body', async () => {
    const postData = JSON.stringify({ a: 1 });
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      proxyFetch('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: postData,
      }).then(res => res.text()),
    ]);

    expect(request.request.postData).toEqual(postData);
  });

  test('send eventSourceMessageReceived for sse', async () => {
    const [ message ] = await Promise.all([
      inspector.waitMethod('Network.eventSourceMessageReceived'),
      proxyFetch('/sse').then(res => res.text()),
    ]);

    expect(message.data).toContain('sse message');
  });

  test('response body of image is base64 encoded', async () => {
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      inspector.waitMethod('Network.loadingFinished'),
      proxyFetch('/png').then(res => res.buffer()),
    ]);

    const response = await inspector.sendMsg('Network.getResponseBody', {
      requestId: request.requestId,
    });

    expect(response.base64Encoded).toEqual(true);
    expect(response.body).toEqual(png.toString('base64'));
  });

  test('loadingFinished without response body', async () => {
    const [ loadingFinished ] = await Promise.all([
      inspector.waitMethod('Network.loadingFinished'),
      proxyFetch('/', { method: 'HEAD' }),
    ]);

    expect(loadingFinished.encodedDataLength).toEqual(0);
  });

  test.each([ 304, 204 ])('loadingFinished immediately for %i', async status => {
    // 这些状态码没有响应体, koa 直接 res.end(), 挂在 ctx.body 上的流会被 destroy ——
    // 之前 proxy/http.ts 照样挂了流, 读它等不到 'end', 于是 devtools 一直收不到 loadingFinished
    // (请求永远是 pending), streamResourceContent 也要干等满 STREAM_TIMEOUT
    const [ request, responseReceived, loadingFinished, response ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      inspector.waitMethod('Network.responseReceived'),
      inspector.waitMethod('Network.loadingFinished'),
      proxyFetch(`/${status}`),
    ]);

    expect(response.status).toEqual(status);
    expect(loadingFinished.encodedDataLength).toEqual(0);

    // devtools 的 Time 列判的是 `duration = loadingFinished.timestamp - timing.requestTime > 0`,
    // 算出 0 就显示 Pending。timing.requestTime 会覆盖 startTime, 所以它必须是请求开始的时刻,
    // 给「响应头到达的时刻」的话没有响应体的响应就正好是 0
    expect(responseReceived.response.timing.requestTime).toEqual(request.timestamp);
    expect(loadingFinished.timestamp).toBeGreaterThan(request.timestamp);

    // 已经结束了, 这里不该再等
    const streamed = await inspector.sendMsg('Network.streamResourceContent', {
      requestId: request.requestId,
    });
    expect(streamed).toEqual({ bufferedData: '' });
  });

  test('response timing has non zero latency', async () => {
    // receiveHeadersEnd 是相对 requestTime 的毫秒偏移, devtools 的 latency 就靠它算,
    // 之前写死 0, Time 列的副标题永远是 0ms
    const [ request, responseReceived ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      inspector.waitMethod('Network.responseReceived'),
      proxyFetch('/slow').then(res => res.text()),
    ]);

    const { timing } = responseReceived.response;
    expect(timing.requestTime).toEqual(request.timestamp);
    expect(timing.receiveHeadersEnd).toBeGreaterThan(0);
  });

  test('loadingFinished for response without content-type', async () => {
    // status 规则的响应没有 content-type, 读响应体时不能因此抛错
    await app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: '127\\.0\\.0\\.1',
          type: 'status',
          param: { status: 404 },
        } ],
      } ],
    });

    const [ loadingFinished, response ] = await Promise.all([
      inspector.waitMethod('Network.loadingFinished'),
      proxyFetch('/'),
    ]);

    expect(response.status).toEqual(404);
    expect(loadingFinished.encodedDataLength).toEqual(0);

    await app.config.update({ projects: [] });
  });

  test('empty response body of unknown request', async () => {
    const response = await inspector.sendMsg('Network.getResponseBody', {
      requestId: 'not-exists',
    });

    expect(response).toEqual({ base64Encoded: false, body: '' });
  });

  test('warn broken devtools message', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    inspector.client.send('not a json message');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(warn).toHaveBeenCalledWith('Parse devtool message error', expect.anything());
    warn.mockRestore();
  });

  test('streamResourceContent of an in-flight request', async () => {
    const responsePromise = proxyFetch('/slow');
    const request = await inspector.waitMethod('Network.requestWillBeSent');

    // 响应体还没读完就来问内容, devtools 点开传输中的请求时就是这样;
    // 这里不能回 error, 否则前端把失败的结果缓存起来, 那条请求的 Preview/Response 永远是空的
    const streamed = inspector.sendMsg('Network.streamResourceContent', {
      requestId: request.requestId,
    });

    expect(await (await responsePromise).text()).toEqual('slow body');

    const ret = await streamed;
    expect(Buffer.from(ret.bufferedData, 'base64').toString()).toEqual('slow body');
  });

  test('streamResourceContent of a finished request', async () => {
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.requestWillBeSent'),
      inspector.waitMethod('Network.loadingFinished'),
      proxyFetch('/').then(res => res.text()),
    ]);

    const ret = await inspector.sendMsg('Network.streamResourceContent', {
      requestId: request.requestId,
    });

    expect(Buffer.from(ret.bufferedData, 'base64').toString()).toEqual(JSON.stringify({ ok: 1 }));
  });

  test('streamResourceContent of unknown request', async () => {
    const ret = await inspector.sendMsg('Network.streamResourceContent', {
      requestId: 'not-exists',
    });

    expect(ret.bufferedData).toEqual('');
  });

  test('unimplemented method returns protocol error', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.FEPROXY_CDP_DEBUG = '1';

    // devtools 前端启动时会发几十条 feproxy 没实现的命令(Overlay/Debugger/Target...),
    // 必须回协议 error, 回「成功但结果为空」会让前端直接抛 TypeError
    const ret = await inspector.sendMsg('Overlay.enable');

    delete process.env.FEPROXY_CDP_DEBUG;

    expect(ret.error).toEqual({
      code: -32601,
      message: `'Overlay.enable' wasn't found`,
    });
    expect(log).toHaveBeenCalledWith('CDP >', 'Overlay.enable', 'MISSING');

    log.mockRestore();
  });

  test('replayXHR of unknown request', async () => {
    const response = await inspector.sendMsg('Network.replayXHR', {
      requestId: 'not-exists',
    });

    expect(response.result).toEqual(false);
  });
});

describe('inspect disabled test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp({ inspect: false });
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('should not send events when inspect is disabled', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    let received = false;
    inspector.client.on('method_Network.requestWillBeSent', () => {
      received = true;
    });

    // 关闭抓包后请求依然可以正常转发
    const response = await fetch(util.getTestURL(), {
      agent: util.getProxyAgent(app),
    });

    expect(await response.text()).toBeTruthy();

    // 等一会儿, 确认没有事件推送到 devtools
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(received).toEqual(false);

    inspector.close();
  });

  test('should not send websocket events when inspect is disabled', async () => {
    const inspector = new InspectorWS(`ws://127.0.0.1:${app.config.port}/ws`);

    await inspector.open();

    let received = false;
    inspector.client.on('method_Network.webSocketCreated', () => {
      received = true;
    });

    const port = await getPort();
    const wsServer = new WebSocket.Server({ port });
    wsServer.on('connection', socket => {
      socket.on('message', () => socket.send('server msg'));
    });

    let client: WebSocket;
    const msg = await new Promise<any>((resolve, reject) => {
      client = new WebSocket(`ws://127.0.0.1:${port}/`, {
        agent: new ProxyAgent({
          proxy: {
            host: '127.0.0.1',
            port: app.config.port,
          },
        }),
      });

      client.on('open', () => client.send('client msg'));
      client.on('message', resolve);
      client.on('error', reject);
    });

    // 关闭抓包后 ws 依然可以正常转发
    expect(msg.toString()).toEqual('server msg');

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(received).toEqual(false);

    client.close();
    wsServer.close();
    inspector.close();
  });
});
