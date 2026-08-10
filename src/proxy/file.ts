import fs from 'fs-extra';
import mime from 'mime-types';
import * as ctxUtil from '../util/ctxUtil';
import type { ProxyPluginFn } from '../types';

const file: ProxyPluginFn = async (ctx, next, param) => {
  ctxUtil.setAccessControlAllow(ctx);

  if (ctxUtil.setNOContentMethod(ctx)) {
    return;
  }

  const filePath = param.path;
  const stat = filePath && await fs.pathExists(filePath) && await fs.stat(filePath);

  if (stat && stat.isFile()) {
    ctx.type = mime.lookup(filePath) || '';
    ctx.set('cache-control', 'max-age=0'); // disable cache
    ctx.body = fs.createReadStream(filePath);
  } else {
    ctx.status = 404;
    console.error('file forwarding not exists', ctx.url);
  }
};

export default file;
