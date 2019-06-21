
const http = require('http');
const https = require('https');
const url = require('url');
const Stream = require('stream');
const statuses = require('statuses');
const ctxUtil = require('../util/ctxUtil');
const { HttpAgent, HttpsAgent } = require('../util/agent');

const agentOpt = {
  keepAlive: true,
  keepAliveMsecs: 5000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
};

const agents = {
  http: new HttpAgent(agentOpt),
  https: new HttpsAgent(agentOpt),
};

module.exports = async (ctx, next, param) => {
  const { method } = ctx.req;
  const headers = Object.assign({}, ctx.req.headers);

  const proxyAlive = /keep-alive/i.test(headers['proxy-connection'] || headers.connection || '');
  if (headers['proxy-connection']) {
    delete headers['proxy-connection'];
  }
  if (headers.connection) {
    delete headers.connection;
  }

  const urlInfo = url.parse(param.url || ctx.url);
  headers.host = urlInfo.hostname;

  let proxy;
  try {
    proxy = await new Promise((resolve, reject) => {
      const req = (urlInfo.protocol === 'https:' ? https : http).request({
        hostname: param.hostname || urlInfo.hostname, // 可以通过param修改host
        port: param.port || urlInfo.port,
        path: urlInfo.path,
        headers,
        method,
        rejectUnauthorized: false,
        requestCert: true,
        agent: agents[urlInfo.protocol.replace(':', '')],
      }, res => {
        res.on('error', err => {
          console.error('res error', err.code || '');
        });
        resolve({ req, res });
      });
      req.on('error', err => {
        console.error('req error', urlInfo.href, err.code || '');
        reject(err);
      });

      if (method === 'POST' || method === 'PUT' || method === 'OPTIONS') {
        ctx.req.pipe(req);
      } else {
        req.end();
      }
    });
  } catch (err) {
    ctx.status = 500;
    ctx.body = err.code || statuses[500];
    return;
  }

  ctx.status = proxy.res.statusCode;

  Object.keys(proxy.res.headers).forEach(key => {
    const value = proxy.res.headers[key];
    if (key !== 'connection') {
      try {
        ctx.set(key, value);
      } catch (err) {
        console.warn(`Set header ${key}:${value} error:`, err && err.message);
      }
    }
  });

  if (param.url) { // 如果更改了url设置一下access-control-allow比较好
    ctxUtil.setAccessControlAllow(ctx);
  }

  ctx.res.shouldKeepAlive = proxyAlive; // 会同时设置响应头 connection
  ctx.set('proxy-connection', proxyAlive ? 'keep-alive' : 'close');

  // set for inspect
  ctx.proxy = proxy;

  if (method !== 'HEAD') {
    // 用PassThrough规避keep-alive导致"socket hang up"
    const pass = new Stream.PassThrough();
    proxy.res.pipe(pass);
    ctx.body = pass;
    // koa会在设置body的时候设置一个默认的content-type
    if (!proxy.res.headers['content-type']) {
      ctx.type = '';
    }
  }
};
