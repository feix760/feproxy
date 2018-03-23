
const net = require('net');
const chalk = require('chalk');
const http = require('http');
const ip = require('ip');
const Koa = require('koa');
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());
const getServer = require('./lib/getServer')(app);

require('./app/router')(app);

const server = net.createServer(socket => {
  socket.once('data', buffer => {
    socket.pause();
    const byte = buffer[0];
    if (buffer.toString().match(/^CONNECT\s+([^\s:]+):(\d+)/i)) {
      const hostname = RegExp.$1;
      const port = RegExp.$2;
      socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
      socket.once('data', buffer2 => {
        socket.pause();
        if (buffer2.slice(0, 3).toString() === 'GET') {
          const header = buffer2.toString().replace(/^GET\s+\//, `GET ws://${hostname}:${port}/`);
          socket.unshift(Buffer.from(header, 'utf8'));
          getServer().emit('connection', socket);
        } else {
          socket.unshift(buffer2);
          getServer(hostname, port).emit('connection', socket);
        }
        socket.resume();
      });
    } else if (byte === 22) {
      // https server
    } else if (32 < byte && byte < 127) {
      socket.unshift(buffer);
      getServer().emit('connection', socket);
    }
    socket.resume();
  });
});

const port = 8080;
server.listen(port, () => {
  console.log(chalk.green(`Server start on http://${ip.address()}:${port}`));
});
