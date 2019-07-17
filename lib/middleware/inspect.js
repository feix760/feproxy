
module.exports = async (ctx, next) => {
  ctx.app.inspector.emit('requestWillBeSent', ctx);
  await next();
  ctx.app.inspector.emit('responseReceived', ctx);
};

