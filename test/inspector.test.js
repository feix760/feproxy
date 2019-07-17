
const getPort = require('get-port');
const WebSocket = require('ws');
const rp = require('request-promise');
const ProxyAgent = require('./util/ProxyAgent');
const util = require('./util/util');

class InspectorWS {
  constructor(url) {
    this.url = url;
    this.msgId = 0;
  }

  async open() {
    const client = await new Promise((resolve, reject) => {
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
      const { id, result, method, params } = JSON.parse(msg);
      if (id) {
        client.emit(`callback_${id}`, result);
      }
      if (method) {
        client.emit(`method_${method}`, params);
      }
    });

    this.client = client;
  }

  sendMsg(method, params, hasCallback = true) {
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
        resolve();
      }
    });
  }

  waitMethod(method) {
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
  let app;
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
      rp({
        url,
        method: 'GET',
        strictSSL: false,
        proxy: util.getURL(app),
      }),
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

    let client;
    const [ request ] = await Promise.all([
      inspector.waitMethod('Network.webSocketCreated'),
      // connect wsServer
      new Promise((resolve, reject) => {
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

    let response;
    try {
      response = await rp({
        url,
        strictSSL: false,
        proxy: util.getURL(app),
        resolveWithFullResponse: true,
      });
    } catch (err) {
      // test redirect will throw error
      response = err && err.response;
    }
    expect(response.statusCode).toEqual(404);

    inspector.close();

    try {
      response = await rp({
        url,
        strictSSL: false,
        proxy: util.getURL(app),
        resolveWithFullResponse: true,
      });
    } catch (err) {
      // test redirect will throw error
      response = err && err.response;
    }
    expect(response.statusCode).toEqual(200);
  });

  test('devtools static files', async () => {
    const response = await rp({
      url: `${util.getURL(app)}devtools/SupportedCSSProperties.js`,
    });

    expect(response).toBeTruthy();
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
      rp({
        url,
        gzip: true,
        strictSSL: false,
        proxy: util.getURL(app),
      }),
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
      rp({
        url,
        gzip: true,
        strictSSL: false,
        proxy: util.getURL(app),
      }),
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
