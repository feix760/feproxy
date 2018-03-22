
const net = require('net');
const chalk = require('chalk');
const http = require('http');
const ip = require('ip');
const Koa = require('koa');
const router = require('koa-router')();
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());
const getServer = require('./lib/getServer')(app);

app.use(async (ctx, next) => {
    const { proxy } = ctx.req.socket.server;
    if (ctx.protocol === 'https' && proxy) {
      if (/^\w+:\/\//.test(ctx.url)) {
        throw new Error('URL is valid', ctx.url);
      }
      const host = `${proxy.hostname}${proxy.port !== 443 ? ':' + proxy.port : ''}`;
      ctx.url = `${ctx.protocol}://${ctx.host}${ctx.url}`;
    }
    ctx.routerPath = ctx.url.replace(/\?[\s\S]*/, '');
    console.log(ctx.url);
    await next();
  })
  .use(router.routes());

app.router = router;

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
          // ws proxy
          const req = net.connect(port, hostname, () => {
            req.pipe(socket);
          });
          socket.pipe(req);
        } else {
          getServer(hostname, port).emit('connection', socket);
        }
        socket.unshift(buffer2);
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
