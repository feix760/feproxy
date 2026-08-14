import getPort from 'get-port';
import WebSocket from 'ws';
import type { FeproxyApp } from '../src/types';
import ProxyAgent from './util/ProxyAgent';
import * as util from './util/util';

describe('proxy websocket test', () => {
  let app: FeproxyApp;
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

    let client: WebSocket;
    const { msg, isBinary } = await new Promise<any>((resolve, reject) => {
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

      // Since ws 8, message is always a Buffer; text frames are told apart by isBinary
      client.on('message', (message, binary) => {
        resolve({ msg: message, isBinary: binary });
      });

      client.on('error', reject);
    });

    client.close();
    wss.close();

    expect(msg.toString()).toEqual(serverMsg);
    // Forwarding must not turn a text frame into a binary one
    expect(isBinary).toEqual(false);
  });
});
