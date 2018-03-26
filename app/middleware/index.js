
module.exports = {
  http: {
    inspect: require('./http/inspect'),
    proxy: require('./http/proxy'),
  },
  websocket: {
    inspect: require('./websocket/inspect'),
    proxy: require('./websocket/proxy'),
  },
  interceptor: require('./interceptor'),
};
