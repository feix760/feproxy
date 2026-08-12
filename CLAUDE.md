# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

FeProxy 是一个类 Fiddler 的抓包代理（Node + Koa），用 Chrome DevTools 前端作为抓包界面，并支持按规则改写/转发 HTTP(S)/WebSocket 请求。发布为 npm 全局 CLI（`bin/feproxy.js` → `lib/cli.js`）。

## 常用命令

```sh
npm run dev          # tsc -w + webpack -w + nodemon（三个 watch 并行）
npm run build        # build:ts (tsc → lib/) + build:web (webpack → lib/public/)
npm run typecheck    # 必须两次：tsc --noEmit（node 侧）+ tsc -p tsconfig.web.json（前端）
npm run lint         # eslint .（lint-fix 可自动修）
npm run jest         # 跑测试（cross-env NODE_ENV=testing）
npm test             # lint + build + jest，CI 用这个
```

跑单个测试文件/用例：

```sh
npx cross-env NODE_ENV=testing npx jest test/proxy.test.ts -t '用例名' --coverage=false
```

两个坑：

- **必须带 `NODE_ENV=testing`**，`.babelrc` 只在该 env 下开 commonjs transform，直接 `npx jest` 会报 "Cannot use import statement outside a module"。
- jest 默认 `collectCoverage: true` 且有全局阈值，跑单文件时加 `--coverage=false`，否则必然因阈值失败。
- 测试直接跑 `src/`（babel-jest），但 `src/util/paths.ts` 指向 `lib/public`，所以涉及静态资源/devtools/admin 页面的用例需要先 `npm run build`。

测试特点：每个 suite 用 `test/util/util.ts` 的 `startApp()` 起真实代理服务（随机端口、RC_DIR 落在 `test/.tmp/`），部分用例会真的访问外网（`https://www.baidu.com/`）。jest 全局 `testEnvironment` 是 node，前端用例（`test/ui.test.tsx`、`test/dbg.test.tsx`）靠文件头 `@jest-environment <rootDir>/test/util/jsdomEnvironment.js` docblock 切换——那是个继承 jsdom 的自定义环境，把 jsdom 缺的 node web 全局（`ReadableStream`/`Response`/`TextEncoder` 等）补进去，否则 koa 3 的 `response.body` setter 和 koa-body 的 formidable 依赖链会直接抛 `ReferenceError`（注意 docblock 里的路径是相对 `rootDir` 解析的，写 `./util/...` 找不到）。

## 架构

### 1. 连接嗅探层（`src/server/ProxyServer.ts`）

入口不是 `http.createServer`，而是 `net.createServer`，读第一个 data 包后分流：

- `CONNECT host:port` → 回 200 后再读一包：`GET /` 视为 ws 隧道（把 `GET /path` 重写成 `GET ws://host:port/path`）；否则若 `config.https` 为真就用自签证书解密（MITM），为假则裸 TCP 对穿。
- 首字节 `0x16`（TLS handshake）→ 本机 hostname 的 TLS server。
- 可打印字节 → HTTP server（同时覆盖普通请求、http 代理、Upgrade）。

分流靠 `socket.pause()/unshift()/resume()`，unshift 必须在 data 回调里同步调用，中间不能 `await`。

分流**之前**先对首包做**代理账号验证**（见下文「代理账号验证」），CONNECT 和明文 HTTP 两支都被覆盖；TLS 那支没法在 socket 层验，走 HTTP 中间件。

`ServerFactory` 按 `group:hostname:port` 用 LRU 缓存 https server（缓存的是 promise，并发请求共享一次创建）；先探测上游真实证书，验证通过（或开了 `ignoreCertError`）用 **trusted** 根证书签发，否则用 **untrust** 根证书 —— 这样浏览器会对本来就有证书问题的站点保持报错。根证书名带用户名后缀（`feproxy-<user>.crt`），存放在 `RC_DIR`（默认 `~/.feproxy`）。

