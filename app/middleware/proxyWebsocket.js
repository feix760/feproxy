
const WebSocket = require('ws');

module.exports = async ctx => {
  const ws = ctx.websocket;
  const res = new WebSocket(ctx.url);

  res.on('open', () => {
    ws.on('message', msg => {
      try {
        res.send(msg);
      } catch (err) {
        onclose();
      }
    });
  });

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

  ctx.websocket.response = res;
};
