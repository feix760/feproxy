
module.exports = async (ctx, next, param) => {
  if (param.delay) {
    await new Promise(resolve => setTimeout(resolve, param.delay));
  }
  await next();
};
