
const service = require('../../service');

module.exports = async (ctx, next) => {
  service.inspect.emit('requestWillBeSent', ctx);
  await next();
  service.inspect.emit('responseReceived', ctx);
};

