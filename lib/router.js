
const koaRouter = require('koa-router');
const koaBody = require('koa-body');
const controller = {
  site: require('./controller/site'),
  devtools: require('./controller/devtools'),
};
const middleware = {
  inspect: require('./middleware/inspect'),
  wsInspect: require('./middleware/wsInspect'),
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
  router.all(wsURL, middleware.wsInspect);
  router.all(wsURL, middleware.proxy);

  // ------ site ----------
  // site url is normal
  router.get('/feproxy.crt', controller.site.crt);
  router.get('/log', controller.site.log);
  router.get('/getConfig', controller.site.getConfig);
  router.post('/setConfig', koaBody(), controller.site.setConfig);

  // chrome inspect websocket
  router.get('/ws', controller.devtools.ws);
  // devtools static files
  router.get(/\/devtools\/(.+)/, controller.devtools.static);

  // use routes to app
  app.use(routes);
  app.ws.use(routes);
};
