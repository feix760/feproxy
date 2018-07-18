
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());

app.hostname = 'feproxy.org';
app.port = 8080;

require('./app/extend/context')(app);

app.forwarding = require('./lib/forwarding')(app);

app.inspect = require('./app/inspect')(app);

require('./app/router')(app);

const server = require('./lib/server')(app);

server.listen(app.port, () => {
  console.log(chalk.green(`Server start on http://${ip.address()}:${app.port}`));
});

app.on('error', (err, ctx) => {
  console.error(ctx.url, err);
});

process.on('uncaughtException', err => {
  console.log('uncaughtException');
  console.error(err);
});
