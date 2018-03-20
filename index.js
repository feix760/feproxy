
const chalk = require('chalk');
const ip = require('ip');
const Koa = require('koa');
const router = require('koa-router')();
const koaWebsocket = require('koa-websocket');

const app = koaWebsocket(new Koa());

app.use(async (ctx, next) => {
    console.log(ctx.url);
    ctx.routerPath = ctx.url;
    await next();
  })
  .use(router.routes());

app.router = router;

require('./app/router')(app);

const port = 8080;

app.listen(port, () => {
  console.log(chalk.green(`Server start on http://${ip.address()}:${port}`));
});
