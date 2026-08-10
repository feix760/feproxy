import type { ProxyContext } from '../types';

export default async (ctx: ProxyContext, next: () => Promise<void>) => {
  ctx.app.inspector.emit('requestWillBeSent', ctx);
  await next();
  ctx.app.inspector.emit('responseReceived', ctx);
};
