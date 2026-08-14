import chalk from 'chalk';
import ip from 'ip';
import Koa from 'koa';
import koaStatic from 'koa-static';
import defaultConfig from './defaultConfig';
import extendContext from './extend/context';
import Inspector from './inspector/Inspector';
import createProxyPlugins from './proxyPlugins';
import ProxyServer from './server/ProxyServer';
import WebSocketServer from './server/WebSocketServer';
import registerRouter from './router';
import { PUBLIC_DIR } from './util/paths';
import pickDefined from './util/pickDefined';
import ProxyConfig from './util/ProxyConfig';
import type { ConfigData } from './util/ProxyConfig';
import type { FeproxyApp } from './types';

export default (startConfig?: Partial<ConfigData>): FeproxyApp => {
  const app = new Koa() as FeproxyApp;

  // Drop undefined fields so they don't override the defaults
  app.config = new ProxyConfig({
    ...defaultConfig,
    ...pickDefined(startConfig),
    auth: {
      ...defaultConfig.auth,
      ...pickDefined(startConfig?.auth),
    },
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
