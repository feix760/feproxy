
const http = require('http');
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
      const req = http.request({
        hostname: info.hostname,
        port: info.port,
        path: info.path,
        headers,
        method: 'GET',
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
    ctx.set(key, res.headers[key]);
  });

  // set for inspect
  ctx.proxy = {
    res,
  };

  ctx.body = res;
};
