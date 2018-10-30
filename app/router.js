
const koaRouter = require('koa-router');
const koaBody = require('koa-body');
const controller = require('./controller');
const middleware = require('./middleware');
const proxy = require('./proxy');

module.exports = app => {
  const router = koaRouter();
  const routes = router.routes();
  app.use(routes);
  app.ws.use(routes);

  router.all(/^\w+:\/\/.*/, async (ctx, next) => {
    // console.log(ctx.url);
    await next();
  });

  // ------ proxy ----------
  const httpURL = /^https?:\/\/.*/i;
  router.all(httpURL, middleware.inspect);
  router.all(httpURL, middleware.interceptor);
  router.all(httpURL, proxy.http);

  const wsURL = /^wss?:\/\/.*/i;
  router.all(wsURL, middleware.inspectWebsocket);
  router.all(wsURL, proxy.websocket);

  // ------ site ----------
  router.get('/feproxy.crt', controller.site.crt);
  router.get('/log', controller.site.log);
  router.get('/getConfig', controller.site.getConfig);
  router.post('/setConfig', koaBody(), controller.site.setConfig);

  // chrome inspect websocket
  router.get('/ws', controller.ws);
};
