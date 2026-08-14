import EventEmitter from 'events';
import type { FeproxyApp, InspectorMessage, InspectorMethod, InspectorModuleResult } from '../types';
import Client from './Client';
import network from './network';
import page from './page';
import websocket from './websocket';

const REQUEST_ID = Symbol('REQUEST_ID');

type InspectorModule = (inspector: Inspector) => InspectorModuleResult;

const modules: InspectorModule[] = [
  page,
  network,
  websocket,
];

export interface InspectorFrame {
  contextId: number;
  contextName: string;
  id: string;
  loaderId: string;
  url: string;
  mimeType: string;
  securityOrigin: string;
}

class Inspector extends EventEmitter {
  app: FeproxyApp;
  clients: Set<Client>;
  methods: Record<string, InspectorMethod>;
  frame: InspectorFrame;

  private _timestamp: number;
  private [REQUEST_ID]: number;

  constructor(app: FeproxyApp) {
    super();

    this.app = app;
    this.clients = new Set();
    this.methods = {};

    this.frame = {
      contextId: 1,
      contextName: 'feproxy context',
      id: '38931.1',
      loaderId: '38931.2',
      url: 'http://localhost/index.html',
      mimeType: 'text/html',
      securityOrigin: 'http://localhost',
    };

    this.on('message', this.handleMessage.bind(this));

    modules.forEach(item => this.addModule(item));
  }

  addModule(factory: InspectorModule) {
    const { methods } = factory(this) || {};

    Object.assign(this.methods, methods);
  }

  hasClient() {
    return !!this.clients.size;
  }

  addClient(ws: any) {
    const client = new Client(ws);

    this.clients.add(client);

    client
      .on('close', () => {
        this.clients.delete(client);
      })
      .on('message', (msg: InspectorMessage) => {
        if (msg && msg.method) {
          this.emit('message', {
            msg,
            client,
          });
        }
      });
  }

  sendAll(method: string, params: any) {
    this.clients.forEach(client => {
      client.send({
        method,
        params,
      });
    });
  }

  async handleMessage({ msg, client }: { msg: InspectorMessage; client: Client }) {
    const { method, id } = msg;

    if (process.env.FEPROXY_CDP_DEBUG) {
      console.log('CDP >', method, this.methods[method] ? '' : 'MISSING');
    }

    const handler = this.methods[method];
    // Unimplemented methods must get a protocol error, never an empty result: the devtools
    // frontend fires dozens of commands at startup (Debugger/DOM/Overlay/Target...) and a
    // "success but empty" reply makes it deref into a TypeError instead of taking its fallback
    // path. The message matches Chrome's wording.
    if (!handler) {
      client.send({
        id,
        error: {
          code: -32601,
          message: `'${method}' wasn't found`,
        },
      });
      return;
    }

    let result = handler(msg, client);

    if (result instanceof Promise) {
      result = await result;
    }

    client.send({
      id,
      result: result || {},
    });
  }

  getBlockedURLs() {
    const set = new Set<string>();
    this.clients.forEach(client => {
      client.getBlockedURLs()
        .forEach(url => {
          set.add(url);
        });
    });
    return Array.from(set);
  }

  nextId() {
    this[REQUEST_ID] = this[REQUEST_ID] || 100;
    return `${++this[REQUEST_ID]}`;
  }

  /**
   * CDP timestamps are seconds off a monotonic clock — the epoch is irrelevant, only deltas matter.
   * performance.now() rather than Date.now(): the latter has 1ms resolution, and local requests
   * often finish within the same millisecond, giving duration === 0. The devtools Time column
   * tests `duration > 0`, so those requests would show as Pending forever.
   */
  timestamp() {
    this._timestamp = this._timestamp || performance.now();
    return (performance.now() - this._timestamp) / 1000;
  }
}

export default Inspector;
