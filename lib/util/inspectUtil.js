const jschardet = require('jschardet');
const zlib = require('zlib');
const iconv = require('iconv-lite');

/**
 * convert headers object to list
 * @param {Object} headers
 * @return {Array}
 */
exports.headers2text = function(headers) {
  return Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('\r\n');
};

/**
 * covert array value to string
 * @param {Object} headers
 * @return {Object}
 */
exports.headersValueToString = function(headers) {
  headers = headers || {};
  const ret = {};
  Object.keys(headers).forEach(key => {
    const value = headers[key];
    ret[key] = Array.isArray(value) ? value.join('\n') : value;
  });
  return ret;
};

/**
 * detect buffer encoding then decode to string
 * @param {Buffer} buffer
 * @return {String}
 */
exports.buffer2String = function(buffer) {
  try {
    const charset = jschardet.detect(buffer.slice(0, 1024)).encoding || 'utf-8';
    return iconv.decode(buffer, charset).toString();
  } catch (err) {
    console.error('Decode text failed', err);
  }
  return null;
};

/**
 * get chrome's resourceType
 * @param {String} contentType
 * @return {String}
 */
exports.getResourceType = function(contentType = '') {
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
};

/**
 * get mime type from headers
 * @param {Object} headers
 * @return {String}
 */
exports.getMimeType = function(headers) {
  const contentType = headers['content-type'] || '';

  return contentType.match(/([^;]*)/) && RegExp.$1;
};

/**
 * decode gzip/deflate buffer
 * @param {Buffer} buffer
 * @param {String} encoding
 * @return {Promise<Buffer>}
 */
exports.decodeContent = function(buffer, encoding) {
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
};

/**
 * read stream to end
 * @param {Stream} stream
 * @param {Object} options
 * @param {Number} options.maxLength Max buffer length
 * @param {Function} options.onData Data event callback
 */
exports.readStream = function(stream, options = {}) {
  options = {
    maxLength: 1024 * 1024 * 2,
    onData: null,
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
};
