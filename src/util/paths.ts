import path from 'path';

// webpack 固定把前端产物输出到 <包根>/lib/public。
// 本文件在源码态位于 src/util、编译后位于 lib/util，上跳两级都是包根，
// 因此测试直跑 src 和线上跑 lib 都能解析到同一份产物。
const packageRoot = path.join(__dirname, '../..');

export const PUBLIC_DIR = path.join(packageRoot, 'lib/public');

export const DEVTOOLS_DIR = path.join(PUBLIC_DIR, 'devtools');
