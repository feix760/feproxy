
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const koaWebsocket = require('koa-websocket');
const koaStatic = require('koa-static');

const app = koaWebsocket(new Koa());

app.config = require('./config');

require('./app/extend/context')(app);

app.forwarding = require('./lib/forwarding')(app);

app.inspect = require('./app/inspect')(app);

require('./app/router')(app);

app.use(koaStatic(__dirname + '/public'));

const server = require('./lib/server')(app);

server.listen(app.config.port, () => {
  console.log(chalk.green(`\n👉 Server start on http://${ip.address()}:${app.config.port}`));
});

app.on('error', (err, ctx) => {
  console.error(ctx.url, err);
});

process.on('uncaughtException', err => {
  console.log('uncaughtException');
  console.error(err);
});
