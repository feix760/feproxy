const Stream = require('stream');
const zlib = require('zlib');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');
const Pool = require('../../lib/pool');

module.exports = inspect => {
  let requestId = 0;
  const responseBodyPool = new Pool();

  const ctxParams = ctx => ({
    timestamp: inspect.timestamp(),
    frameId: inspect.frame.id,
    loaderId: inspect.frame.loaderId,
    requestId: ctx.inspect.requestId,
    documentURL: inspect.frame.url,
  });

  const requestWillBeSent = ctx => {
    ctx.inspect = {
      requestId: ++requestId,
    };

    inspect.sendAll('Network.requestWillBeSent', {
      request: {
        url: ctx.url,
        method: ctx.method || 'GET',
        headers: ctx.headers || {},
        postData: ctx.postData || '',
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

    const resHeaders = proxyRes ? proxyRes.headers : res.getHeaders();
    const mimeType = getMimeType(resHeaders);
    const type = getResourceType(mimeType);

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
        headers: resHeaders,
        headersText: getHeadersText(resHeaders),
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
        requestHeaders: req.headers,
        requestHeadersText: getHeadersText(req.headers),
        remoteIPAddress: proxyRes ? proxyRes.socket.remoteAddress : '',
        remotePort: proxyRes ? proxyRes.socket.remotePort : '',
        protocol: `http/${req.httpVersion}`,
      },
      ...ctxParams(ctx),
    });
  };

  const readResponseBody = async ctx => {
    let { body } = ctx;

    if (body instanceof Stream) {
      body = await getStream(body, {
        onData(chunk) {
          inspect.sendAll('Network.dataReceived', {
            dataLength: chunk.length,
            ...ctxParams(ctx),
          });
        },
      });
    }

    let decodedBody = await decodeBody(body, ctx.res.getHeader('content-encoding'));

    inspect.sendAll('Network.loadingFinished', {
      encodedDataLength: decodedBody.length,
      ...ctxParams(ctx),
    });

    if (decodedBody instanceof Buffer && ctx.inspect.type.match(/Stylesheet|Document|Script|XHR/)) {
      try {
        const charset = jschardet.detect(decodedBody).encoding || 'utf-8';
        decodedBody = iconv.decode(decodedBody, charset).toString();
      } catch (err) {
        console.error('Decode text failed', err);
      }
    }

    responseBodyPool.set(ctx.inspect.requestId, decodedBody);
  };

  const getStream = (stream, options = {}) => {
    return new Promise((resolve, reject) => {
      let buff = new Buffer(0);
      stream.on('data', chunk => {
          buff = Buffer.concat([ buff, chunk ]);
          options.onData && options.onData(chunk);
        })
        .on('end', () => {
          resolve(buff);
        })
        .on('error', err => {
          reject(err);
        });
    });
  };

  const decodeBody = (buff, encoding) => {
    return new Promise((resolve, reject) => {
      if (!(buff instanceof Buffer) || !encoding) {
        resolve(buff);
      } else if (encoding.match(/gzip/)) {
        zlib.gunzip(buff, (err, result) => {
          err ? reject(err) : resolve(result);
        });
      } else if (encoding.match(/deflate/)) {
        zlib.inflate(buff, (err, result) => {
          err ? reject(err) : resolve(result);
        });
      } else {
        reject(`Unsupported content encoding: ${encoding}`);
      }
    });
  };

  inspect.on('requestWillBeSent', requestWillBeSent)
    .on('responseReceived', ctx => {
      responseReceived(ctx);

      readResponseBody(ctx)
        .catch(err => console.error(err));
    });

  const methods = {
    'Network.enable': () => ({
      result: true,
    }),
    'Network.getResponseBody'({ params }) {
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

function getResourceType(contentType = '') {
  if (contentType.match('text/css')) {
    return 'Stylesheet';
  }
  if (contentType.match('text/html')) {
    return 'Document';
  }
  if (contentType.match('/(x-)?javascript')) {
    return 'Script';
  }
  if (contentType.match('image/')) {
    return 'Image';
  }
  if (contentType.match('video/')) {
    return 'Media';
  }
  if (contentType.match('font/') || contentType.match('/(x-font-)?woff')) {
    return 'Font';
  }
  if (contentType.match('/(json|xml)')) {
    return 'XHR';
  }
  return 'Other';
}

function getMimeType(headers) {
  const contentType = headers['content-type'] || headers['Content-Type'] || '';

  return contentType.match(/([^;]*)/) && RegExp.$1;
};

function getHeadersText(headers) {
  return Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('\r\n');
}