两级缓存分开是为了控内存：`tslServers`（200 条 / 30min ttl）里每个 server 都带一份原生 TLS SecureContext，只涨 RSS 不体现在 JS heap，所以数量收着，**淘汰时 `dispose` 里必须 `close()`**，否则挂在上面的空闲 keep-alive 连接会拖着 server 不释放（`close()` 只清空闲连接，已升级的 ws 隧道和传输中的响应都不受影响，有用例覆盖）；`certs`（1000 条 / 1h ttl）只存几 KB 的 PEM 字符串，缓存得更久，这样 server 被淘汰后重建不用再验一次上游证书（一次网络往返）+ 重新签一次名。明文 server 只有一个，直接挂 `factory.httpServer`，不进 LRU。改 `ignoreCertError` 后已缓存域名最多 1h 后才生效。

### 2. URL 重建（`src/extend/context.ts`）

MITM 之后请求行只剩 `/path`，`ctx.url` 被重写为 getter，结合 `socket.server.proxy`（`ProxyServer` 打上的 `{hostname, port}` 标记）还原成绝对 URL（`https://host/path`、ws 场景为 `wss://`）。**整个路由和规则匹配都依赖 `ctx.url` 是绝对 URL 这一前提**，`routerPath` 是去掉 querystring 的版本。

`routerPath` 存在的唯一目的就是喂给 router 做匹配，但 `@koa/router` 取匹配路径的顺序是 `opts.routerPath || ctx.newRouterPath || ctx.path || ctx.routerPath`——只有 pathname 的 `ctx.path` 排在 `routerPath` 前面，会让所有绝对 URL 路由失配，所以这里额外定义了优先级最高的 `newRouterPath` getter（返回同一个值）。另外 router 匹配完会回写 `ctx.routerPath = layer.path`，而它的 dist 是 `use strict`，只有 getter 会直接抛 `TypeError`，因此 `routerPath` 配了一个空 setter 吞掉写入。**升级 router 时这两处都要复查。**

### 3. 路由（`src/router.ts`）

`@koa/router` 用正则匹配协议前缀区分「被代理的流量」和「feproxy 自身站点」：

- `^https?://.*` → `middleware/inspect`（发 CDP 事件）+ `middleware/proxy`
- `^wss?://.*` → `middleware/wsInspect` + `middleware/proxy`
- 普通路径 → `/feproxy.crt`、`/log`、`/getConfig`、`/setConfig`、`/ws`（CDP）、`/devtools/*`

同一份 routes 同时 `app.use()` 和 `app.ws.use()`。

正则路由的匿名捕获组**不会**进 `ctx.params`（`@koa/router` 只填命名参数），要从 `ctx.captures` 取，且 `captures` 没做 urldecode（见 `controller/devtools.ts`）。

### 4. WebSocket 接入 Koa（`src/server/WebSocketServer.ts`）

用 `ws` 的 `verifyClient` 钩子造一个 Koa ctx 并跑中间件链，`ctx.accept()` 完成握手并 resolve 出 socket（因此 `ctx.accept` 的语义被替换了，不是 Koa 的内容协商）。响应头通过重写 ctx.set + `headers` 事件注入。中间件没调 `accept` 就自动 404/500。

全局只有**一个** `ws.Server`（`noServer` 模式、关掉 `clientTracking`），`getServer()` 惰性创建，`attach(server)` 把它接到每个 http/https server 的 `upgrade` 事件上（等价于 ws 自己的 `options.server` 模式，`handleUpgrade` 里照样走 `verifyClient`）。MITM 下 https server 是按域名建的，别再改回「每个 server new 一个 ws.Server」。

### 5. 代理插件链（`src/middleware/proxy.ts` + `src/proxy/*` + `src/proxyPlugins.ts`）

