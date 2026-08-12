import Stream from 'stream';
import { LRUCache } from 'lru-cache';
import fetch from 'node-fetch';
import * as inspectorUtil from '../util/inspectorUtil';
import proxyAgent from '../util/proxyAgent';
import type { InspectorMessage, InspectorModuleResult, ProxyContext } from '../types';
import type Client from './Client';
import type Inspector from './Inspector';

const INSPECTOR = Symbol('INSPECTOR');

interface RequestInfo {
  method: string;
  url: string;
  headers: Record<string, any>;
  postData: string;
  body: any;
  /** 响应体是否已经读完 */
  finished: boolean;
}

/** 响应体一直不结束(SSE/长轮询)时, streamResourceContent 最多等这么久 */
const STREAM_TIMEOUT = 30000;

const body2base64 = (body: any) => (
  (Buffer.isBuffer(body) ? body : Buffer.from(body || '')).toString('base64')
);

export default (inspector: Inspector): InspectorModuleResult => {
  const requestInfoPool = new LRUCache<string, RequestInfo>({ max: 1000 });

  /** 在等响应体读完的 streamResourceContent 调用, 按 requestId 存 resolve 回调 */
  const bodyWaiters = new Map<string, Set<(body: any) => void>>();

  const finishBody = (requestId: string, body: any) => {
    const info = requestInfoPool.get(requestId);
    if (info) {
      info.body = body;
      info.finished = true;
    }

    const waiters = bodyWaiters.get(requestId);
    if (waiters) {
      bodyWaiters.delete(requestId);
      waiters.forEach(resolve => resolve(body));
    }
  };

  const waitBody = (requestId: string) => new Promise<any>(resolve => {
    let timer: NodeJS.Timeout;

    const done = (body: any) => {
      clearTimeout(timer);
      resolve(body);
    };

    timer = setTimeout(() => {
      const waiters = bodyWaiters.get(requestId);
      if (waiters) {
        waiters.delete(done);
        if (!waiters.size) {
          bodyWaiters.delete(requestId);
        }
      }
      resolve('');
    }, STREAM_TIMEOUT);
    // 别因为一条没结束的请求拖着进程不退出
    timer.unref();

    const waiters = bodyWaiters.get(requestId);
    if (waiters) {
      waiters.add(done);
    } else {
      bodyWaiters.set(requestId, new Set([ done ]));
    }
  });

  const ctxParams = (ctx: ProxyContext, timestamp = inspector.timestamp()) => ({
    timestamp,
    frameId: inspector.frame.id,
    loaderId: inspector.frame.loaderId,
    requestId: ctx[INSPECTOR].requestId,
    documentURL: inspector.frame.url,
  });

  const requestWillBeSent = async (ctx: ProxyContext) => {
    const requestId = inspector.nextId();
    ctx[INSPECTOR] = {
      requestId,
      // 请求开始的时刻, responseReceived 的 timing.requestTime 要用它 —— devtools 拿
      // timing.requestTime 覆盖 startTime, 给成「响应头到达的时刻」的话 duration 就只剩读响应体
      // 的耗时, 没有响应体的响应(304/204)直接算出 0, Time 列判的是 `duration > 0`, 会显示 Pending
      startTime: inspector.timestamp(),
    };

    let postData = '';
    if (ctx.method === 'POST' && (ctx.is('urlencoded') || ctx.is('json') || ctx.is('text'))) {
      let { buffer } = await inspectorUtil.readStream(ctx.req);
      if (buffer) {
        // POST的数据也是可以gzip的
        buffer = await inspectorUtil.decodeContent(buffer, ctx.get('content-encoding'));
        postData = inspectorUtil.buffer2String(buffer as Buffer) || '';
      }
    }

    requestInfoPool.set(requestId, {
      method: ctx.method,
      url: ctx.url,
      headers: ctx.headers,
      postData, // request body
      body: '', // response body
      finished: false,
    });

    inspector.sendAll('Network.requestWillBeSent', {
      request: {
        url: ctx.url,
        method: ctx.method || 'GET',
        headers: inspectorUtil.headersValueToString(ctx.headers || {}),
        postData: postData || '',
      },
      wallTime: Date.now() / 1000,
      initiator: {
        type: 'other',
      },
      type: 'Other',
      // POST 要先把请求体读完才发这条事件, 时间戳还是用请求真正开始的时刻
      ...ctxParams(ctx, ctx[INSPECTOR].startTime),
    });
  };

  const responseReceived = (ctx: ProxyContext) => {
    const { res, req } = ctx;
    const proxyRes = ctx.proxy && ctx.proxy.res;

    // const resHeaders = proxyRes ? proxyRes.headers : res.getHeaders();
    const resHeaders = res.getHeaders();
    const mimeType = inspectorUtil.getMimeType(resHeaders);
    const type = inspectorUtil.getResourceType(mimeType);

    Object.assign(ctx[INSPECTOR], {
      mimeType,
      type,
    });

    const { startTime } = ctx[INSPECTOR];
    // timing 里除了 requestTime 是秒, 其余都是相对 requestTime 的毫秒偏移
    const receiveHeadersEnd = (inspector.timestamp() - startTime) * 1000;

    inspector.sendAll('Network.responseReceived', {
      type,
      response: {
        url: ctx.url,
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: inspectorUtil.headersValueToString(resHeaders),
        headersText: inspectorUtil.headers2text(resHeaders),
        mimeType,
        connectionReused: false,
        connectionId: -1,
        encodedDataLength: -1,
        fromDiskCache: false,
        fromServiceWorker: false,
        timing: {
          requestTime: startTime,
          proxyStart: -1,
          proxyEnd: -1,
          dnsStart: -1,
          dnsEnd: -1,
          connectStart: 0,
          connectEnd: 0,
          sslStart: 0,
          sslEnd: 0,
          workerStart: -1,
          sendStart: 0,
          sendEnd: 0,
          // devtools 的 latency 就是 responseReceivedTime - startTime, 之前写死 0, 一直是 0ms
          receiveHeadersEnd,
        },
        requestHeaders: inspectorUtil.headersValueToString(req.headers),
        requestHeadersText: inspectorUtil.headers2text(req.headers),
        remoteIPAddress: proxyRes ? proxyRes.socket.remoteAddress : '',
        remotePort: proxyRes ? proxyRes.socket.remotePort : '',
        protocol: `http/${req.httpVersion}`,
      },
      ...ctxParams(ctx),
    });
  };

  const readResponseBody = async (ctx: ProxyContext) => {
    let body = ctx.body;
    let totalLength = 0;

    // 没有响应体(HEAD、204/205/304)的直接结束
    if (!body) {
      inspector.sendAll('Network.loadingFinished', {
        encodedDataLength: totalLength,
        ...ctxParams(ctx),
      });
      finishBody(ctx[INSPECTOR].requestId, '');
      return;
    }

    const resContentEncoding = ctx.res.getHeader('content-encoding') as string;
    // koa 3 的 response.get 直接返回 res.getHeader(), 没设置过是 undefined(koa 2 是 '')
    const isEventStream = `${ctx.response.get('content-type') || ''}`.includes('text/event-stream');

    if (body instanceof Stream) {
      const result = await inspectorUtil.readStream(body, {
        onData(chunk) {
          if (isEventStream) {
            if (!resContentEncoding) {
              inspector.sendAll('Network.eventSourceMessageReceived', {
                data: chunk.toString(),
                ...ctxParams(ctx),
              });
            }
          } else {
            inspector.sendAll('Network.dataReceived', {
              dataLength: chunk.length,
              // 前端只在这个值不是 -1 时累加传输量, 不给就会算出 NaN(传输中的 Size 列会花掉)
              encodedDataLength: chunk.length,
              ...ctxParams(ctx),
            });
          }
        },
      });
      body = result.buffer;
      totalLength = result.totalLength;
    }

    let decoded: any = await inspectorUtil.decodeContent(body, resContentEncoding);

    if (isEventStream && resContentEncoding) {
      inspector.sendAll('Network.eventSourceMessageReceived', {
        data: decoded.toString(),
        ...ctxParams(ctx),
      });
    }

    inspector.sendAll('Network.loadingFinished', {
      encodedDataLength: decoded.length,
      ...ctxParams(ctx),
    });

    if (ctx[INSPECTOR].type.match(/Stylesheet|Document|Script|XHR/)) {
      decoded = inspectorUtil.buffer2String(decoded) || decoded;
    }

    finishBody(ctx[INSPECTOR].requestId, decoded);
  };

  inspector
    .on('requestWillBeSent', (ctx: ProxyContext) => {
      if (inspector.hasClient()) {
        requestWillBeSent(ctx)
          .catch(err => {
            console.log('Inpector error', err);
          });
      }
    })
    .on('responseReceived', (ctx: ProxyContext) => {
      if (inspector.hasClient()) {
        // 这个时候只响应头
        responseReceived(ctx);

        readResponseBody(ctx)
          .catch(err => {
            console.log('Inpector error', err);
          });
      }
    });

  const methods = {
    'Network.enable': () => ({
      result: true,
    }),
    'Network.getResponseBody': function ({ params }: InspectorMessage) {
      const info = requestInfoPool.get(params.requestId);
      const body = info && info.body;
      if (body) {
        return body instanceof Buffer ? {
          base64Encoded: true,
          body: body.toString('base64'),
        } : {
          base64Encoded: false,
          body,
        };
      }
      return {
        base64Encoded: false,
        body: '',
      };
    },
    // devtools 只对「还没传完」的请求用这个方法拿响应体(见前端 NetworkRequest.requestStreamingContent:
    // finished 的走 getResponseBody, 否则走这里), 而且结果会被缓存 —— 回 error 的话那条请求的
    // Preview/Response 就永远是空的。SSE 的消息视图也无条件走这条路。
    // 我们没法按 chunk 给出解码后的内容(gzip 要整段解), 所以等响应体读完再一次性回。
    'Network.streamResourceContent': function ({ params }: InspectorMessage) {
      const { requestId } = params;
      const info = requestInfoPool.get(requestId);

      if (!info || info.finished) {
        return {
          bufferedData: body2base64(info && info.body),
        };
      }

      return waitBody(requestId)
        .then(body => ({
          bufferedData: body2base64(body),
        }));
    },
    'Network.setBlockedURLs': function ({ params }: InspectorMessage, client: Client) {
      client.setBlockedURLs(params.urls);
      return {
        result: true,
      };
    },
    'Network.replayXHR': function ({ params }: InspectorMessage) {
      const { requestId } = params;
      const info = requestInfoPool.get(requestId);
      if (info) {
        fetch(info.url, {
          method: info.method,
          headers: info.headers,
          // node-fetch 不允许 GET/HEAD 带 body
          body: /^(GET|HEAD)$/i.test(info.method) ? undefined : info.postData || '',
          agent: proxyAgent(`http://127.0.0.1:${inspector.app.config.port}`, {
            rejectUnauthorized: false,
          }),
          redirect: 'manual',
          // 回放只是让请求重新走一遍代理, 保持请求头和原请求一致, 不额外加 accept-encoding
          compress: false,
        })
          .then(res => {
            // 响应内容不需要, 但要消费掉, 否则连接一直挂着(抓包也就收不到 loadingFinished)
            res.body.resume();
          })
          .catch(() => {
            // ignore
          });
      }
      return {
        result: !!info,
      };
    },
  };

  return {
    methods,
  };
};
