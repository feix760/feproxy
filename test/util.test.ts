import { PassThrough, Readable } from 'stream';
import { promisify } from 'util';
import zlib from 'zlib';
import iconv from 'iconv-lite';
import catchError from '../src/util/catchError';
import { setAccessControlAllow, setNOContentMethod } from '../src/util/ctxUtil';
import {
  buffer2String,
  decodeContent,
  getMimeType,
  getResourceType,
  headers2text,
  headersValueToString,
  readStream,
} from '../src/util/inspectorUtil';
import pickDefined from '../src/util/pickDefined';
import createProxyAgent from '../src/util/proxyAgent';
import * as proxyAuth from '../src/util/proxyAuth';

/** A ctx stub implementing only what the methods under test use */
function mockCtx(options: { headers?: Record<string, string>; method?: string } = {}) {
  const headers = options.headers || {};
  const responseHeaders: Record<string, string> = {};
  return {
    method: options.method || 'GET',
    status: 200,
    get: (key: string) => headers[key.toLowerCase()] || '',
    set: (key: string, value: string) => {
      responseHeaders[key.toLowerCase()] = value;
    },
    responseHeaders,
  } as any;
}

describe('inspectorUtil test', () => {
  test('headers2text', () => {
    expect(headers2text({ host: 'a.com', 'x-a': 1 })).toEqual('host: a.com\r\nx-a: 1');
    expect(headers2text({})).toEqual('');
  });

  test('headersValueToString', () => {
    expect(headersValueToString({ 'set-cookie': [ 'a=1', 'b=2' ], host: 'a.com' })).toEqual({
      'set-cookie': 'a=1\nb=2',
      host: 'a.com',
    });
    expect(headersValueToString(null)).toEqual({});
  });

  test('buffer2String', () => {
    // Short text isn't enough to detect a charset; utf-8/gbk only get recognized on longer input
    const text = '这是一段用于编码检测的中文文本，需要足够长才能被正确识别。'.repeat(5);
    expect(buffer2String(Buffer.from('hello world'))).toEqual('hello world');
    expect(buffer2String(Buffer.from(text))).toEqual(text);
    expect(buffer2String(iconv.encode(text, 'gbk'))).toEqual(text);
    // A non-buffer argument takes the catch branch
    expect(buffer2String(null)).toEqual(null);
  });

  test('getResourceType', () => {
    expect(getResourceType('text/css')).toEqual('Stylesheet');
    expect(getResourceType('text/html; charset=utf-8')).toEqual('Document');
    expect(getResourceType('application/javascript')).toEqual('Script');
    expect(getResourceType('application/x-javascript')).toEqual('Script');
    expect(getResourceType('image/png')).toEqual('Image');
    expect(getResourceType('video/mp4')).toEqual('Media');
    expect(getResourceType('font/ttf')).toEqual('Font');
    expect(getResourceType('application/x-font-woff')).toEqual('Font');
    expect(getResourceType('application/json')).toEqual('XHR');
    expect(getResourceType('application/xml')).toEqual('XHR');
    expect(getResourceType('application/octet-stream')).toEqual('Other');
    expect(getResourceType()).toEqual('Other');
  });

  test('getMimeType', () => {
    expect(getMimeType({ 'content-type': 'text/html; charset=utf-8' })).toEqual('text/html');
    expect(getMimeType({ 'content-type': 'text/html' })).toEqual('text/html');
    expect(getMimeType({})).toEqual('');
  });

  describe('decodeContent', () => {
    const raw = Buffer.from('hello feproxy');

    test('empty buffer', async () => {
      expect(await decodeContent(null)).toEqual(Buffer.alloc(0));
      expect(await decodeContent(undefined)).toEqual(Buffer.alloc(0));
    });

    test('no encoding', async () => {
      expect(await decodeContent(raw)).toEqual(raw);
      // Anything that isn't a Buffer comes back untouched
      expect(await decodeContent('text', 'gzip')).toEqual('text');
    });

    test('gzip', async () => {
      const buffer = await promisify(zlib.gzip)(raw);
      expect(await decodeContent(buffer, 'gzip')).toEqual(raw);
    });

    test('deflate', async () => {
      const buffer = await promisify(zlib.deflate)(raw);
      expect(await decodeContent(buffer, 'deflate')).toEqual(raw);
    });

    test('br', async () => {
      const buffer = await promisify(zlib.brotliCompress)(raw);
      expect(await decodeContent(buffer, 'br')).toEqual(raw);
    });

    test('zstd', async () => {
      if (!zlib.zstdCompress) {
        return;
      }
      const buffer = await promisify(zlib.zstdCompress)(raw);
      expect(await decodeContent(buffer, 'zstd')).toEqual(raw);
    });

    test('unsupported encoding', async () => {
      await expect(decodeContent(raw, 'unknown')).rejects.toThrow('Unsupported content encoding: unknown');
    });
  });

  describe('readStream', () => {
    test('read to end', async () => {
      const chunks: Buffer[] = [];
      const result = await readStream(Readable.from([ Buffer.from('ab'), Buffer.from('cd') ]), {
        onData: chunk => chunks.push(chunk),
      });
      expect(result.buffer.toString()).toEqual('abcd');
      expect(result.totalLength).toEqual(4);
      expect(Buffer.concat(chunks).toString()).toEqual('abcd');
    });

    test('too large body', async () => {
      const result = await readStream(Readable.from([ Buffer.alloc(10) ]), {
        maxLength: 4,
      });
      expect(result.buffer).toEqual('Too large body');
      expect(result.totalLength).toEqual(10);
    });

    test('reject on error', async () => {
      const stream = new PassThrough();
      const promise = readStream(stream);
      stream.emit('error', new Error('stream error'));
      await expect(promise).rejects.toThrow('stream error');
    });
  });
});

