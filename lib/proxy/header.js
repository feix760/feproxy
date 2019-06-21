
module.exports = async (ctx, next, param) => {
  await next();
  Object.keys(param).forEach(key => {
    ctx.set(key, param[key] || '');
  });
};
