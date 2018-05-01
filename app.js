
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const ip = require('ip');
const Koa = require('koa');
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());

const forwardingPath = path.join(__dirname, './run/forwarding');
app.forwarding = fs.existsSync(forwardingPath) && require(forwardingPath);

app.inspect = require('./app/inspect')(app);

require('./app/router')(app);

app.on('error', (err, ctx) => {
  console.error(ctx.url, err);
});

const server = require('./lib/server')(app);

const port = 8080;
server.listen(port, () => {
  console.log(chalk.green(`Server start on http://${ip.address()}:${port}`));
});
