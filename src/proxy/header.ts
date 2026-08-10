import type { ProxyPluginFn } from '../types';

const header: ProxyPluginFn = async (ctx, next, param) => {
  await next();
  Object.keys(param).forEach(key => {
    ctx.set(key, param[key] || '');
  });
};

export default header;
