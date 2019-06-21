const fs = require('fs-extra');
const mime = require('mime-types');
const ctxUtil = require('../util/ctxUtil');

module.exports = async (ctx, next, param) => {
  ctxUtil.setAccessControlAllow(ctx);

  if (ctxUtil.setNOContentMethod(ctx)) {
    return;
  }

  const filePath = param.path;
  const stat = filePath && await fs.exists(filePath) && await fs.stat(filePath);

  if (stat && stat.isFile()) {
    ctx.type = mime.lookup(filePath);
    ctx.set('cache-control', 'max-age=0'); // disable cache
    ctx.body = fs.createReadStream(filePath);
  } else {
    ctx.status = 404;
    console.error('file forwarding not exists', ctx.dest.href);
  }
};
