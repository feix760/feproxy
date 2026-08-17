# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

FeProxy is a Fiddler-like capture proxy (Node + Koa) that uses the Chrome DevTools frontend as its capture UI and can rewrite/forward HTTP(S)/WebSocket requests according to rules. Published as a global npm CLI (`bin/feproxy.js` → `lib/cli.js`).

## Common commands

```sh
npm run dev          # tsc -w + webpack -w + nodemon
npm run build        # build:ts (tsc → lib/) + build:web (webpack → lib/public/)
npm run typecheck    # must run twice: tsc --noEmit (node side) + tsc -p tsconfig.web.json (frontend)
npm test             # lint + build + jest; this is what CI runs

# a single test file / case
npx cross-env NODE_ENV=testing npx jest test/proxy.test.ts -t 'case name' --coverage=false
```

Testing gotchas:

- **`NODE_ENV=testing` is mandatory.** `.babelrc` only enables the commonjs transform under that env; without it you get "Cannot use import statement outside a module".
- jest collects coverage by default and has global thresholds, so pass `--coverage=false` when running a single file.
- Tests run against `src/` directly, but `src/util/paths.ts` points at `lib/public`, so any case touching static assets / devtools / the admin page needs `npm run build` first.
- Every suite uses `startApp()` from `test/util/util.ts` to boot a real proxy server (random port, `RC_DIR` under `test/.tmp/`). Cases that need an upstream site use `startUpstream()` to boot a local http/https upstream — **do not reintroduce public internet addresses** (CI can't reach them, which makes every https case time out, including the pre-MITM upstream certificate probe).
- Frontend cases switch environments via the file-header `@jest-environment <rootDir>/test/util/jsdomEnvironment.js` (jsdom plus polyfilled `ReadableStream`/`Response`/`TextEncoder`, otherwise koa 3 throws `ReferenceError`).

## Architecture

### 1. Connection sniffing layer (`src/server/ProxyServer.ts`)

The entry point is `net.createServer`; it reads the first data packet and dispatches:

- `CONNECT host:port` → reply 200, then read one more packet: `GET /` is treated as a ws tunnel (rewritten to `GET ws://host:port/path`); otherwise, if `config.https` is truthy, decrypt with a self-signed certificate (MITM), and if falsy, pass through as raw TCP.
- First byte `0x16` (TLS handshake) → the TLS server for the local hostname.
- Printable bytes → the HTTP server (plain request / http proxy / Upgrade).

Dispatch relies on `socket.pause()/unshift()/resume()`; **`unshift` must be called synchronously inside the data callback**, with no `await` in between. Proxy authentication runs on the first packet **before** dispatch (see §7).

`ServerFactory` LRU-caches https servers by `group:hostname:port` (it caches the promise so concurrent callers share a single creation). It first probes the upstream's real certificate: if validation passes (or `ignoreCertError` is on) it signs with the **trusted** root, otherwise with the **untrust** root — so sites that already had certificate problems keep erroring in the browser. The root certificate is `feproxy-<user>.crt`, stored in `RC_DIR` (default `~/.feproxy`).

### 2. URL reconstruction (`src/extend/context.ts`)

After MITM the request line is only `/path`, so `ctx.url` becomes a getter that rebuilds the absolute URL from `socket.server.proxy` (the `{hostname, port}` marker `ProxyServer` attaches). **All routing and rule matching depends on `ctx.url` being an absolute URL.**

`@koa/router` picks the path to match in the order `opts.routerPath || ctx.newRouterPath || ctx.path || ctx.routerPath`. Since `ctx.path` — pathname only — comes before `routerPath`, absolute-URL routes would all fail to match, so we define an extra `newRouterPath` getter with the highest priority. The router also writes back to `ctx.routerPath` after matching, so that property has an empty setter to swallow the write. **Re-check both when upgrading the router.**

### 3. Routing (`src/router.ts`)

`@koa/router` uses regexes on the protocol prefix to separate "proxied traffic" from "feproxy's own site":

- `^https?://.*` → `middleware/inspect` + `middleware/proxy`
- `^wss?://.*` → `middleware/wsInspect` + `middleware/proxy`
- plain paths → `/feproxy.crt`, `/log`, `/getConfig`, `/setConfig`, `/ws` (CDP), `/devtools/*`

The same routes are registered on both `app.use()` and `app.ws.use()`. Anonymous capture groups in regex routes do **not** land in `ctx.params` — read them from `ctx.captures`.

### 4. Wiring WebSocket into Koa (`src/server/WebSocketServer.ts`)

The `verifyClient` hook of `ws` builds a Koa ctx and runs the middleware chain; `ctx.accept()` completes the handshake and resolves the socket (this is not Koa's content negotiation). Not calling `accept` yields an automatic 404/500.

There is exactly **one** global `ws.Server` (`noServer` mode, `clientTracking` disabled); `attach(server)` hooks it onto the `upgrade` event of every http/https server. Under MITM the https servers are created per domain, so don't go back to "one `ws.Server` per server".

### 5. Proxy plugin chain (`src/middleware/proxy.ts` + `src/proxy/*` + `src/proxyPlugins.ts`)

- Rules come from `config.getRules(inspector.getBlockedURLs())`: `status` 404 rules derived from devtools blockedURLs come **first**, then the user's project rules. Each is regex-matched against `ctx.url`, and only the first hit per type is used. After that, plugins' own default `match` fills in, and everything is ordered by descending `priority` into a Koa-like `next()` chain.
- `http`/`websocket` (10) are terminal plugins and don't call `next()`; `header` (50) modifies response headers after `next()`; `host` (50) works by rewriting the param of the `http` plugin on the chain; then `delay` (80), `status` (30), `file` (20).
- The `http` plugin attaches a PassThrough as the forwarded response body (to avoid keep-alive "socket hang up"), but **responses without a body (HEAD and 204/205/304) must never get a body**: koa sets `ctx.body = null` for those statuses, the already-registered `onFinish(res, destroy)` destroys the stream, the capture side's `readStream` promise never settles, and devtools never receives `loadingFinished`. You also **can't set `ctx.body = ''`** (that rewrites `content-length`, making HEAD's response headers differ from GET's); just `proxy.res.resume()` to drain the upstream response, otherwise the keep-alive socket is never returned to the pool.
- Strings in rule params support `$1`, `$2` back-references to the match regex's capture groups (see `matchReg`).
- Adding a plugin = a new file in `src/proxy/` + registration in `proxyPlugins.ts` (priority / default match) + a new entry in `RULE_TYPES` of the frontend's `component/RuleInput.tsx` (protocol name + the param fields it reads).

### 6. Inspector / CDP (`src/inspector/*`)

We implement a subset of CDP ourselves: `Inspector` owns multiple `Client`s (one per devtools connected to `/ws`); the `network`/`page`/`websocket` modules register `methods` to answer requests and push events via `sendAll`. Response bodies are cached in an LRU pool keyed by requestId; SSE goes through `eventSourceMessageReceived`.

**Unimplemented methods must return a protocol error** (`{ error: { code: -32601, message: "'X' wasn't found" } }`). The frontend sends 40+ commands at startup; the only implemented ones are `Network.enable`, `Network.getResponseBody`, `Network.streamResourceContent`, `Network.setBlockedURLs`, `Network.replayXHR`, `Page.getResourceTree`, `Page.getResourceContent`. Answering an unknown method with "success but empty result" makes the newer frontend deref into a `TypeError` and destroy the UI. `FEPROXY_CDP_DEBUG=1` prints every command and whether it is MISSING.

**`Network.streamResourceContent` is the exception — it must never return an error.** The frontend picks between `getResponseBody` and `streamResourceContent` based on whether the request has finished transferring, **and the result is cached** — returning an error means that request's Preview/Response stays empty forever (the SSE message view always goes through this path). gzip has to be decoded as a whole so it can't be delivered chunk by chunk; `bodyWaiters` parks a waiter until the response body is fully read and then answers in one shot, waiting at most `STREAM_TIMEOUT` (30s, unref'd). Likewise `Network.dataReceived` must carry `encodedDataLength` — the frontend only accumulates when it is `!== -1`, and omitting it produces NaN.

`config.inspect` (default `true`) is the master capture switch: when falsy the inspect middleware just calls `next()`, emitting no events and reading no bodies, so the devtools UI still works but shows no requests. Toggle it with `--no-inspect`, the admin panel, or `/setConfig`.

#### devtools frontend (`@chrome-devtools/inspector` + `src/controller/devtools.ts`)

The official `chrome-devtools-frontend` npm package ships only TS sources (building it requires depot_tools), so we use `@chrome-devtools/inspector` — upstream's weekly build artifacts (unpatched, not a chii-style fork). **The version must be pinned** (install with `-E` for an exact version).

`inspector.html` is rewritten by `controller/devtools.ts` before being served: an external `feproxy-entry.js` is inserted after `<body>` (the html carries `script-src 'self'`, so it has to be an external script, and it must come before the module chunk), and CSP's `connect-src` gets `ws: wss:` appended (some versions only allow `ws://127.0.0.1:*`, which breaks phones connecting over a LAN IP). `feproxy-entry.js` exists solely to seed devtools settings into localStorage before the frontend boots: `screencast-enabled=false`, `disable-locale-info-bar=true`.

`src/frontend/asset/devtools/` is a local override directory (it takes precedence over same-named files inside the package) and holds the injected script and the formatter worker. We only use the Network panel, so the `devtoolsURL` served by `controller/site.ts` carries `?panel=network`. The admin UI entry point (`.open-settings` in `component/App.tsx`) is a **sibling** of the devtools iframe, floating above it via `position: fixed` + `z-index` — no postMessage involved.

### 7. Proxy authentication (`src/util/proxyAuth.ts`)

Basic proxy auth with credentials **hardcoded** in `auth` in `defaultConfig.ts` (default `feproxy/feproxy`, `enable: false`). `ProxyConfig.update()` strips the `auth` field, so it can't be changed through `/setConfig`.

**Auth applies only to proxied traffic**; direct requests to feproxy's own site are never checked, so enabling auth doesn't affect the devtools UI. Verification happens in `ProxyServer.onSocket`, **before protocol dispatch**, once per connection on the first packet (after which the whole tunnel is trusted): `isProxyRaw` decides whether the first packet is a proxy request (`CONNECT host:port` / `GET http://host/path`), and if so scans the raw message for `Proxy-Authorization`, replying `407 + Proxy-Authenticate` and `end()`ing on failure. TLS first packets are naturally skipped (writing plaintext into a TLS connection would just make the peer hang up). `proxy/http.ts` and `proxy/websocket.ts` strip the hop-by-hop `proxy-authorization` header when forwarding.

### 8. Configuration (`src/util/ProxyConfig.ts`) and CLI (`src/cli.ts`)

Precedence: `defaultConfig.ts` ← `~/.feproxy/config.json` ← the `createApp(config)` argument. `App.ts` merges with `pickDefined()` to drop `undefined` values (the `auth` sub-object is merged once more on its own). `ProxyConfig.update()` persists `inspect/projects/https/ignoreCertError` to disk and rebuilds the rules. A built-in rule forwards `http(s)://feproxy.org/*` to the local server — that's why `src/frontend/asset/log.js` (piping page console output to the terminal) works.

The CLI uses yargs to map arguments one-to-one onto the fields of `defaultConfig.ts` and passes them to `createApp()`. **When adding a config field, remember to add the matching CLI argument.**

### 9. Frontend (`src/frontend/`)

Multi-page webpack: each `src/frontend/page/*/index.tsx` directory is one chunk with a sibling `index.html` template; output goes to `lib/public/`, and all of `src/frontend/asset/` is copied over. There is currently only the `admin` page: a full-screen iframe embedding devtools plus a settings overlay, redux + thunk, with `setConfig` debounced by 1s.

Rules are edited in the backend's own `{type, param}` shape — no display/wire conversion. `component/RuleInput.tsx` owns one rule row: the match regex, a `<select>` for the protocol (= plugin type), then the fields declared for that protocol in `RULE_TYPES` (`header` and any unknown type fall back to a free-form name/value list, so a hand-written `config.json` stays editable). New rules start out as `http`, and the select's empty option is rendered **only** while `type` is empty — a protocol-less rule is a no-op (`updateRules()` drops it), so it exists just to represent what a hand-written `config.json` may contain. Changing the protocol clears `param`, since the old fields mean nothing to the new plugin. Text fields keep a local draft and commit on blur/Enter: every store update schedules a debounced `setConfig`, so committing per keystroke would spam the server. The free-form list is local state too and only syncs back from props when `param`'s identity differs from the object it last committed, i.e. when the change came from outside.

The site icon is a devtools-waterfall badge: `src/frontend/asset/favicon.svg` is the master (also the logo shown on the landing page and in the settings dialog title, referenced by URL rather than imported through webpack, since `asset/` is served from the site root). `favicon.ico` is generated from it by `npm run build:favicon`, which packs 16/32/48 PNGs into an ICO; the 16px entry is drawn separately in `scripts/favicon-16.svg` because the master's detail doesn't survive the downscale. That script needs `rsvg-convert` (`brew install librsvg`) and so is **deliberately outside `npm run build`** — run it by hand and commit the `.ico` after editing either svg.

## Conventions

- **Write everything in English**: code comments, UI copy, log/error messages, docs (including this file), and commit messages. Some older code still has Chinese comments — translate them as you touch that code, but don't do a standalone sweep.
- TS runs in loose mode (`strict: false`). `tsconfig.json` **excludes** `src/frontend`; the frontend is typechecked separately by `tsconfig.web.json`, so don't forget that path when changing frontend code.
- `lib/`, `coverage/`, and `test/.tmp/` are build artifacts — don't commit them and don't hand-edit them.
- Commits follow the angular convention (`standard-version` generates the CHANGELOG, `npm run release` publishes).
