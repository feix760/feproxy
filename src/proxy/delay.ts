import type { ProxyPluginFn } from '../types';

const delay: ProxyPluginFn = async (ctx, next, param) => {
  if (param.delay) {
    await new Promise(resolve => setTimeout(resolve, param.delay));
  }
  await next();
};

export default delay;
