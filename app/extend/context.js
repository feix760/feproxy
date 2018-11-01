
const URL = Symbol('URL');

module.exports = ({ context }) => {

  const getFullURL = (ctx, protocol) => {
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

  Object.defineProperties(context, {
    url: {
      get() {
        if (!this[URL]) {
          if (this.req.socket.server.proxy && this.protocol === 'https') {
            // add protocol to https|wss url, detail for `lib/server.js`
            this[URL] = getFullURL(this, this.websocket ? 'wss' : 'https');
          } else {
            this[URL] = this.request.url;
          }
        }
        return this[URL];
      },
    },
    routerPath: {
      get() {
        // remove param
        return this.url.replace(/\?[\s\S]*$/, '');
      },
    },
  });
};
