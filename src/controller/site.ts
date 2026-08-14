import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import ip from 'ip';
import ServerFactory from '../server/ServerFactory';
import type { ConfigData } from '../util/ProxyConfig';
import type { ProxyContext } from '../types';

export const crt = async (ctx: ProxyContext) => {
  const crtFile = path.join(ctx.app.config.RC_DIR, ServerFactory.rootCA);
  if (await fs.pathExists(crtFile)) {
    ctx.set('content-type', 'application/octet-stream');
    // Set the filename explicitly, otherwise the browser names it after the url
    ctx.set('content-disposition', `attachment; filename="${ServerFactory.rootCA}"`);
    ctx.body = await fs.readFile(crtFile);
  }
};

export const log = async (ctx: ProxyContext) => {
  const { index, str } = ctx.query;

  let obj;
  try {
    obj = JSON.parse(str as string);
  } catch (err) {
    obj = str;
  }

  if (obj instanceof Array) {
    console.log(chalk.yellow(index as string), ...obj);
  } else {
    console.log(chalk.yellow(index as string), obj);
  }
  ctx.status = 204;
};

export const setConfig = async (ctx: ProxyContext) => {
  // koa-body types body as JsonValue; here it can only be a setConfig object
  await ctx.app.config.update(ctx.request.body as Partial<ConfigData>);

  ctx.body = ctx.app.config;
};

export const getConfig = async (ctx: ProxyContext) => {
  const { config } = ctx.app;

  ctx.body = {
    ...config,

    // We only use the network panel; the panel param makes devtools open on Network
    devtoolsURL: `/devtools/inspector.html?ws=${ip.address()}:${config.port}/ws&panel=network`,
  };
};
