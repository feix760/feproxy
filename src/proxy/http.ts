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
  // 代理验证头不应转发给上游
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
        hostname: param.hostname || urlInfo.hostname, // 可以通过param修改host
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

  if (param.url) { // 如果更改了url设置一下access-control-allow比较好
    ctxUtil.setAccessControlAllow(ctx);
  }

  ctx.res.shouldKeepAlive = proxyAlive; // 会同时设置响应头 connection
  ctx.set('proxy-connection', proxyAlive ? 'keep-alive' : 'close');

  // set for inspect
  ctx.proxy = proxy;

  // 没有响应体的响应不要挂 body: koa 对 204/205/304 直接 `ctx.body = null` + `res.end()`,
  // 而 body 的 setter 已经给流注册了 `onFinish(res, destroy)`, 这个 PassThrough 会被 destroy 掉 ——
  // 只有 'close' 没有 'end', 抓包那边读它永远等不到结束(devtools 收不到 loadingFinished,
  // 请求一直显示 pending, streamResourceContent 还要干等满超时)。
  if (method !== 'HEAD' && !statuses.empty[ctx.status]) {
    // 用PassThrough规避keep-alive导致"socket hang up"
    const pass = new Stream.PassThrough();
    proxy.res.pipe(pass);
    ctx.body = pass;
    // koa会在设置body的时候设置一个默认的content-type
    if (!proxy.res.headers['content-type']) {
      ctx.type = '';
    }
  } else {
    // 这里不能设 ctx.body(哪怕是 ''): koa 的 body setter 会把 content-length 改成 0,
    // 而 HEAD 的响应头要跟 GET 一致, 得保留上游给的长度。
    // 没人读的话 keep-alive 的 socket 不会还回连接池
    proxy.res.resume();
  }
};

export default httpProxy;
