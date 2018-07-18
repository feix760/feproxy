
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

exports.crt = async ctx => {
  const crtFile = path.join(__dirname, '../../run/feproxy.crt');
  if (fs.existsSync(crtFile)) {
    ctx.set('content-type', 'application/octet-stream');
    ctx.body = fs.readFileSync(crtFile);
  }
};

exports.home = async ctx => {
  console.log(ctx.headers);
  ctx.set('content-type', 'text/html;charset=UTF-8');
  ctx.body = fs.readFileSync(path.join(__dirname, '../web/index.html')).toString();
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

exports.logJS = async ctx => {
  ctx.set('content-type', 'text/javascript;charset=UTF-8');
  ctx.body = fs.readFileSync(path.join(__dirname, '../web/log.js')).toString();
};
