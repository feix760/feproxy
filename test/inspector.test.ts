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
      const { id, result, method, params } = JSON.parse(msg as string);
      if (id) {
        client.emit(`callback_${id}`, result);
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
      inspector.sendMsg('Page.enable'),
      inspector.sendMsg('Page.getResourceTree'),
      inspector.sendMsg('Page.getResourceContent'),
    ]);

    expect(ret[0].result).toEqual(true);
    expect(ret[1].result).toEqual(false);
    expect(ret[2].frameTree).toBeTruthy();
    expect(ret[3].content).toBeTruthy();

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
    const response = await fetch(`${util.getURL(app)}devtools/SupportedCSSProperties.js`);

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
});
