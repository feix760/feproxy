
const WebSocket = require('ws');

module.exports = async ctx => {
  let ws,
    res;
  function onclose() {
    ws && ws.close();
    res && res.close();
  }

  const reqHeaders = {};
  Object.keys(ctx.req.headers).forEach(key => {
    if (!/^sec-websocket-/i.test(key)) {
      reqHeaders[key] = ctx.req.headers[key];
    }
  });
  res = new WebSocket(ctx.url, {
    headers: reqHeaders,
  });

  let hangList = [];
  res.once('close', onclose)
    .once('error', onclose)
    .on('message', msg => {
      try {
        hangList ? hangList.push(msg) : ws.send(msg);
      } catch (err) {
        onclose();
      }
    });

  const resHeaders = await new Promise((resolve, reject) => {
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
    .on('message', msg => {
      try {
        res.send(msg);
      } catch (err) {
        onclose();
      }
    });

  // only for inspect TODO
  process.nextTick(() => {
    hangList.forEach(msg => ws.send(msg));
    hangList = null;
  });
};
