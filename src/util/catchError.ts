import type { Duplex } from 'stream';

// prevent ECONNRESET
export default function catchError(stream: Duplex) {
  function onerror(err: Error) {
    if (stream.listeners('error').length === 1) {
      if (stream.destroyed === false && typeof stream.destroy === 'function') {
        stream.destroy();
      }
      console.error('error', err?.message);
    }
  }
  if (stream && !stream.listeners('error').includes(onerror)) {
    stream.on('error', onerror);
  }
}
