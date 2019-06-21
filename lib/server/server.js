
const net = require('net');
const catchError = require('../util/catchError');

module.exports = app => {
  const serverFactory = require('./serverFactory')(app);

  return net.createServer(socket => {
    catchError(socket);
    socket.once('data', async buffer => {
      socket.pause();
      let server;
      if (/^CONNECT\b/i.test(buffer.slice(0, 8).toString())) {
        const match = buffer.toString().match(/^CONNECT\s+([^\s:]+):(\d+)/i);
        const hostname = match[1];
        const port = +match[2];
        socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
        socket.once('data', async buffer2 => {
          socket.pause();
          if (/^GET\b/i.test(buffer2.slice(0, 4).toString())) {
            // http socket proxy: 'GET /path' change to 'GET ws://host/path'
            const header = buffer2.toString().replace(/^GET\s+\//, `GET ws://${hostname}:${port}/`);
            socket.unshift(Buffer.from(header, 'utf8'));
            server = await serverFactory.getHTTPServer();
            server.emit('connection', socket);
            socket.resume();
          } else if (app.config.https) { // catch https
            // https proxy: 'GET /path' `app/extend/context.js` will change url to https://host/path
            socket.unshift(buffer2);
            server = await serverFactory.getTSLServer({ hostname, port, isProxy: true });
            server.emit('connection', socket);
            socket.resume();
          } else { // proxy https only
            socket.unshift(buffer2);
            const connect = net.connect(port, hostname, () => {
              socket.pipe(connect);
              connect.pipe(socket);
              socket.resume();
            });
            catchError(connect);
          }
        });
        socket.resume();
      } else if (buffer[0] === 22) {
        // https: GET /path
        socket.unshift(buffer);
        server = await serverFactory.getTSLServer({ hostname: app.config.hostname });
        server.emit('connection', socket);
        socket.resume();
      } else if (buffer[0] > 32 && buffer[0] < 127) {
        // http: 'GET /path'
        // http socket: 'GET /path' (Connection: Upgrade)
        // http proxy: 'GET http://host/path'
        socket.unshift(buffer);
        server = await serverFactory.getHTTPServer();
        server.emit('connection', socket);
        socket.resume();
      } else {
        console.error('Unrecognized protocol');
      }
    });
  });
};
