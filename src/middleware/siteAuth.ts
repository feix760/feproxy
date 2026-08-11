import * as proxyAuth from '../util/proxyAuth';
import type { ProxyContext } from '../types';

/**
 * feproxy 自身站点的 Basic 验证
 * https 直连时首包是 TLS ClientHello, 无法在 socket 层校验, 只能解密后在这里做
 */
export default async (ctx: ProxyContext, next: () => Promise<void>) => {
  const { auth } = ctx.app.config;

  if (proxyAuth.needAuth(auth) && !proxyAuth.verifyCredentials(ctx.get('authorization'), auth)) {
    ctx.set('WWW-Authenticate', proxyAuth.AUTHENTICATE);
    ctx.status = 401;
    return;
  }

  await next();
};
