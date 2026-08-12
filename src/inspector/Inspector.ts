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
    // 没实现的方法要回协议 error, 不能回空 result:
    // devtools 前端启动时会发几十条命令(Debugger/DOM/Overlay/Target...),
    // 拿到「成功但结果为空」会直接 deref 出 TypeError, 收到 error 才会走降级分支。
    // 错误文案和 Chrome 保持一致。
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
   * CDP 里的 timestamp 是「单调时钟的秒数」, 起点无所谓, 只有差值有意义。
   * 用 performance.now() 而不是 Date.now(): 后者只有 1ms 精度, 本机的请求经常整个跑完还在同一毫秒,
   * 算出来 duration 正好是 0, devtools 的 Time 列判的是 `duration > 0`, 会一直显示 Pending。
   */
  timestamp() {
    this._timestamp = this._timestamp || performance.now();
    return (performance.now() - this._timestamp) / 1000;
  }
}

export default Inspector;
