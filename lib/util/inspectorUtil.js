const { promisify } = require('util');
const jschardet = require('jschardet');
const zlib = require('zlib');
const brotli = require('brotli');
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
exports.decodeContent = async function(buffer, encoding) {
  let decoded = buffer;
  if (buffer instanceof Buffer && typeof encoding === 'string' && encoding) {
    if (encoding.match(/\bgzip\b/)) {
      decoded = await promisify(zlib.gunzip)(buffer);
    } else if (encoding.match(/\bdeflate\b/)) {
      decoded = await promisify(zlib.inflate)(buffer);
    } else if (encoding.match(/\bbr\b/)) {
      if (zlib.brotliDecompress) { // node>=10
        decoded = await promisify(zlib.brotliDecompress)(buffer);
      } else {
        decoded = Buffer.from(brotli.decompress(buffer));
      }
    } else {
      throw new Error(`Unsupported content encoding: ${encoding}`);
    }
  }
  return decoded;
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
          buffer: chunkList ? Buffer.concat(chunkList) : 'Too large body',
          totalLength,
        });
      })
      .on('error', err => {
        reject(err);
      });
  });
};
