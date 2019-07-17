const path = require('path');
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const koaStatic = require('koa-static');
const WebSocketServer = require('./server/WebSocketServer');
const ProxyServer = require('./server/ProxyServer');
const Inspector = require('./inspector/Inspector');
const Config = require('./util/Config');

module.exports = config => {
  const app = new Koa();

  app.config = new Config({
    ...require('./config.default'),
    ...config,
  });

  require('./extend/context')(app);

  app.ws = new WebSocketServer(app);

  app.inspector = new Inspector(app);

  app.proxyPlugins = require('./proxyPlugins')(app);

  require('./router')(app);

  app.use(koaStatic(path.join(__dirname, './public'), {
    setHeaders(res) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('timing-allow-origin', '*');
    },
  }));

  const server = new ProxyServer(app);

  app.start = async () => {
    await server.listen(app.config.port);

    console.log(chalk.green(`\n👉 Proxy server http://${ip.address()}:${app.config.port}`));
    console.log(chalk.green(`🚀 Inspect page http://${ip.address()}:${app.config.port}/admin.html`));
  };

  app.stop = async () => {
    await server.close();

    console.log(chalk.gray('👂 Stopped'));
  };

  app.on('error', (err, ctx) => {
    console.error(ctx.url, err);
  });

  return app;
};