describe('pickDefined test', () => {
  test('remove undefined value', () => {
    expect(pickDefined({ a: 1, b: undefined, c: null, d: false })).toEqual({ a: 1, c: null, d: false });
  });

  test('empty input', () => {
    expect(pickDefined()).toEqual({});
    expect(pickDefined(null)).toEqual({});
  });
});

describe('ctxUtil test', () => {
  test('setAccessControlAllow without origin', () => {
    const ctx = mockCtx();
    setAccessControlAllow(ctx);
    expect(ctx.responseHeaders['access-control-allow-origin']).toEqual('*');
    expect(ctx.responseHeaders['access-control-allow-credentials']).toEqual('true');
    expect(ctx.responseHeaders['access-control-allow-headers']).toBeUndefined();
  });

  test('setAccessControlAllow with origin and request headers', () => {
    const ctx = mockCtx({
      headers: {
        origin: 'https://feproxy.org',
        'access-control-request-headers': 'x-a,x-b',
      },
    });
    setAccessControlAllow(ctx);
    expect(ctx.responseHeaders['access-control-allow-origin']).toEqual('https://feproxy.org');
    expect(ctx.responseHeaders['access-control-allow-headers']).toEqual('x-a,x-b');
  });

  test('setNOContentMethod', () => {
    expect(setNOContentMethod(mockCtx({ method: 'GET' }))).toEqual(false);
    expect(setNOContentMethod(mockCtx({ method: 'POST' }))).toEqual(false);

    const ctx = mockCtx({ method: 'OPTIONS' });
    expect(setNOContentMethod(ctx)).toEqual(true);
    expect(ctx.status).toEqual(204);
  });
});

describe('catchError test', () => {
  test('destroy stream when it is the only error listener', () => {
    const stream = new PassThrough();
    catchError(stream);
    stream.emit('error', new Error('reset'));
    expect(stream.destroyed).toEqual(true);
  });

  test('keep stream alive when others listen on error', () => {
    const stream = new PassThrough();
    catchError(stream);
    stream.on('error', () => {});
    stream.emit('error', new Error('reset'));
    expect(stream.destroyed).toEqual(false);
    stream.destroy();
  });

  test('add listener only once', () => {
    const stream = new PassThrough();
    catchError(stream);
    catchError(stream);
    expect(stream.listeners('error').length).toEqual(2);
    stream.destroy();
  });

  test('ignore empty stream', () => {
    expect(() => catchError(null)).not.toThrow();
  });
});

