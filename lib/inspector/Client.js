
const EventEmitter = require('events');
const BLOCKED_URLS = Symbol('BLOCKED_URLS');

class Client extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;

    ws.on('close', this.onClose.bind(this));
    ws.on('message', this.onMessage.bind(this));
  }

  onClose() {
    this.ws = null;
    this.emit('close');
  }

  onMessage(msg) {
    try {
      msg = JSON.parse(msg);
    } catch (err) {
      console.warn('Parse devtool message error', err);
      return;
    }

    this.emit('message', msg);
  }

  send(...args) {
    if (this.ws) {
      this.ws.send(...args);
    }
  }

  setBlockedURLs(blockedURLs) {
    this[BLOCKED_URLS] = blockedURLs;
  }

  getBlockedURLs() {
    return this[BLOCKED_URLS] || [];
  }
}

module.exports = Client;
