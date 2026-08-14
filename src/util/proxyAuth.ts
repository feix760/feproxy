import type { AuthConfig } from './ProxyConfig';

export const needAuth = (auth?: AuthConfig) => {
  return !!(auth && auth.enable && auth.username);
};

/** Verify a `Basic base64(username:password)` credential */
export const verifyCredentials = (credentials: string, auth: AuthConfig) => {
  const match = /^\s*Basic\s+(\S+)/i.exec(credentials || '');
  if (!match) {
    return false;
  }

  let decoded = '';
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch (err) {
    return false;
  }

  const index = decoded.indexOf(':');
  if (index < 0) {
    return false;
  }

  return decoded.slice(0, index) === auth.username &&
    decoded.slice(index + 1) === (auth.password || '');
};

/** Is the first packet a proxy request (`CONNECT host:port` / `GET http://host/path`)? Only those need auth */
export const isProxyRaw = (raw: string) => {
  return /^CONNECT\b/i.test(raw) || /^[a-z]+\s+https?:\/\//i.test(raw);
};

/** Read proxy-authorization out of the raw headers (during CONNECT no http server has parsed them yet) */
export const getRawProxyAuthorization = (raw: string) => {
  const match = /\r\nproxy-authorization:[ \t]*([^\r\n]*)/i.exec(raw);
  return match ? match[1] : '';
};

export const AUTHENTICATE = 'Basic realm="feproxy"';

/** Raw 407 response, written straight back to the socket during CONNECT */
export const getProxyAuthRequiredRaw = () => {
  return [
    'HTTP/1.1 407 Proxy Authentication Required',
    `Proxy-Authenticate: ${AUTHENTICATE}`,
    'Proxy-Agent: feproxy',
    'Content-Length: 0',
    'Connection: close',
    '',
    '',
  ].join('\r\n');
};
