import http from 'http';
import https from 'https';
import Stream from 'stream';
import url from 'url';
import statuses from 'statuses';
import { HttpAgent, HttpsAgent } from '../util/agent';
import * as ctxUtil from '../util/ctxUtil';
import type { ProxyPluginFn } from '../types';

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

const httpProxy: ProxyPluginFn = async (ctx, next, param) => {
  const { method } = ctx.req;
  const headers = Object.assign({}, ctx.req.headers);

  const proxyAlive = /keep-alive/i.test(headers['proxy-connection'] as string || headers.connection || '');
  if (headers['proxy-connection']) {
    delete headers['proxy-connection'];
  }
  if (headers.connection) {
    delete headers.connection;
  }
  // Never forward the proxy credentials upstream
  if (headers['proxy-authorization']) {
    delete headers['proxy-authorization'];
  }

  const urlInfo = url.parse(param.url || ctx.url);
  if (param.url) {
    headers.host = urlInfo.hostname;
  }

  let proxy;
  try {
    proxy = await new Promise<{ req: http.ClientRequest; res: http.IncomingMessage }>((resolve, reject) => {
      const options = {
        hostname: param.hostname || urlInfo.hostname, // the host plugin overrides this
        port: param.port || urlInfo.port,
        path: urlInfo.path,
        headers,
        method,
        rejectUnauthorized: false,
        requestCert: true,
        agent: agents[urlInfo.protocol.replace(':', '')],
      } as https.RequestOptions;
      const req = (urlInfo.protocol === 'https:' ? https : http).request(options, res => {
        res.on('error', err => {
          console.error('Response error', urlInfo.href, (err as NodeJS.ErrnoException).code || '');
        });
        resolve({ req, res });
      });
      req.on('error', err => {
        console.error('Request error', urlInfo.href, (err as NodeJS.ErrnoException).code || '');
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
    ctx.body = err.code || statuses(500);
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

  if (param.url) { // the url changed, so CORS headers are likely needed
    ctxUtil.setAccessControlAllow(ctx);
  }

  ctx.res.shouldKeepAlive = proxyAlive; // also sets the connection response header
  ctx.set('proxy-connection', proxyAlive ? 'keep-alive' : 'close');

  // set for inspect
  ctx.proxy = proxy;

  // Never attach a body to a bodiless response: for 204/205/304 koa does `ctx.body = null` +
  // `res.end()`, but the body setter has already registered `onFinish(res, destroy)` on the
  // stream, so this PassThrough gets destroyed — it emits 'close' without 'end', and the capture
  // side waits forever (devtools never receives loadingFinished, the request stays pending, and
  // streamResourceContent sits out its full timeout).
  if (method !== 'HEAD' && !statuses.empty[ctx.status]) {
    // PassThrough avoids the keep-alive "socket hang up"
    const pass = new Stream.PassThrough();
    proxy.res.pipe(pass);
    ctx.body = pass;
    // koa sets a default content-type whenever the body is assigned
    if (!proxy.res.headers['content-type']) {
      ctx.type = '';
    }
  } else {
    // Don't set ctx.body here, not even '': koa's body setter would rewrite content-length to 0,
    // while HEAD's headers must match GET's and keep the upstream length.
    // Draining is still required, or the keep-alive socket never returns to the pool.
    proxy.res.resume();
  }
};

export default httpProxy;
