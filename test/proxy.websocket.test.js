
const getPort = require('get-port');
const WebSocket = require('ws');
const ProxyAgent = require('./ProxyAgent');
const util = require('./util');

describe('proxy websocket test', () => {
  let app;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('test websocket', async () => {
    const port = await getPort();
    const wss = new WebSocket.Server({ port });

    const serverMsg = 'something';
    wss.on('connection', req => {
      req.on('message', () => {
        req.send(serverMsg);
      });
    });

    let client;
    const msg = await new Promise((resolve, reject) => {
      client = new WebSocket(`ws://127.0.0.1:${port}/`, {
        agent: new ProxyAgent({
          proxy: {
            host: '127.0.0.1',
            port: app.config.port,
          },
        }),
      });

      client.on('open', () => {
        client.send('hello');
      });

      client.on('message', message => {
        resolve(message);
      });

      client.on('error', reject);
    });

    client.close();
    wss.close();

    expect(msg).toEqual(serverMsg);
  });
});
