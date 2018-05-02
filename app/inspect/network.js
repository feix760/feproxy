const Stream = require('stream');
const zlib = require('zlib');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');
const Pool = require('../lib/pool');

module.exports = inspect => {
  const responseBodyPool = new Pool();

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
      let { buffer } = await readStream(ctx.req);
      if (buffer) {
        // POST的数据也是可以gzip的
        buffer = await decodeContent(buffer, ctx.get('content-encoding'));
        postData = buffer2String(buffer) || '';
      }
    }

    inspect.sendAll('Network.requestWillBeSent', {
      request: {
        url: ctx.url,
        method: ctx.method || 'GET',
        headers: convertListHeader(ctx.headers || {}),
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
        headers: convertListHeader(resHeaders),
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
        requestHeaders: convertListHeader(req.headers),
        requestHeadersText: getHeadersText(req.headers),
        remoteIPAddress: proxyRes ? proxyRes.socket.remoteAddress : '',
        remotePort: proxyRes ? proxyRes.socket.remotePort : '',
        protocol: `http/${req.httpVersion}`,
      },
      ...ctxParams(ctx),
    });
  };

  const readResponseBody = async ctx => {
    let buffer = ctx.body, totalLength = 0;

    if (buffer instanceof Stream) {
      const result = await readStream(buffer, {
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

    let decoded = await decodeContent(buffer, ctx.res.getHeader('content-encoding'));

    inspect.sendAll('Network.loadingFinished', {
      encodedDataLength: decoded.length,
      ...ctxParams(ctx),
    });

    if (ctx.inspect.type.match(/Stylesheet|Document|Script|XHR/)) {
      decoded = buffer2String(decoded) || decoded;
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

function readStream(stream, options = {}) {
  options = {
    maxLength: 1024 * 1024 * 2,
    ...options,
  };
  return new Promise((resolve, reject) => {
    let totalLength = 0;
    let chunkList = [];
    stream.on('data', chunk => {
      totalLength += chunk.length;
      if (totalLength < options.maxLength) {
        chunkList.push(chunk);
      } else {
        chunkList = null;
      }
      options.onData && options.onData(chunk);
    })
      .on('end', () => {
        resolve({
          buffer: chunkList && Buffer.concat(chunkList),
          totalLength,
        });
      })
      .on('error', err => {
        reject(err);
      });
  });
}

function decodeContent(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (!(buffer instanceof Buffer) || typeof encoding !== 'string' || !encoding) {
      resolve(buffer);
    } else if (encoding.match(/gzip/)) {
      zlib.gunzip(buffer, (err, result) => {
        err ? reject(err) : resolve(result);
      });
    } else if (encoding.match(/deflate/)) {
      zlib.inflate(buffer, (err, result) => {
        err ? reject(err) : resolve(result);
      });
    } else {
      reject(`Unsupported content encoding: ${encoding}`);
    }
  });
}

function buffer2String(buffer) {
  try {
    const charset = jschardet.detect(buffer.slice(0, 1024)).encoding || 'utf-8';
    return iconv.decode(buffer, charset).toString();
  } catch (err) {
    console.error('Decode text failed', err);
  }
  return null;
}

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

function convertListHeader(headers) {
  if (headers) {
    Object.keys(headers).forEach(key => {
      const value = headers[key];
      if (Array.isArray(value)) {
        headers[key] = value.join('\n');
      }
    });
  }
  return headers;
}
