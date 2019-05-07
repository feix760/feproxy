
const http = require('http');
const https = require('https');
const url = require('url');
const Stream = require('stream');
const fs = require('fs-extra');
const mime = require('mime-types');

const agentOpt = {
  keepAlive: true,
  keepAliveMsecs: 5000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
};

const agent = {
  http: new http.Agent(agentOpt),
  https: new https.Agent(agentOpt),
};

async function requestGet(ctx) {
  const { dest } = ctx;
  const { method } = ctx.req;
  const headers = Object.assign({}, ctx.req.headers);

  const proxyAlive = /keep-alive/i.test(headers['proxy-connection'] || '');
  if (headers['proxy-connection']) {
    delete headers['proxy-connection'];
  }

  headers.host = dest.hostname;

  let proxy;
  try {
    proxy = await new Promise((resolve, reject) => {
      const req = (dest.protocol === 'https:' ? https : http).request({
        hostname: dest.hostname,
        port: dest.port,
        path: dest.path,
        headers,
        method,
        rejectUnauthorized: false,
        requestCert: true,
        agent: agent[dest.protocol.replace(':', '')],
      }, res => {
        res.on('error', err => {
          console.error('res error', err.code || '');
        });
        resolve({ req, res });
      });
      req.on('error', err => {
        console.error('req error', dest.href, err.code || '');
        reject(err);
      });
      if (method === 'POST' || method === 'PUT' || method === 'OPTIONS') {
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

  ctx.status = proxy.res.statusCode;

  Object.keys(proxy.res.headers).forEach(key => {
    const value = proxy.res.headers[key];
    if (!/^Connection$/i.test(key)) {
      try {
        ctx.set(key, value);
      } catch (err) {
        console.warn(`Set header ${key}:${value} error:`, err && err.message);
      }
    }
  });

  if (proxyAlive) {
    ctx.res.shouldKeepAlive = true;
    ctx.set('proxy-connection', 'keep-alive');
  } else {
    ctx.res.shouldKeepAlive = false;
    ctx.set('proxy-connection', 'close');
  }

  // set for inspect
  ctx.proxy = proxy;

  if (method !== 'HEAD') {
    // 用PassThrough规避keep-alive导致"socket hang up"
    const pass = new Stream.PassThrough();
    proxy.res.pipe(pass);
    ctx.body = pass;
  }
}

function checkMethod(ctx) {
  if (ctx.method !== 'POST' && ctx.method !== 'GET') {
    ctx.status = 204;
    return false;
  }
  return true;
}

function setAccessControlAllow(ctx) {
  ctx.set('Access-Control-Allow-Credentials', 'true');
  ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,POST,DELETE');
  ctx.set('Access-Control-Allow-Origin', ctx.get('origin'));
  if (ctx.get('Access-Control-Request-Headers')) {
    ctx.set('Access-Control-Allow-Headers', ctx.get('Access-Control-Request-Headers'));
  }
}

async function sendFile(ctx) {
  setAccessControlAllow(ctx);

  if (!checkMethod(ctx)) {
    return;
  }

  const filePath = ctx.dest.path;
  let stat;
  try {
    stat = filePath && await fs.stat(filePath);
  } catch (err) {
    // eslint-disable-line
  }
  if (stat && stat.isFile()) {
    ctx.type = mime.lookup(filePath);
    ctx.body = fs.createReadStream(filePath);
  } else {
    console.error('file forwarding not exists', ctx.dest.href);
    ctx.status = 404;
  }
}

// status:///301?url=http://127.0.0.1:9000/portal.html
async function sendStatus(ctx) {
  setAccessControlAllow(ctx);

  if (!checkMethod(ctx)) {
    return;
  }

  const { dest } = ctx;
  const status = +dest.pathname.replace(/\//g, '');

  if (status) {
    ctx.status = status;
    if ([ 301, 302 ].indexOf(status) !== -1) {
      const href = dest.search.match(/[?&]url=([^&]+)/i) && RegExp.$1 || '';
      if (!href) {
        console.error(`status ${status} url config error`, dest.href);
      } else {
        ctx.redirect(decodeURIComponent(href));
      }
    }
  } else {
    console.error('status forwarding config error', dest.url);
    ctx.status = 503;
  }
}

module.exports = async (ctx, next) => {
  const { forwarding = {} } = ctx;
  const href = forwarding.url || ctx.url;

  const dest = ctx.dest = {
    ...url.parse(href),
    ...forwarding,
  };

  switch (dest.protocol) {
    case 'http:':
    case 'https:':
      await requestGet(ctx);
      break;
    case 'file:':
      await sendFile(ctx);
      break;
    case 'status:':
      await sendStatus(ctx);
      break;
    default:
      await next();
      break;
  }
};
