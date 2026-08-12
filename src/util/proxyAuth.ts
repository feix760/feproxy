import type { AuthConfig } from './ProxyConfig';

/** 是否需要做代理账号验证 */
export const needAuth = (auth?: AuthConfig) => {
  return !!(auth && auth.enable && auth.username);
};

/** 校验 `Basic base64(username:password)` 凭据 */
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

/** 首包报文是否是代理请求(`CONNECT host:port` 或 `GET http://host/path`), 只有代理请求才需要验证 */
export const isProxyRaw = (raw: string) => {
  return /^CONNECT\b/i.test(raw) || /^[a-z]+\s+https?:\/\//i.test(raw);
};

/** 从原始报文头中取出 proxy-authorization (CONNECT 阶段还没有 http server 解析报文) */
export const getRawProxyAuthorization = (raw: string) => {
  const match = /\r\nproxy-authorization:[ \t]*([^\r\n]*)/i.exec(raw);
  return match ? match[1] : '';
};

export const AUTHENTICATE = 'Basic realm="feproxy"';

/** 407 响应报文, 用于 CONNECT 阶段直接写回 socket */
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
