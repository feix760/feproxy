
const url = require('url');
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
        hasKeys[key] = true;
        req.responseHeaders[key] = value;
      }
    });
    Object.keys(req.responseHeaders).forEach(key => {
      let values = req.responseHeaders[key];
      if (!Array.isArray(values)) {
        values = [ values ];
      }
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
      delete req._waitSocket();
    }
  }

  verifyClient(info, cb) {
    const { req } = info;
    req.responseHeaders = {};
    const ctx = this.app.createContext(req);
    Object.assign(ctx, {
      path: url.parse(req.url).pathname,
      set(key, value) {
        req.responseHeaders[key] = value;
      },
      getResponseHeaders() {
        return req.responseHeaders;
      },
      accept(result = true) {
        ctx.accept = () => {};
        const promise = new Promise(resolve => {
          result ? (req._waitSocket = resolve) : resolve();
        });
        cb(result);
        return promise;
      },
    });
    const fn = co.wrap(compose(this.middleware));
    fn(ctx).catch(err => {
      ctx.accept(false);
      console.error(err);
    });
  }

  use(fn) {
    this.middleware.push(fn);
    return this;
  }
}

module.exports = WebSocketServer;
