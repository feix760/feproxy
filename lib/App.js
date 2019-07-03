const path = require('path');
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const koaStatic = require('koa-static');
const WebSocketServer = require('./server/WebSocketServer');
const Config = require('./util/Config');

module.exports = config => {
  const app = new Koa();

  app.ws = new WebSocketServer(app);

  app.config = new Config({
    ...require('./config.default'),
    ...config,
  });

  require('./extend/context')(app);

  app.inspect = require('./inspect')(app);

  app.proxyPlugins = require('./proxyPlugins')(app);

  require('./router')(app);

  app.use(koaStatic(path.join(__dirname, './public'), {
    setHeaders(res) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('timing-allow-origin', '*');
    },
  }));

  const server = require('./server/server')(app);

  app.start = () => new Promise(resolve => {
    server.listen(app.config.port, () => {
      console.log(chalk.green(`\n👉 Server start on http://${ip.address()}:${app.config.port}`));
      console.log(chalk.green(`🚀 Manange and inspect page on http://${ip.address()}:${app.config.port}/admin.html`));
      resolve();
    });
  });

  app.stop = () => new Promise(resolve => {
    server.close(() => {
      console.log(chalk.gray('👂 Stopped'));
      resolve();
    });
  });

  app.on('error', (err, ctx) => {
    console.error(ctx.url, err);
  });

  return app;
};
