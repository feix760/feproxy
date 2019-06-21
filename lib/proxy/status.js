
module.exports = async (ctx, next, param) => {
  ctx.status = param.status;
  if (param.location) {
    ctx.set('location', param.location); // 302 location
  }
};
