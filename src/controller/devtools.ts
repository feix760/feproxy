import path from 'path';
import fs from 'fs-extra';
import mime from 'mime-types';
import { DEVTOOLS_DIR } from '../util/paths';
import type { ProxyContext } from '../types';

// @chrome-devtools/inspector 是上游 devtools-frontend 的构建产物(官方 npm 包只发 TS 源码,
// 要 depot_tools + gn/ninja 才能编出来), 整个前端就是包根的 inspector.html + 一个 chunk-*.js
const chromeDevTools = path.dirname(require.resolve('@chrome-devtools/inspector/inspector.html'));

/** devtools 前端入口, 会被 patch 后再返回 */
const ENTRY_FILE = 'inspector.html';

/** 注入到 devtools 页面里的脚本, 放在 DEVTOOLS_DIR(本地覆盖目录) */
const INJECT_FILE = 'feproxy-entry.js';

let entryHTML: string;

/**
 * 入口 html 做两处改写:
 *
 * 1. 挂上我们自己的脚本(设置入口 + devtools 默认设置)。它要在 devtools 主 chunk 之前执行,
 *    所以插在 `<body>` 后面 —— 普通 script 在解析时同步执行, chunk 是 module(defer), 顺序稳。
 *    html 自带 CSP `script-src 'self'`, 内联脚本会被拦, 只能外链。
 * 2. 有些版本的 CSP 里 connect-src 只放开了 `ws://127.0.0.1:*`, 手机连局域网 IP 调试时
 *    ws 会被拦掉(当前锁定的版本没有这条指令, 留着是给升级兜底)。
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
  // @koa/router 不再把正则的匿名捕获组写进 ctx.params, 只能从 ctx.captures 取
  const filename = decodeURIComponent(ctx.captures[0] || '');

  if (filename === ENTRY_FILE) {
    ctx.set('Content-Type', 'text/html');
    ctx.body = await getEntryHTML();
    return;
  }

  // 本地覆盖目录优先, 找不到再回落到 devtools 包
  for (const dir of [ DEVTOOLS_DIR, chromeDevTools ]) {
    const filepath = path.join(dir, filename);
    // filename 来自 url, 不做限制的话 `../../` 能读到包外的任意文件
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
