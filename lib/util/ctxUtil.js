
function setAccessControlAllow(ctx) {
  ctx.set('access-control-allow-credentials', 'true');
  ctx.set('access-control-allow-methods', 'GET,HEAD,PUT,POST,DELETE');
  ctx.set('access-control-allow-origin', ctx.get('origin') || '*');
  if (ctx.get('access-control-request-headers')) {
    ctx.set('access-control-allow-headers', ctx.get('access-control-request-headers'));
  }
}

function setNOContentMethod(ctx) {
  if (ctx.method !== 'POST' && ctx.method !== 'GET') {
    ctx.status = 204;
    return true;
  }
  return false;
}

exports.setAccessControlAllow = setAccessControlAllow;
exports.setNOContentMethod = setNOContentMethod;
