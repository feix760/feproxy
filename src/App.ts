import chalk from 'chalk';
import ip from 'ip';
import Koa from 'koa';
import koaStatic from 'koa-static';
import configDefault from './config.default';
import extendContext from './extend/context';
import Inspector from './inspector/Inspector';
import createProxyPlugins from './proxyPlugins';
import ProxyServer from './server/ProxyServer';
import WebSocketServer from './server/WebSocketServer';
import registerRouter from './router';
import Config from './util/Config';
import { PUBLIC_DIR } from './util/paths';
import type { ConfigData } from './util/Config';
import type { FeproxyApp } from './types';

export default (config?: Partial<ConfigData>): FeproxyApp => {
  const app = new Koa() as FeproxyApp;

  app.config = new Config({
    ...configDefault,
    ...config,
  });

  extendContext(app);

  app.ws = new WebSocketServer(app);

  app.inspector = new Inspector(app);

  app.proxyPlugins = createProxyPlugins(app);

  registerRouter(app);

  app.use(koaStatic(PUBLIC_DIR, {
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