- 规则来自 `config.getRules(inspector.getBlockedURLs())`：devtools blockedURLs 转成的 `status` 404 规则**排在前面**，然后是用户 project 规则；逐条对 `ctx.url` 做正则匹配，同一 type 只取第一条命中（所以 blockedURLs 的 404 会压过用户的 status 规则）。
- 之后再把所有插件自带的默认 `match` 兜底进来，按 `priority` 降序组成类似 Koa 的 `next()` 链。
- `http`/`websocket`（priority 10）是终结插件，不调 `next()`；`header`(50) 在 `next()` 之后改响应头；`host`(50) 通过改写链上 `http` 插件的 param 生效；`delay`(80)、`status`(30)、`file`(20)。
- `http` 转发响应体时挂的是一个 PassThrough（规避 keep-alive 的 "socket hang up"），但**没有响应体的响应（HEAD 和 `statuses.empty`：204/205/304）一定不能挂 body**：koa 对这些状态码直接 `ctx.body = null` + `res.end()`，而 body 的 setter 早就注册了 `onFinish(res, destroy)`，那个流会被 destroy —— 只有 `'close'` 没有 `'end'`，抓包侧 `readStream` 的 promise 永远不 settle，devtools 收不到 `loadingFinished`（请求一直是 pending，没有耗时和大小），`Network.streamResourceContent` 还要干等满 `STREAM_TIMEOUT`。这一支也**不能退而设 `ctx.body = ''`**，body setter 会按长度改写 `content-length`，HEAD 的响应头就和 GET 不一致了（要保留上游给的长度）；只需要 `proxy.res.resume()` 把上游响应消费掉，否则 keep-alive 的 socket 不还回连接池。
- 规则 param 里的字符串支持 `$1`、`$2` 反向引用 match 正则的捕获组（见 `matchReg`）。
- 新增插件 = 在 `src/proxy/` 加文件 + 在 `proxyPlugins.ts` 注册（决定 priority/默认 match）+ 在前端 `component/Project.tsx` 的 `to` 串编解码里加分支。

### 6. Inspector / CDP（`src/inspector/*`）

自己实现了 Chrome DevTools Protocol 的一个子集：`Inspector` 持有多个 `Client`（每个连上 `/ws` 的 devtools 一个），`network`/`page`/`websocket` 三个模块注册 `methods`（响应 devtools 请求，如 `Network.getResponseBody`、`Network.setBlockedURLs`、`Network.replayXHR`）并通过 `sendAll` 主动推事件（`requestWillBeSent`/`responseReceived`/`dataReceived`/`webSocketFrame*` 等）。响应体在 LRU 池里按 requestId 缓存，SSE 走 `eventSourceMessageReceived`。

**没实现的方法必须回协议 error**（`{ error: { code: -32601, message: "'X' wasn't found" } }`，文案和 Chrome 一致）。前端启动时会发 40+ 条命令（`Overlay.*`/`Debugger.*`/`Target.*`/`Page.getNavigationHistory`…），只有 `Network.enable`、`Network.getResponseBody`、`Network.streamResourceContent`、`Network.setBlockedURLs`、`Network.replayXHR`、`Page.getResourceTree`、`Page.getResourceContent` 是实现了的；早期版本对未知方法回「成功但结果为空」，新版前端拿到后会直接 deref 出 `TypeError` 把界面打挂，收到 error 才会走降级分支。调试时开 `FEPROXY_CDP_DEBUG=1` 可以打印每条命令及其是否 MISSING。

**`Network.streamResourceContent` 是个例外，它绝对不能回 error。** 前端 `NetworkRequest.requestStreamingContent` 按请求是否传完二选一：传完了走 `getResponseBody`，还在传就走 `streamResourceContent`，**而且结果会被缓存**——回 error 的话那条请求的 Preview/Response 永远是空的（SSE 的消息视图也无条件走这条）。我们没法按 chunk 给出解码后的内容（gzip 要整段解），所以 `bodyWaiters` 挂一个 waiter 等响应体读完再一次性回，最多等 `STREAM_TIMEOUT`（30s，timer 是 unref 的，不拖着进程不退出）。同理 `Network.dataReceived` 必须带 `encodedDataLength`，前端只在它不等于 -1 时累加传输量，不给会算出 NaN 把 Size 列打花。

**`responseReceived` 的 `timing.requestTime` 必须是请求开始的时刻**（`ctx[INSPECTOR].startTime`，在 `requestWillBeSent` 里记下来），不能是「响应头到达的时刻」：前端的 `set timing` 会拿它**覆盖** `startTime`，而 Time 列判的是 `duration = loadingFinished.timestamp - startTime > 0`，否则显示 `Pending`——给成响应头时刻的话 duration 就只剩读响应体的耗时，没有响应体的响应（304/204）正好算出 0，那一列永远是 Pending。`timing` 里除 `requestTime` 是秒，其余都是相对它的**毫秒**偏移，`receiveHeadersEnd` 就是 latency 副标题的来源（写死 0 的话永远显示 0ms）。另外 `Inspector.timestamp()` 用的是 `performance.now()` 而不是 `Date.now()`——后者只有 1ms 精度，本机请求经常整个跑完还在同一毫秒，duration 又是 0。

