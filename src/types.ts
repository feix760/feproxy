import type http from 'http';
import type Koa from 'koa';
import type WebSocket from 'ws';
import type Config from './util/Config';
import type Inspector from './inspector/Inspector';
import type WebSocketServer from './server/WebSocketServer';

export interface FeproxyApp extends Koa {
  config: Config;
  ws: WebSocketServer;
  inspector: Inspector;
  proxyPlugins: ProxyPlugins;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type KoaContext = Koa.ParameterizedContext<Koa.DefaultState, {}, any>;

interface ProxyContextExtras {
  app: FeproxyApp;
  // Koa's own `accept` is content negotiation; WebSocketServer replaces it with
  // the handshake acknowledgement, which resolves to the upgraded socket.
  accept: (result?: boolean, ...args: any[]) => Promise<WebSocket>;
  websocket?: WebSocket;
  getResponseHeaders?: () => Record<string, any>;
  proxy?: {
    req: http.ClientRequest;
    res: http.IncomingMessage;
  };
  requestId?: string;
  routerPath: string;
  // filled in by koa-router; regexp routes get numeric keys
  params: Record<string | number, string>;
}

export type ProxyContext = Omit<KoaContext, keyof ProxyContextExtras> & ProxyContextExtras;

export type ProxyPluginFn = (
  ctx: ProxyContext,
  next: () => Promise<void>,
  param?: any,
  plugins?: MatchedPlugin[],
) => Promise<void>;

export interface ProxyPlugin {
  fn: ProxyPluginFn;
  match?: RegExp | string;
  param?: Record<string, any>;
  priority?: number;
}

export type ProxyPlugins = Record<string, ProxyPlugin>;

export interface MatchedPlugin {
  type: string;
  param: Record<string, any>;
  fn: ProxyPluginFn;
}

export interface Rule {
  type: string;
  match?: RegExp | string;
  param?: Record<string, any>;
  enable?: boolean;
}

export interface Project {
  enable?: boolean;
  rules: Rule[];
  [key: string]: any;
}

export interface InspectorMessage {
  id?: number;
  method?: string;
  params?: any;
}

export type InspectorMethod = (msg: InspectorMessage, client: any) => any;

export interface InspectorModuleResult {
  methods?: Record<string, InspectorMethod>;
}
