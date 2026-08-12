import Router from '@koa/router';
import { koaBody } from 'koa-body';
import * as devtools from './controller/devtools';
import * as site from './controller/site';
import inspect from './middleware/inspect';
import proxy from './middleware/proxy';
import wsInspect from './middleware/wsInspect';
import type { FeproxyApp } from './types';

export default (app: FeproxyApp) => {
  const router = new Router();
  const routes = router.routes();

  router.all(/^\w+:\/\/.*/, async (ctx, next) => {
    await next();
  });

  // ------ proxy ----------
  // proxy url start with protocol: `(https|http|wss)://host/path`
  const httpURL = /^https?:\/\/.*/i;
  router.all(httpURL, inspect as any);
  router.all(httpURL, proxy as any);

  const wsURL = /^wss?:\/\/.*/i;
  router.all(wsURL, wsInspect as any);
  router.all(wsURL, proxy as any);

  // ------ site ----------
  // site url is normal
  // 自身站点不做账号验证, auth 只作用于代理流量(在 socket 层验证)
  router.get('/feproxy.crt', site.crt as any);
  router.get('/log', site.log as any);
  router.get('/getConfig', site.getConfig as any);
  router.post('/setConfig', koaBody(), site.setConfig as any);

  // chrome inspect websocket
  router.get('/ws', devtools.ws as any);
  // devtools static files
  router.get(/\/devtools\/(.+)/, devtools.static as any);
  // devtools 里 worker 的 url 是相对主 chunk 算的(`../../entrypoints/...`), 落在站点根上,
  // 文件同样从 devtools 目录取(见 asset/devtools/entrypoints/)
  router.get(/^\/(entrypoints\/.+)$/, devtools.static as any);

  // use routes to app
  app.use(routes);
  app.ws.use(routes as any);
};
