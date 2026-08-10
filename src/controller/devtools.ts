import path from 'path';
import fs from 'fs-extra';
import mime from 'mime-types';
import { DEVTOOLS_DIR } from '../util/paths';
import type { ProxyContext } from '../types';

const chromeDevTools = path.dirname(require.resolve('chrome-devtools-frontend/front_end/inspector.html'));

// These files cound download from:
// https://chrome-devtools-frontend.appspot.com/serve_file/@${commitHash}/${path}
// Current browser commit hash cound found at:
// chrome://version/
const localFiles = [
  'SupportedCSSProperties.js',
  'InspectorBackendCommands.js',
  'accessibility/ARIAProperties.js',
];

const staticFile = async (ctx: ProxyContext) => {
  const filename = ctx.params[0];
  const filepath = path.join(localFiles.includes(filename) ? DEVTOOLS_DIR : chromeDevTools, filename);
  if (await fs.pathExists(filepath)) {
    ctx.set('Content-Type', mime.lookup(filepath) || '');
    ctx.body = fs.createReadStream(filepath);
  }
};

export { staticFile as static };

function extendWebsocket(ws: any) {
  const originSend = ws.send;
  ws.send = (obj: any) => {
    if (typeof obj === 'object') {
      obj = JSON.stringify(obj);
    }
    originSend.call(ws, obj);
  };
}

export const ws = async (ctx: ProxyContext) => {
  const socket = await ctx.accept();

  extendWebsocket(socket);

  ctx.app.inspector.addClient(socket);
};
