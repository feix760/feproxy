import http from 'http';
import type https from 'https';
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

  /**
   * The single ws.Server instance, in noServer mode, hooked onto each http/https server by
   * `attach()`. Under MITM https servers are created per domain; the old code new'd a ws.Server
   * per server, piling up one instance per captured domain while `this.server` kept being
   * overwritten by the latest one.
   */
  getServer() {
    if (!this.server) {
      this.server = new ws.Server({
        noServer: true,
        // clientTracking only exists to populate wss.clients, which nobody reads here —
        // off, so it doesn't hold on to every live connection
        clientTracking: false,
        verifyClient: this.verifyClient.bind(this) as any,
      });

      this.server.on('headers', this.onHeaders.bind(this));
      this.server.on('connection', this.onConnection.bind(this));
    }
    return this.server;
  }

  /**
   * Hook the shared ws.Server onto one http/https server — the same thing ws' own
   * `options.server` mode does (handleUpgrade still runs verifyClient).
   */
  attach(server: http.Server | https.Server) {
    const wsServer = this.getServer();

    (server as http.Server).on('upgrade', (req: WsRequest, socket, head) => {
      wsServer.handleUpgrade(req, socket, head, client => {
        wsServer.emit('connection', client, req);
      });
    });
    return this;
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
