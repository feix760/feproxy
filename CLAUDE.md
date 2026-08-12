# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

FeProxy 是一个类 Fiddler 的抓包代理（Node + Koa），用 Chrome DevTools 前端作为抓包界面，并支持按规则改写/转发 HTTP(S)/WebSocket 请求。发布为 npm 全局 CLI（`bin/feproxy.js` → `lib/cli.js`）。

## 常用命令

```sh
npm run dev          # tsc -w + webpack -w + nodemon
npm run build        # build:ts (tsc → lib/) + build:web (webpack → lib/public/)
npm run typecheck    # 必须两次：tsc --noEmit（node 侧）+ tsc -p tsconfig.web.json（前端）
npm test             # lint + build + jest，CI 用这个

# 单个测试文件/用例
npx cross-env NODE_ENV=testing npx jest test/proxy.test.ts -t '用例名' --coverage=false
```

测试的坑：

- **必须带 `NODE_ENV=testing`**，`.babelrc` 只在该 env 下开 commonjs transform，否则报 "Cannot use import statement outside a module"。
- jest 默认收集覆盖率且有全局阈值，跑单文件时加 `--coverage=false`。
- 测试直接跑 `src/`，但 `src/util/paths.ts` 指向 `lib/public`，涉及静态资源/devtools/admin 页面的用例要先 `npm run build`。
- 每个 suite 用 `test/util/util.ts` 的 `startApp()` 起真实代理服务（随机端口、RC_DIR 在 `test/.tmp/`），部分用例会真的访问外网。
- 前端用例靠文件头 `@jest-environment <rootDir>/test/util/jsdomEnvironment.js` 切环境（jsdom + 补 `ReadableStream`/`Response`/`TextEncoder`，否则 koa 3 抛 `ReferenceError`）。

## 架构

### 1. 连接嗅探层（`src/server/ProxyServer.ts`）

入口是 `net.createServer`，读第一个 data 包后分流：

- `CONNECT host:port` → 回 200 后再读一包：`GET /` 视为 ws 隧道（重写成 `GET ws://host:port/path`）；否则 `config.https` 为真就自签证书解密（MITM），为假则裸 TCP 对穿。
- 首字节 `0x16`（TLS handshake）→ 本机 hostname 的 TLS server。
- 可打印字节 → HTTP server（普通请求 / http 代理 / Upgrade）。

分流靠 `socket.pause()/unshift()/resume()`，**unshift 必须在 data 回调里同步调用**，中间不能 `await`。分流**之前**先对首包做代理认证（见 §7）。

`ServerFactory` 按 `group:hostname:port` LRU 缓存 https server（缓存 promise，并发共享一次创建）；先探测上游真实证书，验证通过（或开 `ignoreCertError`）用 **trusted** 根证书签发，否则用 **untrust** 根证书 —— 让本来就有证书问题的站点在浏览器里继续报错。根证书为 `feproxy-<user>.crt`，存在 `RC_DIR`（默认 `~/.feproxy`）。

### 2. URL 重建（`src/extend/context.ts`）

MITM 后请求行只剩 `/path`，`ctx.url` 改成 getter，结合 `socket.server.proxy`（`ProxyServer` 打的 `{hostname, port}` 标记）还原绝对 URL。**整个路由和规则匹配都依赖 `ctx.url` 是绝对 URL**。

`@koa/router` 取匹配路径的顺序是 `opts.routerPath || ctx.newRouterPath || ctx.path || ctx.routerPath`，只有 pathname 的 `ctx.path` 排在 `routerPath` 前面会让绝对 URL 路由全部失配，所以额外定义了优先级最高的 `newRouterPath` getter；另外 router 匹配完会回写 `ctx.routerPath`，所以它配了个空 setter 吞掉写入。**升级 router 时这两处都要复查。**

### 3. 路由（`src/router.ts`）

`@koa/router` 用正则匹配协议前缀区分「被代理的流量」和「feproxy 自身站点」：

- `^https?://.*` → `middleware/inspect` + `middleware/proxy`
- `^wss?://.*` → `middleware/wsInspect` + `middleware/proxy`
- 普通路径 → `/feproxy.crt`、`/log`、`/getConfig`、`/setConfig`、`/ws`（CDP）、`/devtools/*`

