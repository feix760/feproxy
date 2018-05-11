
const net = require('net');

module.exports = app => {
  const serverFactory = require('./serverFactory')(app);

  return net.createServer(socket => {
    socket.once('data', async buffer => {
      socket.pause();
      const byte = buffer[0];
      if (/^CONNECT\b/i.test(buffer.slice(0, 8).toString())) {
        const match = buffer.toString().match(/^CONNECT\s+([^\s:]+):(\d+)/i);
        const hostname = match[1];
        const port = match[2];
        socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
        socket.once('data', async buffer2 => {
          socket.pause();
          if (/^GET\b/i.test(buffer2.slice(0, 4).toString())) {
            // http socket
            const header = buffer2.toString().replace(/^GET\s+\//, `GET ws://${hostname}:${port}/`);
            socket.unshift(Buffer.from(header, 'utf8'));
            (await serverFactory.getHTTPServer()).emit('connection', socket);
          } else {
            // https proxy
            socket.unshift(buffer2);
            (await serverFactory.getTSLServer({ hostname, port, isProxy: true })).emit('connection', socket);
          }
          socket.resume();
        });
      } else if (byte === 22) {
        // https server
        socket.unshift(buffer);
        (await serverFactory.getTSLServer({ hostname: 'localhost' })).emit('connection', socket);
      } else if (byte > 32 && byte < 127) {
        // http
        socket.unshift(buffer);
        (await serverFactory.getHTTPServer()).emit('connection', socket);
      }
      socket.resume();
    });
  });
};
