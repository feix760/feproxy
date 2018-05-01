
module.exports = async (ctx, next) => {
  ctx.app.inspect.emit('requestWillBeSent', ctx);
  await next();
  ctx.app.inspect.emit('responseReceived', ctx);
};

