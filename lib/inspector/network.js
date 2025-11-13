const Stream = require('stream');
const LRU = require('lru-cache');
const rp = require('request-promise');
const inspectorUtil = require('../util/inspectorUtil');
const INSPECTOR = Symbol('INSPECTOR');

module.exports = inspector => {
  const requestInfoPool = new LRU(1000);

  const ctxParams = ctx => ({
    timestamp: inspector.timestamp(),
    frameId: inspector.frame.id,
    loaderId: inspector.frame.loaderId,
    requestId: ctx[INSPECTOR].requestId,
    documentURL: inspector.frame.url,
  });

  const requestWillBeSent = async ctx => {
    const requestId = inspector.nextId();
    ctx[INSPECTOR] = {
      requestId,
    };

    let postData = '';
    if (ctx.method === 'POST' && (ctx.is('urlencoded') || ctx.is('json') || ctx.is('text'))) {
      let { buffer } = await inspectorUtil.readStream(ctx.req);
      if (buffer) {
        // POST的数据也是可以gzip的
        buffer = await inspectorUtil.decodeContent(buffer, ctx.get('content-encoding'));
        postData = inspectorUtil.buffer2String(buffer) || '';
      }
    }

    requestInfoPool.set(requestId, {
      method: ctx.method,
      url: ctx.url,
      headers: ctx.headers,
      postData, // request body
      body: '', // response body
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
      ...ctxParams(ctx),
    });
  };

  const responseReceived = ctx => {
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
          requestTime: inspector.timestamp(),
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
          receiveHeadersEnd: 0,
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

  const readResponseBody = async ctx => {
    let buffer = ctx.body,
      totalLength = 0;

    const isEventStream = ctx.response.get('content-type').includes('text/event-stream');

    if (buffer instanceof Stream) {
      const result = await inspectorUtil.readStream(buffer, {
        onData(chunk) {
          if (isEventStream) {
            inspector.sendAll('Network.eventSourceMessageReceived', {
              data: chunk.toString(),
              ...ctxParams(ctx),
            });
          } else {
            inspector.sendAll('Network.dataReceived', {
              dataLength: chunk.length,
              ...ctxParams(ctx),
            });
          }
        },
      });
      buffer = result.buffer;
      totalLength = result.totalLength;
    }

    if (!buffer) {
      inspector.sendAll('Network.loadingFinished', {
        encodedDataLength: totalLength,
        ...ctxParams(ctx),
      });
      return;
    }

    let decoded = await inspectorUtil.decodeContent(buffer, ctx.res.getHeader('content-encoding'));

    inspector.sendAll('Network.loadingFinished', {
      encodedDataLength: decoded.length,
      ...ctxParams(ctx),
    });

    if (ctx[INSPECTOR].type.match(/Stylesheet|Document|Script|XHR/)) {
      decoded = inspectorUtil.buffer2String(decoded) || decoded;
    }

    const info = requestInfoPool.get(ctx[INSPECTOR].requestId);
    if (info) {
      info.body = decoded;
    }
  };

  inspector
    .on('requestWillBeSent', ctx => {
      if (inspector.hasClient()) {
        requestWillBeSent(ctx)
          .catch(err => {
            console.log('Inpector error', err);
          });
      }
    })
    .on('responseReceived', ctx => {
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
    'Network.getResponseBody': function({ params }) {
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
    'Network.setBlockedURLs': function({ params }, client) {
      client.setBlockedURLs(params.urls);
      return {
        result: true,
      };
    },
    'Network.replayXHR': function({ params }) {
      const { requestId } = params;
      const info = requestInfoPool.get(requestId);
      if (info) {
        rp({
          url: info.url,
          method: info.method,
          headers: info.headers,
          body: info.postData || '',
          proxy: `http://127.0.0.1:${inspector.app.config.port}`,
          strictSSL: false,
          followRedirect: false,
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
