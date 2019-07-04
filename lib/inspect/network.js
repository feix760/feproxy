const Stream = require('stream');
const LRU = require('lru-cache');
const inspectUtil = require('../util/inspectUtil');

module.exports = inspect => {
  const responseBodyPool = new LRU(1000);

  const ctxParams = ctx => ({
    timestamp: inspect.timestamp(),
    frameId: inspect.frame.id,
    loaderId: inspect.frame.loaderId,
    requestId: ctx.inspect.requestId,
    documentURL: inspect.frame.url,
  });

  const requestWillBeSent = async ctx => {
    ctx.inspect = {
      requestId: inspect.nextId(),
    };

    let postData = '';
    if (ctx.method === 'POST' && (ctx.is('urlencoded') || ctx.is('json') || ctx.is('text'))) {
      let { buffer } = await inspectUtil.readStream(ctx.req);
      if (buffer) {
        // POST的数据也是可以gzip的
        buffer = await inspectUtil.decodeContent(buffer, ctx.get('content-encoding'));
        postData = inspectUtil.buffer2String(buffer) || '';
      }
    }

    inspect.sendAll('Network.requestWillBeSent', {
      request: {
        url: ctx.url,
        method: ctx.method || 'GET',
        headers: inspectUtil.headersValueToString(ctx.headers || {}),
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
    const mimeType = inspectUtil.getMimeType(resHeaders);
    const type = inspectUtil.getResourceType(mimeType);

    Object.assign(ctx.inspect, {
      mimeType,
      type,
    });

    inspect.sendAll('Network.responseReceived', {
      type,
      response: {
        url: ctx.url,
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: inspectUtil.headersValueToString(resHeaders),
        headersText: inspectUtil.headers2text(resHeaders),
        mimeType,
        connectionReused: false,
        connectionId: -1,
        encodedDataLength: -1,
        fromDiskCache: false,
        fromServiceWorker: false,
        timing: {
          requestTime: inspect.timestamp(),
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
        requestHeaders: inspectUtil.headersValueToString(req.headers),
        requestHeadersText: inspectUtil.headers2text(req.headers),
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

    if (buffer instanceof Stream) {
      const result = await inspectUtil.readStream(buffer, {
        onData(chunk) {
          inspect.sendAll('Network.dataReceived', {
            dataLength: chunk.length,
            ...ctxParams(ctx),
          });
        },
      });
      buffer = result.buffer;
      totalLength = result.totalLength;
    }

    if (!buffer) {
      inspect.sendAll('Network.loadingFinished', {
        encodedDataLength: totalLength,
        ...ctxParams(ctx),
      });
      return;
    }

    let decoded = await inspectUtil.decodeContent(buffer, ctx.res.getHeader('content-encoding'));

    inspect.sendAll('Network.loadingFinished', {
      encodedDataLength: decoded.length,
      ...ctxParams(ctx),
    });

    if (ctx.inspect.type.match(/Stylesheet|Document|Script|XHR/)) {
      decoded = inspectUtil.buffer2String(decoded) || decoded;
    }

    responseBodyPool.set(ctx.inspect.requestId, decoded);
  };

  inspect
    .on('requestWillBeSent', ctx => {
      if (inspect.hasClient()) {
        requestWillBeSent(ctx)
          .catch(err => console.error(ctx.url, err));
      }
    })
    .on('responseReceived', ctx => {
      if (inspect.hasClient()) {
        responseReceived(ctx);

        readResponseBody(ctx)
          .catch(err => console.error(ctx.url, err));
      }
    });

  const methods = {
    'Network.enable': () => ({
      result: true,
    }),
    'Network.getResponseBody': function({ params }) {
      const data = responseBodyPool.get(params.requestId);
      if (data) {
        return data instanceof Buffer ? {
          base64Encoded: true,
          body: data.toString('base64'),
        } : {
          base64Encoded: false,
          body: data,
        };
      }
      return {
        base64Encoded: false,
        body: '',
      };
    },
  };

  return {
    methods,
  };
};
