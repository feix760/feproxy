import EventEmitter from 'events';
import type WebSocket from 'ws';

const BLOCKED_URLS = Symbol('BLOCKED_URLS');

class Client extends EventEmitter {
  ws: WebSocket;

  private [BLOCKED_URLS]: string[];

  constructor(ws: WebSocket) {
    super();
    this.ws = ws;

    ws.on('close', this.onClose.bind(this));
    ws.on('message', this.onMessage.bind(this));
  }

  onClose() {
    this.ws = null;
    this.emit('close');
  }

  onMessage(msg: any) {
    try {
      msg = JSON.parse(msg);
    } catch (err) {
      console.warn('Parse devtool message error', err);
      return;
    }

    this.emit('message', msg);
  }

  send(...args: any[]) {
    if (this.ws) {
      (this.ws.send as any)(...args);
    }
  }

  setBlockedURLs(blockedURLs: string[]) {
    this[BLOCKED_URLS] = blockedURLs;
  }

  getBlockedURLs(): string[] {
    return this[BLOCKED_URLS] || [];
  }
}

export default Client;