`config.inspect`（默认 `true`）是抓包总开关：为假时 `middleware/inspect`、`middleware/wsInspect` 直接 `next()`，不 emit 任何事件（也就不会读 POST body / 响应体），只做转发，devtools 界面照常打开但看不到请求。可通过 `--no-inspect`、admin 设置面板或 `/setConfig` 切换（`inspect` 和 `projects/https/ignoreCertError` 一起持久化到 `config.json`）。

#### devtools 前端（`@chrome-devtools/inspector` + `src/controller/devtools.ts`）

官方 `chrome-devtools-frontend` npm 包只发 TS 源码（要 depot_tools + gn/ninja 才编得出来），appspot 上那套按 revision 取文件的地址早就 404 了，所以用 `@chrome-devtools/inspector`——上游 devtools-frontend 的每周构建产物（未打补丁，不是 chii 那种 fork）。包内容就是 `inspector.html` + 一个 `chunk-*.js`/`chunk-*.css` + `Images.js` + `locales/`。

四个坑：

- **版本必须锁死**（`-E` 精确装）。`1.20252311.0` 起的构建产物里混进了 `import * as x from "node:worker_threads"`，浏览器解析不了，整个界面白屏；目前能用的最新版是 **`1.20251611.0`**。`test/site.test.ts` 的 `devtools bundle has no bare node import` 就是这条的哨兵，升级依赖后它先红，不用等打开界面才发现。
- `inspector.html` 会被 `controller/devtools.ts` 改写后再返回：往 `<body>` 后插一个 `feproxy-entry.js`（普通 script，解析时同步执行，排在 module chunk 之前），另外给 CSP 的 `connect-src` 补上 `ws: wss:`（当前版本没有这条指令，是给升级兜底——有的版本只放开 `ws://127.0.0.1:*`，手机连局域网 IP 就连不上）。html 自带 `script-src 'self'`，所以注入的只能是外链脚本。
- devtools 的设置就是 localStorage 里以 setting 名为 key 的 JSON 值。注入 `feproxy-entry.js` 的唯一目的就是在前端启动前预置 `screencast-enabled=false`（否则那块永远空白的截屏面板占掉大半窗口）和 `disable-locale-info-bar=true`。
- **包里没有 worker 入口**。主 chunk 里写死了 `new URL('../../entrypoints/formatter_worker/formatter_worker-entrypoint.js', import.meta.url)`，相对 `/devtools/chunk-*.js` 算下来落在**站点根**上，但包只发了主 chunk。而 devtools 的 `WorkerWrapper` 在 worker 加载失败时只 `console.error`，既不 reject 也不超时，`postMessage` 就挂在一个永远不 settle 的 promise 上——`SourceFrame` 对压缩过的内容（`isMinified`：有一行超过 500 字符）会自动 pretty print，于是 `await setPretty(true)` 卡死、`setContent` 再也不执行，**表现是点开请求后 Response 面板只剩一个空编辑器，没报错也没异常**（Preview 走 iframe，所以看着是好的，只有 Response 是空的）。所以自己实现了一份最小的 worker（`asset/devtools/entrypoints/formatter_worker/`）：JSON 真的重排（只动空白，不用 `JSON.parse`+`stringify`——那会改写数字精度和指数写法，抓包看到的内容必须和实际响应一致），其余类型原样返回；`format` 的返回值必须带 `mapping: { original, formatted }`（两个递增的 offset 数组，devtools 靠它在原始/格式化视图间换算位置）。它的 url 在站点根上，所以 `router.ts` 里除了 `/devtools/(.+)` 还配了一条 `^/(entrypoints/.+)$`，都由 `controller/devtools.ts` 的 static 处理。

只用得到网络面板，所以 `controller/site.ts` 下发的 `devtoolsURL` 带 `?panel=network` 让它默认停在 Network。`src/frontend/asset/devtools/` 是本地覆盖目录（优先于包内同名文件），现在放注入脚本和 formatter worker。

**管理界面入口**（`component/App.tsx` 的 `.open-settings`）是 devtools iframe 的**同级兄弟节点**，靠 `position: fixed` + `z-index` 浮在 iframe 上面，点击直接开设置层，不用 postMessage。位置在右下角（网络面板底部汇总栏的空白区），颜色写死不跟 devtools 主题走——早期版本是右上角一个无文字的蓝色圆环，正好压在新版 devtools 的齿轮图标旁边，根本认不出来。

