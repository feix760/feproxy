import type { ProxyContext } from '../types';

export default async (ctx: ProxyContext, next: () => Promise<void>) => {
  // With capture off, just forward and push nothing to devtools
  if (!ctx.app.config.inspect) {
    await next();
    return;
  }

  ctx.app.inspector.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  ctx.app.inspector.emit('webSocketHandshakeResponseReceived', ctx);
};
