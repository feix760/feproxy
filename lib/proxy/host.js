
module.exports = async (ctx, next, param, plugins) => {
  plugins.forEach(item => {
    if (item.type === 'http') {
      if (param.hostname) {
        item.param.hostname = param.hostname;
      }
      if (param.port) {
        item.param.port = param.port;
      }
    }
  });
  await next();
};
