
module.exports = app => { // eslint-disable-line
  return {
    header: {
      fn: require('./proxy/header'),
    },
    delay: {
      fn: require('./proxy/delay'),
      priority: 80,
    },
    host: {
      fn: require('./proxy/host'),
    },
    status: {
      fn: require('./proxy/status'),
      priority: 30,
    },
    file: {
      fn: require('./proxy/file'),
      priority: 20,
    },
    http: {
      fn: require('./proxy/http'),
      match: /^https?:/i,
      priority: 10,
    },
    websocket: {
      fn: require('./proxy/websocket'),
      match: /^wss?:/i,
      priority: 10,
    },
  };
};
