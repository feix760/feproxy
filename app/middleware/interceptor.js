
module.exports = async (ctx, next) => {
  // console.log('middleware interceptor');
  await next();
};
