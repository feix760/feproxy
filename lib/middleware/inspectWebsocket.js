
module.exports = async (ctx, next) => {
  ctx.app.inspect.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  ctx.app.inspect.emit('webSocketHandshakeResponseReceived', ctx);
};

