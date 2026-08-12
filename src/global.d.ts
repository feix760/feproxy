// Ambient declarations. This file must stay a script (no top-level import/export)
// so that `declare module 'node:net'` merges with @types/node instead of replacing it.
// @types/node 26 起真正的声明都放在 `node:xxx` 下, 裸模块只是 `export * from 'node:xxx'`,
// 所以必须augment `node:net`, 否则这里的 interface 会盖掉 re-export 的同名类。

declare module 'node:net' {
  interface Socket {
    server?: Server;
  }

  interface Server {
    // ProxyServer tags the TLS servers it spins up per CONNECT tunnel, so that
    // extend/context can rebuild the absolute URL the client originally requested.
    proxy?: {
      hostname: string;
      port: number;
    };
  }
}

declare module 'brotli';
