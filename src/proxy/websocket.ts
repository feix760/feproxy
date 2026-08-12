import WebSocket from 'ws';
import type { ProxyPluginFn } from '../types';

const websocket: ProxyPluginFn = async ctx => {
  let ws: WebSocket,
    res: WebSocket;
  function onclose() {
    ws && ws.close();
    res && res.close();
  }

  const reqHeaders = {};
  Object.keys(ctx.req.headers).forEach(key => {
    // 代理验证头不应转发给上游
    if (!/^sec-websocket-/i.test(key) && key.toLowerCase() !== 'proxy-authorization') {
      reqHeaders[key] = ctx.req.headers[key];
    }
  });
  res = new WebSocket(ctx.url, {
    headers: reqHeaders,
  });

  // ws 8 起 message 事件固定给 Buffer, 文本帧要靠 isBinary 判断, 否则转发会变成二进制帧
  let hangList: [WebSocket.RawData, boolean][] = [];
  res.once('close', onclose)
    .once('error', onclose)
    .on('message', (msg, isBinary) => {
      try {
        hangList ? hangList.push([ msg, isBinary ]) : ws.send(msg, { binary: isBinary });
      } catch (err) {
        onclose();
      }
    });

  const resHeaders = await new Promise<Record<string, any>>((resolve, reject) => {
    let headers;
    res.once('upgrade', response => {
      headers = response.headers;
    })
      .once('open', () => resolve(headers))
      .once('error', reject);
  });

  // set response headers
  Object.keys(resHeaders).forEach(key => {
    if (!/^sec-websocket-/i.test(key)) {
      ctx.set(key, resHeaders[key]);
    }
  });

  // handshake
  ws = await ctx.accept();

  ws.once('close', onclose)
    .once('error', onclose)
    .on('message', (msg, isBinary) => {
      try {
        res.send(msg, { binary: isBinary });
      } catch (err) {
        onclose();
      }
    });

  // only for inspect TODO
  process.nextTick(() => {
    hangList.forEach(([ msg, isBinary ]) => ws.send(msg, { binary: isBinary }));
    hangList = null;
  });
};

export default websocket;
