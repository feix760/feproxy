
const EventEmitter = require('events');

class Inspect extends EventEmitter {
  constructor() {
    super();
    this.wsList = [];
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
  }

  addClient(ws) {
    this.wsList.push(ws);

    ws.on('close', () => {
      const index = this.wsList.indexOf(ws);
      if (index > -1) {
        this.wsList.splice(index, 1);
      }
      ws.send = new Function();
    });

    ws.on('message', msg => {
      // console.log(msg);
      try {
        msg = JSON.parse(msg);
      } catch (err) {
        console.error(err);
        return;
      }
      if (msg && msg.method) {
        this.emit('message', {
          msg,
          ws,
        });
      }
    });
  }

  sendAll(method, params) {
    this.wsList.forEach(ws => {
      ws.send({
        method,
        params,
      });
    });
  }

  timestamp() {
    this._timestamp = this._timestamp || Date.now();
    return (Date.now() - this._timestamp) / 1000;
  }

  async handleMessage({ msg, ws }) {
    const { method, id } = msg;

    const handler = this.methods[method] || this.methods.default;

    let result = handler(msg);

    if (result instanceof Promise) {
      result = await result;
    }

    ws.send({
      id,
      result: result || {},
    });
  }

  addModule(factory) {
    const { methods = {} } = factory(this);

    Object.assign(this.methods, methods);
  }

  nextId() {
    this._id = this._id || 0;
    return ++this._id;
  }
}

const inspect = new Inspect();

inspect.addModule(require('./common'));
inspect.addModule(require('./network'));
inspect.addModule(require('./websocket'));

module.exports = inspect;
