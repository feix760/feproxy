// Ambient declarations. This file must stay a script (no top-level import/export)
// so that `declare module 'net'` merges with @types/node instead of replacing it.

declare module 'net' {
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
declare module 'jschardet';
