
const service = require('../service');

function extendWebsocket(ws) {
  ws._send = ws._send || ws.send;
  ws.send = obj => {
    if (typeof obj === 'object') {
      obj = JSON.stringify(obj);
    }
    ws._send(obj);
  };
};

module.exports = ctx => {
  const ws = ctx.websocket;

  extendWebsocket(ws);

  service.inspect.addClient(ws);
};
