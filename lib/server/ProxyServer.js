const net = require('net');
const catchError = require('../util/catchError');
const ServerFactory = require('./ServerFactory');
const ALIVE_ID = Symbol('ALIVE_ID');

class ProxyServer {
  constructor(app) {
    this.app = app;

    this.aliveSockets = {};

    this.factory = new ServerFactory(this.app);

    this.createServer();
  }

  createServer() {
    this.server = net.createServer(socket => {
      catchError(socket);
      this.onSocket(socket)
        .catch(err => {
          socket.destroy();
          console.log(err);
        });
      this.addAliveSocket(socket);
    });
  }

  onceData(socket, cb) {
    return new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.once('data', buffer => {
        socket.removeListener('error', reject);
        // `socekt.pause|unshift` should be called in data event handler, could not has `await` etc.
        // otherwise will cause bug
        cb(buffer).then(resolve, reject);
      });
      socket.resume(); // auto resume
    });
  }

  onSocket(socket) {
    return this.onceData(socket, async buffer => {
      socket.pause();
      if (/^CONNECT\b/i.test(buffer.slice(0, 8).toString())) {
        // http socket proxy
        // https proxy
        const match = buffer.toString().match(/^CONNECT\s+([^\s:]+):(\d+)/i);
        const hostname = match[1];
        const port = +match[2];
        socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
        await this.onConnect(socket, hostname, port); // should resume inner
      } else if (buffer[0] === 22) {
        // https: GET /path
        socket.unshift(buffer);
        const server = await this.factory.getTSLServer({ hostname: this.app.config.hostname });
        server.emit('connection', socket);
        socket.resume();
      } else if (buffer[0] > 32 && buffer[0] < 127) {
        // http: 'GET /path'
        // http socket: 'GET /path' (Connection: Upgrade)
        // http proxy: 'GET http://host/path'
        socket.unshift(buffer);
        const server = await this.factory.getHTTPServer();
        server.emit('connection', socket);
        socket.resume();
      } else {
        throw new Error('Unrecognized protocol');
      }
    });
  }

  onConnect(socket, hostname, port) {
    return this.onceData(socket, async buffer => {
      socket.pause();
      if (/^GET\b/i.test(buffer.slice(0, 4).toString())) {
        // http socket proxy: 'GET /path' change to 'GET ws://host/path'
        const header = buffer.toString().replace(/^GET\s+\//, `GET ws://${hostname}:${port}/`);
        socket.unshift(Buffer.from(header, 'utf8'));
        const server = await this.factory.getHTTPServer();
        server.emit('connection', socket);
      } else if (this.app.config.https) { // catch https
        // https proxy: 'GET /path' `app/extend/context.js` will change url to https://host/path
        socket.unshift(buffer);
        const server = await this.factory.getTSLServer({ hostname, port, group: 'proxy' });
        server.proxy = { // mark is proxy server
          hostname,
          port,
        };
        server.emit('connection', socket);
      } else {
        // proxy https only
        socket.unshift(buffer);
        let connect;
        await new Promise((resolve, reject) => {
          connect = net.connect(port, hostname, () => {
            connect.removeListener('error', reject);
            resolve();
          });
          connect.once('error', reject);
        });
        catchError(connect);
        socket.pipe(connect);
        connect.pipe(socket);
        socket.on('error', () => connect.destroy());
        socket.on('close', () => connect.destroy());
      }
      socket.resume();
    });
  }

  addAliveSocket(socket) {
    const { aliveSockets } = this;
    this[ALIVE_ID] = this[ALIVE_ID] || 1;
    const id = this[ALIVE_ID]++;
    aliveSockets[id] = socket;
    socket.once('close', () => {
      delete aliveSockets[id];
    });
  }

  async close() {
    // close alive sockets before close
    await Promise.all(
      Object.values(this.aliveSockets)
        .map(socket => new Promise(resolve => {
          socket.once('close', resolve);
          socket.once('error', resolve);
          socket.destroy();
        }))
    );

    await new Promise(resolve => {
      this.server.close(resolve);
      this.server = null;
    });
  }

  async listen(port) {
    return new Promise(resolve => {
      this.server.listen(port, resolve);
    });
  }
}

module.exports = ProxyServer;
