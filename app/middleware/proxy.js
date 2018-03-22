
const http = require('http');
const https = require('https');
const keepAliveAgent = new http.Agent({ keepAlive: true });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true });
const url = require('url');

module.exports = async (ctx, next) => {
  const { headers, method } = ctx.req;
  const info = url.parse(ctx.url);

  if (headers['proxy-connection']) {
    delete headers['proxy-connection'];
  }

  let res;
  try {
    res = await new Promise((resolve, reject) => {
      const isHttps = ctx.protocol === 'https';
      const req = (isHttps ? https : http)['request']({
        hostname: info.hostname,
        port: info.port,
        path: info.path,
        headers,
        method: 'GET',
        agent: isHttps ? httpsKeepAliveAgent : keepAliveAgent,
      }, res => {
        res.on('error', err => {
          console.log('res error', err);
        });
        res.req = req;
        resolve(res);
      });
      req.on('error', err => {
        console.log('req error', err);
        reject(err);
      });
      if (method === 'GET') {
        req.end();
      } else {
        ctx.req.pipe(req);
      }
    });
  } catch (err) {
    if (err.code) {
      ctx.status = 503;
      ctx.body = err.code;
      return;
    }
    throw err;
  }

  ctx.status = res.statusCode;

  Object.keys(res.headers).forEach(key => {
    const value = res.headers[key];
    if (!/^connection$/i.test(key)) {
      try {
        ctx.set(key, value);
      } catch (err) {
        console.warn(`Set header ${key}:${value} error:`, err && err.message);
      }
    }
  });

  // set for inspect
  ctx.proxy = {
    res,
  };

  ctx.body = res;
};
