
const route = require('koa-route');
const controller =  require('./controller');

module.exports = app => {
  app.ws.use(route.all('/ws', controller.ws));

  const proxyRegexp = /^\w+:\/\/.*/;

  app.router.all(proxyRegexp, require('./middleware/inspect'));
  app.router.all(proxyRegexp, require('./middleware/interceptor'));
  app.router.all(proxyRegexp, require('./middleware/proxy'));

  app.router.all('/*', async (ctx, next) => {
    // console.log(ctx);
    ctx.body = 'hello world';
  });
};
