
const koaRouter = require('koa-router');
const koaBody = require('koa-body');
const controller = {
  devtoolsWS: require('./controller/devtoolsWS'),
  site: require('./controller/site'),
  devtools: require('./controller/devtools'),
};
const middleware = {
  inspect: require('./middleware/inspect'),
  inspectWebsocket: require('./middleware/inspectWebsocket'),
  proxy: require('./middleware/proxy'),
};

module.exports = app => {
  const router = koaRouter();
  const routes = router.routes();

  router.all(/^\w+:\/\/.*/, async (ctx, next) => {
    await next();
  });

  // ------ proxy ----------
  // proxy url start with protocol: `(https|http|wss)://host/path`
  const httpURL = /^https?:\/\/.*/i;
  router.all(httpURL, middleware.inspect);
  router.all(httpURL, middleware.proxy);

  const wsURL = /^wss?:\/\/.*/i;
  router.all(wsURL, middleware.inspectWebsocket);
  router.all(wsURL, middleware.proxy);

  // ------ site ----------
  // site url is normal
  router.get('/feproxy.crt', controller.site.crt);
  router.get('/log', controller.site.log);
  router.get('/getConfig', controller.site.getConfig);
  router.post('/setConfig', koaBody(), controller.site.setConfig);

  // chrome inspect websocket
  router.get('/ws', controller.devtoolsWS);
  // devtools
  router.get(/\/devtools\/(.+)/, controller.devtools);

  // use routes to app
  app.use(routes);
  app.ws.use(routes);
};
