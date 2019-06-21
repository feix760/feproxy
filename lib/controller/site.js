
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

exports.crt = async ctx => {
  const crtFile = path.join(ctx.app.config.RC_DIR, 'feproxy.crt');
  if (await fs.exists(crtFile)) {
    ctx.set('content-type', 'application/octet-stream');
    ctx.body = await fs.readFile(crtFile);
  }
};

exports.log = async ctx => {
  const { index, str } = ctx.query;

  let obj;
  try {
    obj = JSON.parse(str);
  } catch (err) {
    obj = str;
  }

  if (obj instanceof Array) {
    console.log(chalk.yellow(index), ...obj);
  } else {
    console.log(chalk.yellow(index), obj);
  }
  ctx.status = 204;
};

exports.setConfig = async ctx => {
  await ctx.app.config.update(ctx.request.body);

  ctx.body = ctx.app.config;
};

exports.getConfig = async ctx => {
  ctx.body = ctx.app.config;
};