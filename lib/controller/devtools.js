
const path = require('path');
const fs = require('fs-extra');
const mime = require('mime-types');

const chromeDevTools = path.dirname(require.resolve('chrome-devtools-frontend/front_end/inspector.html'));
const localDevTools = path.join(__dirname, '../public/devtools');

// These files cound download from:
// https://chrome-devtools-frontend.appspot.com/serve_file/@${commitHash}/${path}
// Current browser commit hash cound found at:
// chrome://version/
const localFiles = [
  'SupportedCSSProperties.js',
  'InspectorBackendCommands.js',
  'accessibility/ARIAProperties.js',
];

exports.static = async ctx => {
  const filename = ctx.params[0];
  const filepath = path.join(localFiles.includes(filename) ? localDevTools : chromeDevTools, filename);
  if (await fs.exists(filepath)) {
    ctx.set('Content-Type', mime.lookup(filepath));
    ctx.body = fs.createReadStream(filepath);
  }
};

function extendWebsocket(ws) {
  const originSend = ws.send;
  ws.send = obj => {
    if (typeof obj === 'object') {
      obj = JSON.stringify(obj);
    }
    originSend.call(ws, obj);
  };
}

exports.ws = async ctx => {
  const ws = await ctx.accept();

  extendWebsocket(ws);

  ctx.app.inspector.addClient(ws);
};
