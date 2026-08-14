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
  /** Whether the response body has been read to the end */
  finished: boolean;
}

/** How long streamResourceContent waits when a body never ends (SSE / long polling) */
const STREAM_TIMEOUT = 30000;

const body2base64 = (body: any) => (
  (Buffer.isBuffer(body) ? body : Buffer.from(body || '')).toString('base64')
);

export default (inspector: Inspector): InspectorModuleResult => {
  const requestInfoPool = new LRUCache<string, RequestInfo>({ max: 1000 });

  /** resolve callbacks of streamResourceContent calls waiting on a body, keyed by requestId */
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
    // Don't keep the process alive just for one unfinished request
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
      // When the request started; responseReceived's timing.requestTime needs it. devtools
      // overwrites startTime with timing.requestTime, so passing "when headers arrived" would
      // reduce duration to just the body read — 0 for bodiless responses (304/204), which the
      // Time column (`duration > 0`) then shows as Pending.
      startTime: inspector.timestamp(),
    };

    let postData = '';
    if (ctx.method === 'POST' && (ctx.is('urlencoded') || ctx.is('json') || ctx.is('text'))) {
      let { buffer } = await inspectorUtil.readStream(ctx.req);
      if (buffer) {
        // POST data can be gzipped too
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
      // POST waits for the request body before this event fires, so use the real start time
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
    // In timing, requestTime is in seconds; everything else is a ms offset from it
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
          // devtools' latency is responseReceivedTime - startTime; hardcoding 0 showed 0ms forever
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

    // Bodiless responses (HEAD, 204/205/304) finish right away
    if (!body) {
      inspector.sendAll('Network.loadingFinished', {
        encodedDataLength: totalLength,
        ...ctxParams(ctx),
      });
      finishBody(ctx[INSPECTOR].requestId, '');
      return;
    }

    const resContentEncoding = ctx.res.getHeader('content-encoding') as string;
    // koa 3's response.get returns res.getHeader() as-is: undefined when unset (koa 2 gave '')
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
              // The frontend only accumulates when this isn't -1; omitting it yields NaN in Size
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
        // Only headers are available at this point
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
    // devtools only uses this for requests that haven't finished transferring (see the frontend's
    // NetworkRequest.requestStreamingContent: finished ones go to getResponseBody), and it caches
    // the result — returning an error leaves that request's Preview/Response empty forever. The
    // SSE message view always comes through here too.
    // We can't hand out decoded content chunk by chunk (gzip must be decoded whole), so we wait
    // for the body to finish and answer in one shot.
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
          // node-fetch forbids a body on GET/HEAD
          body: /^(GET|HEAD)$/i.test(info.method) ? undefined : info.postData || '',
          agent: proxyAgent(`http://127.0.0.1:${inspector.app.config.port}`, {
            rejectUnauthorized: false,
          }),
          redirect: 'manual',
          // A replay just re-runs the request through the proxy: keep the original headers and
          // don't let node-fetch add its own accept-encoding
          compress: false,
        })
          .then(res => {
            // We don't need the body but must drain it, or the connection hangs and the capture
            // side never sees loadingFinished
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
