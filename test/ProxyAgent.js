
const net = require('net');
const http = require('http');

class ProxyAgent extends http.Agent {
  createConnection(options, oncreate) {
    const { port, host, proxy } = options;
    const socket = net.connect(proxy.port, proxy.host);
    socket.once('error', oncreate);
    socket.on('connect', () => {
      socket.write([
        `CONNECT ${host}:${port} HTTP/1.1`,
        `Host: ${host}:${port}`,
        '\n\r',
      ].join('\n\r'));
    });
    socket.once('data', buffer => {
      socket.removeListener('error', oncreate);
      if (/\s200\sConnection\sestablished/i.test(buffer.toString())) {
        oncreate(null, socket);
      } else {
        oncreate(new Error(buffer.toString()));
      }
    });
  }
}

module.exports = ProxyAgent;
