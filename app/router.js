
const route = require('koa-route');
const router = require('koa-router')();
const controller =  require('./controller');
const middleware =  require('./middleware');

const protocolURL = /^\w+:\/\/.*/;
const getFullURL = (ctx, protocol) => {
  if (protocolURL.test(ctx.url)) {
    throw new Error('URL is valid', ctx.url);
  }
  const { proxy } = ctx.req.socket.server;
  const host = `${proxy.hostname}${proxy.port !== 443 ? ':' + proxy.port : ''}`;
  return `${protocol}://${ctx.host}${ctx.url}`;
};

module.exports = app => {
  app.router = router;

  app.use(async (ctx, next) => {
    const isHTTPS = ctx.protocol === 'https';
    if (isHTTPS && ctx.req.socket.server.proxy) {
      ctx.url = getFullURL(ctx, 'https');
    }
    ctx.routerPath = ctx.url.replace(/\?[\s\S]*/, '');
    console.log(ctx.url);
    await next();
  });

  app.use(router.routes());

  app.ws.use(async (ctx, next) => {
    const isHTTPS = ctx.protocol === 'https';
    if (isHTTPS && ctx.req.socket.server.proxy || protocolURL.test(ctx.url)) {
      if (isHTTPS) {
        ctx.url = getFullURL(ctx, 'wss');
      }
      console.log(ctx.url);
      await middleware.websocket.inspect(ctx, async () => {
        await middleware.websocket.proxy(ctx);
      });
    } else {
      await next();
    }
  });

  app.ws.use(route.all('/ws', controller.ws));

  app.router.all(protocolURL, middleware.http.inspect);
  app.router.all(protocolURL, middleware.interceptor);
  app.router.all(protocolURL, middleware.http.proxy);

  app.router.get('/root.crt', controller.site.crt);
  app.router.get('/', controller.site.home);
  app.router.post('/', controller.site.home);
};
