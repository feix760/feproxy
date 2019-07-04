
/**
 * set access controll allow
 * @param {Context} ctx
 */
exports.setAccessControlAllow = function(ctx) {
  ctx.set('access-control-allow-credentials', 'true');
  ctx.set('access-control-allow-methods', 'GET,HEAD,PUT,POST,DELETE');
  ctx.set('access-control-allow-origin', ctx.get('origin') || '*');
  if (ctx.get('access-control-request-headers')) {
    ctx.set('access-control-allow-headers', ctx.get('access-control-request-headers'));
  }
};

/**
 * set 204 to OPTIONS...
 * @param {Context} ctx
 */
exports.setNOContentMethod = function(ctx) {
  if (ctx.method !== 'POST' && ctx.method !== 'GET') {
    ctx.status = 204;
    return true;
  }
  return false;
};
