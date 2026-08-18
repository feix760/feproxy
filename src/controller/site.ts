import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import ip from 'ip';
import ServerFactory from '../server/ServerFactory';
import type ProxyConfig from '../util/ProxyConfig';
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

/**
 * The config as the admin page is allowed to see it — a whitelist, so nothing the page has no use
 * for (RC_DIR, hostname, port, the rule cache...) leaks out. `auth` is reduced to whether it is on:
 * the credentials never leave the server, the page only shows a read-only switch. Add a field here
 * when the page starts reading it.
 */
const publicConfig = (config: ProxyConfig) => ({
  projects: config.projects,
  https: config.https,
  ignoreCertError: config.ignoreCertError,
  inspect: config.inspect,
  auth: { enable: !!config.auth?.enable },
});

export const setConfig = async (ctx: ProxyContext) => {
  // koa-body types body as JsonValue; here it can only be a setConfig object
  await ctx.app.config.update(ctx.request.body as Partial<ConfigData>);

  ctx.body = publicConfig(ctx.app.config);
};

export const getConfig = async (ctx: ProxyContext) => {
  const { config } = ctx.app;

  ctx.body = {
    ...publicConfig(config),

    // We only use the network panel; the panel param makes devtools open on Network
    devtoolsURL: `/devtools/inspector.html?ws=${ip.address()}:${config.port}/ws&panel=network`,

    // Relative, so it stays valid whichever host the page was opened from; the route lives on
    // feproxy's own site (see router.ts)
    crtURL: '/feproxy.crt',
  };
};