同一份 routes 同时 `app.use()` 和 `app.ws.use()`。正则路由的匿名捕获组**不会**进 `ctx.params`，要从 `ctx.captures` 取。

### 4. WebSocket 接入 Koa（`src/server/WebSocketServer.ts`）

用 `ws` 的 `verifyClient` 钩子造 Koa ctx 跑中间件链，`ctx.accept()` 完成握手并 resolve 出 socket（不是 Koa 的内容协商）。没调 `accept` 就自动 404/500。

全局只有**一个** `ws.Server`（`noServer` 模式、关掉 `clientTracking`），`attach(server)` 把它接到每个 http/https server 的 `upgrade` 事件上。MITM 下 https server 是按域名建的，别改回「每个 server new 一个 ws.Server」。

### 5. 代理插件链（`src/middleware/proxy.ts` + `src/proxy/*` + `src/proxyPlugins.ts`）

- 规则来自 `config.getRules(inspector.getBlockedURLs())`：devtools blockedURLs 转成的 `status` 404 规则**排在前面**，然后是用户 project 规则；逐条正则匹配 `ctx.url`，同一 type 只取第一条命中。之后再兜底插件自带的默认 `match`，按 `priority` 降序组成类似 Koa 的 `next()` 链。
- `http`/`websocket`（10）是终结插件，不调 `next()`；`header`(50) 在 `next()` 之后改响应头；`host`(50) 通过改写链上 `http` 插件的 param 生效；`delay`(80)、`status`(30)、`file`(20)。
- `http` 转发响应体挂的是 PassThrough（规避 keep-alive 的 "socket hang up"），但**无响应体的响应（HEAD 和 204/205/304）一定不能挂 body**：koa 对这些状态码直接 `ctx.body = null`，已注册的 `onFinish(res, destroy)` 会 destroy 掉流，抓包侧 `readStream` 的 promise 永不 settle，devtools 收不到 `loadingFinished`。也**不能改设 `ctx.body = ''`**（会改写 `content-length`，HEAD 的响应头就和 GET 不一致）；只需 `proxy.res.resume()` 消费掉上游响应，否则 keep-alive socket 不还回连接池。
- 规则 param 里的字符串支持 `$1`、`$2` 反向引用 match 正则的捕获组（见 `matchReg`）。
- 新增插件 = `src/proxy/` 加文件 + `proxyPlugins.ts` 注册（priority / 默认 match）+ 前端 `component/Project.tsx` 的 `to` 串编解码加分支。

### 6. Inspector / CDP（`src/inspector/*`）

自己实现了 CDP 的一个子集：`Inspector` 持有多个 `Client`（每个连上 `/ws` 的 devtools 一个），`network`/`page`/`websocket` 三个模块注册 `methods` 响应请求，并通过 `sendAll` 推事件。响应体在 LRU 池里按 requestId 缓存，SSE 走 `eventSourceMessageReceived`。

**没实现的方法必须回协议 error**（`{ error: { code: -32601, message: "'X' wasn't found" } }`）。前端启动会发 40+ 条命令，实现了的只有 `Network.enable`、`Network.getResponseBody`、`Network.streamResourceContent`、`Network.setBlockedURLs`、`Network.replayXHR`、`Page.getResourceTree`、`Page.getResourceContent`；对未知方法回「成功但结果为空」会让新版前端 deref 出 `TypeError` 把界面打挂。`FEPROXY_CDP_DEBUG=1` 打印每条命令及其是否 MISSING。

**`Network.streamResourceContent` 例外，绝不能回 error。** 前端按请求是否传完在 `getResponseBody` / `streamResourceContent` 之间二选一，**且结果会被缓存**——回 error 那条请求的 Preview/Response 永远是空的（SSE 消息视图也无条件走这条）。gzip 要整段解所以没法按 chunk 给，`bodyWaiters` 挂 waiter 等响应体读完一次性回，最多等 `STREAM_TIMEOUT`（30s，unref）。同理 `Network.dataReceived` 必须带 `encodedDataLength`，前端只在它 !== -1 时累加，不给会算出 NaN。

`config.inspect`（默认 `true`）是抓包总开关：为假时 inspect 中间件直接 `next()`，不 emit 事件也不读 body，devtools 界面照常但看不到请求。可用 `--no-inspect` / admin 面板 / `/setConfig` 切换。