describe('proxyAgent test', () => {
  test('pick agent by target protocol', () => {
    const getAgent = createProxyAgent('http://user:pass@127.0.0.1:8888');
    const httpsAgent = getAgent(new URL('https://a.com/'));
    const httpAgent = getAgent(new URL('http://a.com/'));

    expect(httpsAgent).not.toBe(httpAgent);
    expect((httpsAgent as any).rejectUnauthorized).toEqual(true);
    // Same protocol, same instance
    expect(getAgent(new URL('https://b.com/'))).toBe(httpsAgent);
  });

  test('rejectUnauthorized false is kept', () => {
    const getAgent = createProxyAgent('http://127.0.0.1:8888', { rejectUnauthorized: false });
    expect((getAgent(new URL('https://a.com/')) as any).rejectUnauthorized).toEqual(false);
  });
});

describe('proxyAuth test', () => {
  const auth = { enable: true, username: 'feproxy', password: 'feproxy' };
  const basic = (username: string, password: string) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  test('needAuth', () => {
    expect(proxyAuth.needAuth(auth)).toEqual(true);
    expect(proxyAuth.needAuth()).toEqual(false);
    expect(proxyAuth.needAuth({ ...auth, enable: false })).toEqual(false);
    expect(proxyAuth.needAuth({ ...auth, username: '' })).toEqual(false);
  });

  test('verifyCredentials', () => {
    expect(proxyAuth.verifyCredentials(basic('feproxy', 'feproxy'), auth)).toEqual(true);
    // Case and extra spaces don't matter
    expect(proxyAuth.verifyCredentials(` basic  ${basic('feproxy', 'feproxy').slice(6)}`, auth)).toEqual(true);
    expect(proxyAuth.verifyCredentials(basic('feproxy', 'wrong'), auth)).toEqual(false);
    expect(proxyAuth.verifyCredentials(basic('wrong', 'feproxy'), auth)).toEqual(false);
    expect(proxyAuth.verifyCredentials('', auth)).toEqual(false);
    expect(proxyAuth.verifyCredentials(null, auth)).toEqual(false);
    expect(proxyAuth.verifyCredentials('Bearer token', auth)).toEqual(false);
    // No colon separator
    expect(proxyAuth.verifyCredentials(`Basic ${Buffer.from('feproxy').toString('base64')}`, auth)).toEqual(false);
    // Empty password
    expect(proxyAuth.verifyCredentials(basic('feproxy', ''), { ...auth, password: '' })).toEqual(true);
  });

  test('isProxyRaw', () => {
    expect(proxyAuth.isProxyRaw('CONNECT a.com:443 HTTP/1.1\r\n')).toEqual(true);
    expect(proxyAuth.isProxyRaw('connect a.com:443 HTTP/1.1\r\n')).toEqual(true);
    expect(proxyAuth.isProxyRaw('GET http://a.com/a HTTP/1.1\r\n')).toEqual(true);
    expect(proxyAuth.isProxyRaw('POST https://a.com/a HTTP/1.1\r\n')).toEqual(true);
    // A direct hit on our own site
    expect(proxyAuth.isProxyRaw('GET /getConfig HTTP/1.1\r\n')).toEqual(false);
    expect(proxyAuth.isProxyRaw('\x16\x03\x01')).toEqual(false);
  });

  test('getRawProxyAuthorization', () => {
    const raw = [
      'CONNECT a.com:443 HTTP/1.1',
      'Host: a.com:443',
      'Proxy-Authorization: Basic abc',
      '',
      '',
    ].join('\r\n');
    expect(proxyAuth.getRawProxyAuthorization(raw)).toEqual('Basic abc');
    expect(proxyAuth.getRawProxyAuthorization('CONNECT a.com:443 HTTP/1.1\r\n\r\n')).toEqual('');
  });

  test('getProxyAuthRequiredRaw', () => {
    const raw = proxyAuth.getProxyAuthRequiredRaw();
    expect(raw).toContain('407 Proxy Authentication Required');
    expect(raw).toContain(`Proxy-Authenticate: ${proxyAuth.AUTHENTICATE}`);
    expect(raw.endsWith('\r\n\r\n')).toEqual(true);
  });
});
