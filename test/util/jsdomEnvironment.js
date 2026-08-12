// jsdom 环境缺了一批 node 侧的 web 全局:
// - koa 3 的 response.body setter 里直接 `val instanceof ReadableStream / Blob / Response`,
//   标识符不存在会抛 ReferenceError, 于是 jsdom 用例里任何响应都 500;
// - koa-body 8 依赖链上的 formidable → @paralleldrive/cuid2 → @noble/hashes
//   在模块加载期就要 TextEncoder。
// 这里从 node realm 把缺失的全局补给 jsdom, 只补没有的, 不动 fetch
// (test/../action/config.ts 引的 isomorphic-fetch 要靠 global.fetch 为空来装自己那套)。
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
