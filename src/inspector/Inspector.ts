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
    this.methods = {
      default: () => ({
        result: false,
      }),
    };

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

    const handler = this.methods[method] || this.methods.default;

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

  timestamp() {
    this._timestamp = this._timestamp || Date.now();
    return (Date.now() - this._timestamp) / 1000;
  }
}

export default Inspector;
