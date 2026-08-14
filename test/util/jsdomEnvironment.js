// The jsdom environment is missing a set of web globals that exist on the node side:
// - koa 3's response.body setter does `val instanceof ReadableStream / Blob / Response` directly,
//   and a missing identifier throws a ReferenceError, so every response in a jsdom case 500s;
// - formidable → @paralleldrive/cuid2 → @noble/hashes, on koa-body 8's dependency chain, needs
//   TextEncoder at module load time.
// We copy the missing globals over from the node realm — only the absent ones, and never fetch
// (isomorphic-fetch, pulled in by action/config.ts, relies on global.fetch being empty to install
// its own).
const JSDOMEnvironment = require('jest-environment-jsdom').default;

const NODE_GLOBALS = [
  'TextEncoder',
  'TextDecoder',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'Blob',
  'Response',
  'Request',
];

class FeproxyJSDOMEnvironment extends JSDOMEnvironment {
  // The jsdom environment defaults to the 'browser' export condition, but ws 8 maps browser to a
  // "ws does not work in the browser" stub, which crashes the feproxy server a case boots. Switch
  // to the node conditions (frontend code is bundled by webpack and doesn't rely on jest's).
  exportConditions() {
    return [ 'node', 'require', 'default' ];
  }

  constructor(...args) {
    super(...args);

    NODE_GLOBALS.forEach(key => {
      if (typeof this.global[key] === 'undefined' && typeof globalThis[key] !== 'undefined') {
        this.global[key] = globalThis[key];
      }
    });
  }
}

module.exports = FeproxyJSDOMEnvironment;
