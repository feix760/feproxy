import type { Stream } from 'stream';
import { promisify } from 'util';
import zlib from 'zlib';
import brotli from 'brotli';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

type Headers = Record<string, any>;

/** convert headers object to raw header text */
export function headers2text(headers: Headers) {
  return Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('\r\n');
}

/** covert array value to string */
export function headersValueToString(headers: Headers) {
  headers = headers || {};
  const ret: Record<string, string> = {};
  Object.keys(headers).forEach(key => {
    const value = headers[key];
    ret[key] = Array.isArray(value) ? value.join('\n') : value;
  });
  return ret;
}

/** detect buffer encoding then decode to string */
export function buffer2String(buffer: Buffer): string {
  try {
    const charset = jschardet.detect(buffer.slice(0, 1024)).encoding || 'utf-8';
    return iconv.decode(buffer, charset).toString();
  } catch (err) {
    console.error('Decode text failed', err);
  }
  return null;
}

/** get chrome's resourceType */
export function getResourceType(contentType = '') {
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

/** get mime type from headers */
export function getMimeType(headers: Headers) {
  const contentType = headers['content-type'] || '';

  return contentType.match(/([^;]*)/) && RegExp.$1;
}

/** decode gzip/deflate/br/zstd buffer */
export async function decodeContent(buffer: any, encoding?: string): Promise<Buffer> {
  if (!buffer) {
    return Buffer.alloc(0);
  }
  let decoded;
  if (buffer instanceof Buffer && encoding) {
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
    } else if (encoding.match(/\bzstd\b/)) {
      decoded = await promisify(zlib.zstdDecompress)(buffer);
    } else {
      throw new Error(`Unsupported content encoding: ${encoding}`);
    }
  } else {
    decoded = buffer;
  }
  return decoded;
}

export interface ReadStreamOptions {
  /** Max buffer length */
  maxLength?: number;
  /** Data event callback */
  onData?: (chunk: Buffer) => void;
}

export interface ReadStreamResult {
  buffer: Buffer | string;
  totalLength: number;
}

/** read stream to end */
export function readStream(stream: Stream, options: ReadStreamOptions = {}): Promise<ReadStreamResult> {
  options = {
    maxLength: 1024 * 1024 * 2,
    onData: null,
    ...options,
  };
  return new Promise((resolve, reject) => {
    let totalLength = 0;
    let chunkList: Buffer[] = [];
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
}
