import type { ProxyContext } from '../types';

export default async (ctx: ProxyContext, next: () => Promise<void>) => {
  // 关闭抓包时只做转发, 不向 devtools 推送事件
  if (!ctx.app.config.inspect) {
    await next();
    return;
  }

  ctx.app.inspector.emit('webSocketWillSendHandshakeRequest', ctx);
  await next();
  ctx.app.inspector.emit('webSocketHandshakeResponseReceived', ctx);
};
