import url from 'url';
import type { FeproxyApp, ProxyContext } from '../types';

const URL = Symbol('URL');

export default (app: FeproxyApp) => {

  const getFullURL = (ctx: ProxyContext, protocol: string) => {
    const absolutePath = ctx.request.url;
    if (/^\w+:\/\/.*/.test(absolutePath)) {
      return absolutePath;
    }
    const { hostname, port } = ctx.req.socket.server.proxy;
    let addPort = '';
    if ((ctx.protocol === 'https' && port !== 443) ||
      (ctx.protocol !== 'https' && port !== 80)
    ) {
      addPort = `:${port}`;
    }
    return `${protocol}://${hostname}${addPort}${absolutePath}`;
  };

  Object.defineProperties(app.context, {
    url: {
      get(this: ProxyContext) {
        if (!this[URL]) {
          if (this.req.socket.server.proxy && this.protocol === 'https') {
            // add protocol to https|wss url, detail for `lib/server.js`
            this[URL] = getFullURL(this, typeof this.websocket !== 'undefined' ? 'wss' : 'https');
          } else {
            let href = this.request.url;
            const hrefInfo = url.parse(href);
            const headerHost = this.get('host');
            if (headerHost && hrefInfo.host && hrefInfo.host !== headerHost) {
              const replacedHref = href.replace(hrefInfo.host, headerHost);
              console.log('replace', href, replacedHref);
              href = replacedHref;
            }
            this[URL] = href;
          }
        }
        return this[URL];
      },
    },
    routerPath: {
      get(this: ProxyContext) {
        // reserve protocol and remove querystring
        return this.url.replace(/\?[\s\S]*$/, '');
      },
      // @koa/router 匹配后会回写 ctx.routerPath = layer.path, 这里吞掉写入保住 getter
      // (它的 dist 是 use strict, 只有 getter 会直接抛 TypeError)
      set() {},
    },
    // @koa/router 取匹配路径的顺序是
    // `opts.routerPath || ctx.newRouterPath || ctx.path || ctx.routerPath`,
    // ctx.path 只有 pathname, 排在 routerPath 前面会让绝对 URL 的路由全部失配,
    // 所以用优先级最高的 newRouterPath 把绝对 URL 喂进去
    newRouterPath: {
      get(this: ProxyContext) {
        return this.routerPath;
      },
    },
  });
};
