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
   * 唯一的 ws.Server 实例, 用 noServer 模式, 由 `attach()` 挂到各个 http/https server 上。
   * MITM 下 https server 是按域名建的, 以前每个 server 都 new 一个 ws.Server,
   * 抓 N 个域名就堆 N 个实例, 且 `this.server` 每次被后一个覆盖。
   */
  getServer() {
    if (!this.server) {
      this.server = new ws.Server({
        noServer: true,
        // clientTracking 只为提供 wss.clients, 这里没人用, 关掉免得握着所有活连接
        clientTracking: false,
        verifyClient: this.verifyClient.bind(this) as any,
      });

      this.server.on('headers', this.onHeaders.bind(this));
      this.server.on('connection', this.onConnection.bind(this));
    }
    return this.server;
  }

  /**
   * 把共享的 ws.Server 接到一个 http/https server 上,
   * 和 ws 自己的 `options.server` 模式做的事一样(handleUpgrade 里照样走 verifyClient)
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
