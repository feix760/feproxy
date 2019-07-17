
module.exports = async (ctx, next) => {
  ctx.app.inspector.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  ctx.app.inspector.emit('webSocketHandshakeResponseReceived', ctx);
};

