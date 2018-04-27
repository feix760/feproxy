
const WebSocket = require('ws');

module.exports = async ctx => {
  const ws = ctx.websocket;
  const headers = {};

  Object.keys(ctx.req.headers).forEach(key => {
    if (!/^sec-websocket-/i.test(key)) {
      headers[key] = ctx.req.headers[key];
    }
  });

  let res;
  const msgList = [];
  ws.on('message', msg => {
    try {
      res ? res.send(msg) : msgList.push(msg);
    } catch (err) {
      onclose();
    }
  });

  res = await new Promise((resolve, reject) => {
    const ws = new WebSocket(ctx.url, {
      headers,
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });

  msgList.forEach(msg => res.send(msg));

  res.on('message', msg => {
    try {
      ws.send(msg);
    } catch (err) {
      onclose();
    }
  });

  const onclose = () => {
    ws.close();
    res.close();
  };

  res.on('close', onclose)
    .on('error', onclose);

  ws.on('close', onclose)
    .on('error', onclose);

  // set for inspect
  ws.proxy = {
    res,
  };
};
