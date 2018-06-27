
const fs = require('fs');
const path = require('path');

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
