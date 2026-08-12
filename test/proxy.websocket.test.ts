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

      // ws 8 起 message 固定是 Buffer, 文本帧靠 isBinary 区分
      client.on('message', (message, binary) => {
        resolve({ msg: message, isBinary: binary });
      });

      client.on('error', reject);
    });

    client.close();
    wss.close();

    expect(msg.toString()).toEqual(serverMsg);
    // 转发不能把文本帧变成二进制帧
    expect(isBinary).toEqual(false);
  });
});