#### devtools 前端（`@chrome-devtools/inspector` + `src/controller/devtools.ts`）

官方 `chrome-devtools-frontend` npm 包只发 TS 源码（要 depot_tools 才编得出），所以用 `@chrome-devtools/inspector`——上游每周构建产物（未打补丁，不是 chii 那种 fork）。**版本必须锁死**（`-E` 精确装）。

`inspector.html` 由 `controller/devtools.ts` 改写后返回：往 `<body>` 后插外链 `feproxy-entry.js`（html 自带 `script-src 'self'`，只能外链；排在 module chunk 之前），并给 CSP 的 `connect-src` 补上 `ws: wss:`（有的版本只放开 `ws://127.0.0.1:*`，手机连局域网 IP 会失败）。`feproxy-entry.js` 唯一作用是在前端启动前往 localStorage 预置 devtools 设置：`screencast-enabled=false`、`disable-locale-info-bar=true`。

`src/frontend/asset/devtools/` 是本地覆盖目录（优先于包内同名文件），放注入脚本和 formatter worker。只用网络面板，所以 `controller/site.ts` 下发的 `devtoolsURL` 带 `?panel=network`。管理界面入口（`component/App.tsx` 的 `.open-settings`）是 devtools iframe 的**兄弟节点**，靠 `position: fixed` + `z-index` 浮在上面，不用 postMessage。

### 7. 代理账号验证（`src/util/proxyAuth.ts`）

Basic 代理认证，账号**写死**在 `defaultConfig.ts` 的 `auth`（默认 `feproxy/feproxy`、`enable: false`；`ProxyConfig.update()` 剔除 `auth` 字段，不能通过 `/setConfig` 改）。

**auth 只作用于代理流量**，直连 feproxy 自身站点一律不验证，所以开 auth 不影响 devtools 界面。验证在 `ProxyServer.onSocket` 里、**协议分流之前**，对每条连接首包做一次（通过后整条隧道不再验证）：`isProxyRaw` 判断首包是否代理请求（`CONNECT host:port` / `GET http://host/path`），是则扫原始报文的 `Proxy-Authorization`，失败回 `407 + Proxy-Authenticate` 并 `end()`。TLS 首包自然被跳过（往 TLS 连接写明文只会让对端 hang up）。`proxy/http.ts`、`proxy/websocket.ts` 转发时会删掉 `proxy-authorization` 逐跳头。

### 8. 配置（`src/util/ProxyConfig.ts`）与 CLI（`src/cli.ts`）

优先级：`defaultConfig.ts` ← `~/.feproxy/config.json` ← `createApp(config)` 参数。`App.ts` 合并时用 `pickDefined()` 剔除 `undefined`（`auth` 子对象单独再合一次）。`ProxyConfig.update()` 把 `inspect/projects/https/ignoreCertError` 写回磁盘并重建规则。内置一条规则把 `http(s)://feproxy.org/*` 转到本机服务，这是 `src/frontend/asset/log.js`（页面 console 打到终端）能工作的原因。

CLI 用 yargs 把参数按 `defaultConfig.ts` 的字段一一映射后传给 `createApp()`。**新增配置字段时记得同步补 CLI 参数。**

### 9. 前端（`src/frontend/`）

webpack 多页：`src/frontend/page/*/index.tsx` 每目录一个 chunk + 同名 `index.html` 模板，产物到 `lib/public/`，`src/frontend/asset/` 整目录拷过去。目前只有 `admin` 页：全屏 iframe 嵌 devtools + 设置弹层，redux + thunk，`setConfig` 自带 1s 防抖。

UI 上规则显示成单个 `to` 字符串（`delay://1000`、`host://1.2.3.4:8080`、`file:///path`），`component/Project.tsx` 的 `toDisplayRule`/`toWireRule` 负责和后端 `{type, param}` 互转。

## 约定

- TS 是宽松模式（`strict: false`）。`tsconfig.json` **排除** `src/frontend`，前端由 `tsconfig.web.json` 单独 typecheck，改前端别忘了这一路。
- `lib/`、`coverage/`、`test/.tmp/` 是产物，不要提交也不要手改。
- commit 用 angular convention（`standard-version` 生成 CHANGELOG，`npm run release` 发版）。
