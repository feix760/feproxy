import path from 'path';
import fs from 'fs-extra';
import mime from 'mime-types';
import { DEVTOOLS_DIR } from '../util/paths';
import type { ProxyContext } from '../types';

// @chrome-devtools/inspector ships upstream devtools-frontend build artifacts (the official npm
// package only publishes TS sources, which need depot_tools + gn/ninja to build). The whole
// frontend is inspector.html plus one chunk-*.js at the package root.
const chromeDevTools = path.dirname(require.resolve('@chrome-devtools/inspector/inspector.html'));

/** devtools frontend entry, patched before being served */
const ENTRY_FILE = 'inspector.html';

/** Script injected into the devtools page, lives in DEVTOOLS_DIR (the local override dir) */
const INJECT_FILE = 'feproxy-entry.js';

let entryHTML: string;

/**
 * Two rewrites on the entry html:
 *
 * 1. Inject our own script (settings entry + devtools defaults). It must run before the devtools
 *    main chunk, so it goes right after `<body>`: a plain script runs synchronously during
 *    parsing while the chunk is a deferred module. It has to be external — the html's own CSP
 *    `script-src 'self'` blocks inline scripts.
 * 2. Some versions only allow `ws://127.0.0.1:*` in connect-src, which blocks ws when debugging
 *    a phone over a LAN IP. The pinned version has no such directive; this is upgrade insurance.
 */
async function getEntryHTML() {
  if (!entryHTML) {
    const html = await fs.readFile(path.join(chromeDevTools, ENTRY_FILE), 'utf8');

    entryHTML = html
      .replace(/(<body[^>]*>)/, `$1<script src="./${INJECT_FILE}"></script>`)
      .replace(/(connect-src [^;"]*)/, '$1 ws: wss:');
  }
  return entryHTML;
}

const staticFile = async (ctx: ProxyContext) => {
  // @koa/router no longer puts anonymous regex capture groups in ctx.params, only ctx.captures
  const filename = decodeURIComponent(ctx.captures[0] || '');

  if (filename === ENTRY_FILE) {
    ctx.set('Content-Type', 'text/html');
    ctx.body = await getEntryHTML();
    return;
  }

  // Local override dir first, then fall back to the devtools package
  for (const dir of [ DEVTOOLS_DIR, chromeDevTools ]) {
    const filepath = path.join(dir, filename);
    // filename comes from the url; unchecked, `../../` would read any file outside the package
    if (!filepath.startsWith(dir + path.sep)) {
      return;
    }
    if (await fs.pathExists(filepath)) {
      ctx.set('Content-Type', mime.lookup(filepath) || '');
      ctx.body = fs.createReadStream(filepath);
      return;
    }
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