### 7. 代理账号验证（`src/util/proxyAuth.ts`）

Basic 代理认证，账号**写死**在 `defaultConfig.ts` 的 `auth: { enable, username, password }`（默认 `feproxy/feproxy`、`enable: false`，`ProxyConfig.update()` 会剔除 `auth` 字段，保证不能通过 `/setConfig` 改）。

**auth 只作用于代理流量**，直连 feproxy 自身站点（admin 页、`/getConfig`、`/feproxy.crt`、`/ws`）一律不验证，所以开 auth 不影响 devtools 界面。

验证发生在 `ProxyServer.onSocket` 里，位置是**协议分流之前**、对每条连接的首包做一次（通过后整条隧道/连接不再重复验证）：`proxyAuth.isProxyRaw` 正则判断首包是否代理请求（`CONNECT host:port` 或 `GET http://host/path`），是则用 `getRawProxyAuthorization` 扫原始报文里的 `Proxy-Authorization`，失败回 `407 + Proxy-Authenticate` 并 `end()`。TLS 首包（ClientHello）不是代理请求，自然被跳过（往 TLS 连接里写明文响应只会让对端 hang up）。

`proxy/http.ts`、`proxy/websocket.ts` 转发上游时会删掉 `proxy-authorization` 逐跳头。测试里 `startApp()` 默认 `auth.enable = false`，需要验证的用例自己打开。

### 8. 配置（`src/util/ProxyConfig.ts`）与 CLI（`src/cli.ts`）

CLI 用 yargs 把命令行参数按 `defaultConfig.ts` 的字段一一映射后传给 `createApp()`：`--port`、`--hostname`、`--config`（对应 `RC_DIR`）、`--https`（`--no-https` 关闭）、`--ignore-cert-error`、`--inspect`（`--no-inspect` 关闭）、`--auth`（`--no-auth` 关闭）、`--username`、`--password`；短别名只有 `-p/--port`、`-c/--config`、`-v/--version`，`version/help` 交给 yargs 内置处理（自动打印并退出）。新增配置字段时记得同步补 CLI 参数。

各选项的 `default` 直接取自 `defaultConfig`，所以 argv 里恒有值。

配置优先级：`defaultConfig.ts` ← `~/.feproxy/config.json` ← `createApp(config)` 参数。`App.ts` 合并时用 `pickDefined()` 剔除 `undefined`（`auth` 子对象单独再合一次），避免调用方传部分字段时把默认值打成 `undefined`。`ProxyConfig.update()` 会把 `projects/https/ignoreCertError` 写回磁盘并重建规则。内置一条规则把 `http(s)://feproxy.org/*` 转发到本机服务，这是 `src/frontend/asset/log.js`（把页面 console 打到终端）能工作的原因。

### 9. 前端（`src/frontend/`）

webpack 多页：`src/frontend/page/*/index.tsx` 每个目录一个 chunk + 同名 `index.html` 模板，产物到 `lib/public/`，`src/frontend/asset/` 整目录拷过去。目前只有 `admin` 页：一个全屏 iframe 嵌 devtools + 设置弹层，redux + thunk 管状态，`setConfig` 自带 1s 防抖合并请求。

UI 上规则显示成单个 `to` 字符串（如 `delay://1000`、`host://1.2.3.4:8080`、`file:///path`），`component/Project.tsx` 里的 `toDisplayRule`/`toWireRule` 负责和后端的 `{type, param}` 互转。

## 约定

- TS 是宽松模式（`strict: false`、`noImplicitAny: false`）。`tsconfig.json` **排除** `src/frontend`，前端由 `tsconfig.web.json` 单独 typecheck，改前端后别忘了这一路。
- 类型集中在 `src/types.ts`（`FeproxyApp`、`ProxyContext`、`ProxyPlugin*`）和 `src/frontend/page/admin/types.ts`。
- eslint 风格偏 egg 约定：`[ 'a', 'b' ]` 数组内加空格、单引号、max-len 120、`import/order` 分组、`eqeqeq`。
- `lib/`、`coverage/`、`test/.tmp/` 都是产物，不要提交也不要手改。
- commit 用 angular convention（`standard-version` 生成 CHANGELOG，`npm run release` 发版）。
