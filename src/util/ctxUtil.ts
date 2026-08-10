import type { ProxyContext } from '../types';

export function setAccessControlAllow(ctx: ProxyContext) {
  ctx.set('access-control-allow-credentials', 'true');
  ctx.set('access-control-allow-methods', 'GET,HEAD,PUT,POST,DELETE');
  ctx.set('access-control-allow-origin', ctx.get('origin') || '*');
  if (ctx.get('access-control-request-headers')) {
    ctx.set('access-control-allow-headers', ctx.get('access-control-request-headers'));
  }
}

/** Short-circuits anything that is neither POST nor GET with a 204. */
export function setNOContentMethod(ctx: ProxyContext) {
  if (ctx.method !== 'POST' && ctx.method !== 'GET') {
    ctx.status = 204;
    return true;
  }
  return false;
}
