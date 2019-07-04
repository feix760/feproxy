
function extendWebsocket(ws) {
  const originSend = ws.send;
  ws.send = obj => {
    if (typeof obj === 'object') {
      obj = JSON.stringify(obj);
    }
    originSend.call(ws, obj);
  };
}

// chrome inpect websocket
module.exports = async ctx => {
  const ws = await ctx.accept();

  extendWebsocket(ws);

  ctx.app.inspect.addClient(ws);
};
