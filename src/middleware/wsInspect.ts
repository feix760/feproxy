import type { ProxyContext } from '../types';

export default async (ctx: ProxyContext, next: () => Promise<void>) => {
  ctx.app.inspector.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  ctx.app.inspector.emit('webSocketHandshakeResponseReceived', ctx);
};
