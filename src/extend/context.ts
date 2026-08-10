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
    },
  });
};
