
const WebSocket = require('ws');

module.exports = async ctx => {
  const ws = ctx.websocket;

  const headers = {};
  Object.keys(ctx.req.headers).forEach(key => {
    if (!/^sec-websocket-/i.test(key)) {
      headers[key] = ctx.req.headers[key];
    }
  });
  const res = new WebSocket(ctx.url, {
    headers,
  });

  function onclose() {
    ws.close();
    res.close();
  }

  res.on('close', onclose)
    .on('error', onclose)
    .on('message', msg => {
      try {
        ws.send(msg);
      } catch (err) {
        onclose();
      }
    });

  let hangList = [];
  ws.on('close', onclose)
    .on('error', onclose)
    .on('message', msg => {
      try {
        hangList ? hangList.push(msg) : res.send(msg);
      } catch (err) {
        onclose();
      }
    });

  try {
    await new Promise((resolve, reject) => {
      res.once('open', resolve)
        .once('error', reject);
    });
  } catch (err) {
    console.error(err.toString());
    return;
  }

  hangList.forEach(msg => res.send(msg));
  hangList = null;
};
