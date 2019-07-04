
const compose = require('koa-compose');
const co = require('co');
const ws = require('ws');

class WebSocketServer {
  constructor(app) {
    this.app = app;
    this.middleware = [];
  }

  listen(options) {
    this.server = new ws.Server({
      ...options,
      verifyClient: this.verifyClient.bind(this),
    });

    this.server.on('headers', this.onHeaders.bind(this));
    this.server.on('connection', this.onConnection.bind(this));
  }

  onHeaders(headers, req) {
    const hasKeys = {};
    headers.forEach(item => {
      if (/^([^:]+):(.*)$/.test(item)) {
        const key = RegExp.$1.trim().toLowerCase();
        const value = RegExp.$2.trim();
        // mark could not override wsServer headers
        hasKeys[key] = true;
        // add wsServer headers to responseHeaders
        req.responseHeaders[key] = value;
      }
    });
    Object.keys(req.responseHeaders).forEach(key => {
      let values = req.responseHeaders[key];
      if (!Array.isArray(values)) {
        values = [ values ];
      }
      // push response headers
      if (!hasKeys[key.toLowerCase()]) {
        values.forEach(v => {
          headers.push(`${key}: ${v}`);
        });
      }
    });
  }

  onConnection(socket, req) {
    if (req._waitSocket) {
      req._waitSocket(socket);
      delete req._waitSocket;
    }
  }

  verifyClient(info, cb) {
    const { req } = info;
    const ctx = this.createContext(req);
    // args same as verifyClient's cb args
    // ref: https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
    ctx.accept = (result = true, ...args) => {
      ctx.accept = () => {};
      const promise = new Promise(resolve => {
        if (result) {
          req._waitSocket = socket => {
            ctx.websocket = socket; // set a websocket ref
            resolve(socket);
          };
        } else {
          resolve();
        }
      });
      cb(result, ...args);
      return promise;
    };
    const fn = co.wrap(compose(this.middleware));
    fn(ctx).catch(err => {
      ctx.accept(false, 500); // server error
      console.error(err);
    });
  }

  createContext(req) {
    const ctx = this.app.createContext(req);
    req.responseHeaders = {};
    Object.assign(ctx, {
      websocket: null,
      set(key, value) {
        req.responseHeaders[key] = value;
      },
      getResponseHeaders() {
        return req.responseHeaders;
      },
    });
    return ctx;
  }

  use(fn) {
    this.middleware.push(fn);
    return this;
  }
}

module.exports = WebSocketServer;
