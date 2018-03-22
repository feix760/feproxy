
const net = require('net');
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const router = require('koa-router')();
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());
const getServer = require('./lib/getServer')(app);

app.use(async (ctx, next) => {
    if (ctx.protocol === 'https' && !/^\w+:\/\//.test(ctx.url)) {
      const socket = ctx.req.socket._parent;
      const host = socket && socket.proxyHost ? socket.proxyHost.replace(/\.443$/, '') : ctx.hostname;
      ctx.url = `${ctx.protocol}://${ctx.host}${ctx.url}`;
    }
    ctx.routerPath = ctx.url;
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

    if (buffer.toString().match(/^CONNECT\s+(([^\s:]+)(?::\d+)?)/i)) {
      const host = RegExp.$1;
      const hostname = RegExp.$2;
      socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
      socket.proxyHost = host;
      getServer(hostname).emit('connection', socket);
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
