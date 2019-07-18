
const EventEmitter = require('events');
const Client = require('./Client');
const REQUEST_ID = Symbol('REQUEST_ID');

const modules = [
  require('./page'),
  require('./network'),
  require('./websocket'),
];

class Inspector extends EventEmitter {
  constructor(app) {
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

  addModule(factory) {
    const { methods } = factory(this) || {};

    Object.assign(this.methods, methods);
  }

  hasClient() {
    return !!this.clients.size;
  }

  addClient(ws) {
    const client = new Client(ws);

    this.clients.add(client);

    client
      .on('close', () => {
        this.clients.delete(client);
      })
      .on('message', msg => {
        if (msg && msg.method) {
          this.emit('message', {
            msg,
            client,
          });
        }
      });
  }

  sendAll(method, params) {
    this.clients.forEach(client => {
      client.send({
        method,
        params,
      });
    });
  }

  async handleMessage({ msg, client }) {
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
    const set = new Set();
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

module.exports = Inspector;
