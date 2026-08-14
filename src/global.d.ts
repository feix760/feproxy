// Ambient declarations. This file must stay a script (no top-level import/export)
// so that `declare module 'node:net'` merges with @types/node instead of replacing it.
// Since @types/node 26 the real declarations live under `node:xxx` and the bare module is just
// `export * from 'node:xxx'`, so we must augment `node:net` — otherwise the interfaces below
// shadow the re-exported classes of the same name.

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
