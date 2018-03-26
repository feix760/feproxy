
const service = require('../../service');

module.exports = async (ctx, next) => {
  service.inspect.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  service.inspect.emit('webSocketHandshakeResponseReceived', ctx);
};

