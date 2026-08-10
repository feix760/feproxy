import http from 'http';
import compose from 'koa-compose';
import ws from 'ws';
import type { FeproxyApp, ProxyContext } from '../types';

type WsMiddleware = (ctx: ProxyContext, next: () => Promise<void>) => Promise<void>;

interface WsRequest extends http.IncomingMessage {
  responseHeaders?: Record<string, any>;
  _waitSocket?: (socket: ws) => void;
}

class WebSocketServer {
  app: FeproxyApp;
  middleware: WsMiddleware[];
  server: ws.Server;

  constructor(app: FeproxyApp) {
    this.app = app;
    this.middleware = [];
  }

  listen(options: ws.ServerOptions) {
    this.server = new ws.Server({
      ...options,
      verifyClient: this.verifyClient.bind(this) as any,
    });

    this.server.on('headers', this.onHeaders.bind(this));
    this.server.on('connection', this.onConnection.bind(this));
  }

  onHeaders(headers: string[], req: WsRequest) {
    const hasKeys: Record<string, boolean> = {};
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
        values.forEach((v: any) => {
          headers.push(`${key}: ${v}`);
        });
      }
    });
  }

  onConnection(socket: ws, req: WsRequest) {
    if (req._waitSocket) {
      req._waitSocket(socket);
      delete req._waitSocket;
    }
  }

  async verifyClient(info: { req: WsRequest }, cb: (result: boolean, ...args: any[]) => void) {
    const { req } = info;
    const ctx = this.createContext(req);
    let hasAccept = false;
    // args same as verifyClient's cb args
    // ref: https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
    ctx.accept = ((result = true, ...args: any[]) => {
      hasAccept = true;
      const promise = new Promise<ws>(resolve => {
        if (result) {
          req._waitSocket = socket => {
            ctx.websocket = socket; // set a websocket ref
            resolve(socket);
          };
        } else {
          resolve(undefined);
        }
      });
      cb(result, ...args);
      return promise;
    }) as any;

    let hasError = false;
    try {
      await compose<any>(this.middleware)(ctx);
    } catch (err) {
      hasError = true;
      console.error(err);
    }
    if (!hasAccept) {
      ctx.accept(false, hasError ? 500 : 404);
    }
  }

  createContext(req: WsRequest) {
    const ctx: ProxyContext = (this.app.createContext as any)(req);
    req.responseHeaders = {};
    Object.assign(ctx, {
      websocket: null,
      set(key: string, value: any) {
        req.responseHeaders[key] = value;
      },
      getResponseHeaders() {
        return req.responseHeaders;
      },
    });
    return ctx;
  }

  use(fn: WsMiddleware) {
    this.middleware.push(fn);
    return this;
  }
}

export default WebSocketServer;
