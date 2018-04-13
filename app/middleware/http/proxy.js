
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs-extra');
const mime = require('mime-types');
const keepAliveAgent = new http.Agent({ keepAlive: true });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true });

async function requestGet(ctx) {
  const { destURL, destHostname } = ctx;
  const { method } = ctx.req;
  const info = url.parse(destURL);
  const headers = Object.assign({}, ctx.req.headers);

  if (headers['proxy-connection']) {
    delete headers['proxy-connection'];
  }

  headers['host'] = info.hostname;

  let res;
  try {
    res = await new Promise((resolve, reject) => {
      const isHttps = ctx.protocol === 'https';
      const req = (isHttps ? https : http)['request']({
        hostname: destHostname,
        port: info.port,
        path: info.path,
        headers,
        method,
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
      if (method === 'POST' || method === 'PUT') {
        ctx.req.pipe(req);
      } else {
        req.end();
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


  if (method !== 'HEAD') {
    ctx.body = res;
  }
}

async function sendFile(ctx) {
  const { destURL } = ctx;
  const filePath = destURL.match(/^\w+:\/\/(\/[\s\S]+)$/) && RegExp.$1 || '';
  let stat;
  try {
    stat = filePath && await fs.stat(filePath);
  } catch (err) {
  }
  if (stat && stat.isFile()) {
    ctx.type = mime.lookup(filePath);
    ctx.body = fs.createReadStream(filePath);
  } else {
    console.error('file forwarding not exists', destURL);
    ctx.status = 404;
  }
}

async function sendStatus(ctx) {
  const { destURL } = ctx;
  const status = destURL.match(/^\w+:\/\/(\d+)$/) && +RegExp.$1 || '';
  if (status) {
    ctx.status = status;
  } else {
    console.error('status forwarding config error', destURL);
    ctx.status = 503;
  }
}

module.exports = async (ctx, next) => {
  const { forwarding = {} } = ctx;
  ctx.destURL = forwarding.url || ctx.url;
  ctx.destHostname = forwarding.hostname || url.parse(ctx.destURL).hostname;
  const destProtocol = (ctx.destURL.match(/^(\w+):/) && RegExp.$1 || '').toLowerCase();

  switch (destProtocol) {
    case 'http':
    case 'https':
      await requestGet(ctx);
      break;
    case 'file':
      await sendFile(ctx);
      break;
    case 'status':
      await sendStatus(ctx);
      break;
    default:
      await next();
      break;
  }
}
