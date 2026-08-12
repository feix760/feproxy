/* eslint-disable */

// 由 controller/devtools.ts 注入到 devtools 的 inspector.html 里, 位置在 devtools 主 chunk 之前 ——
// devtools 的设置直接以 setting 名为 key 存在 localStorage(值是 JSON), 得在前端启动前写进去。
// 注意: inspector.html 带 CSP(script-src 'self'), 所以只能是外链脚本, 不能内联。

(function () {
  // 只在用户没动过的时候写默认值
  function setDefault(key, value) {
    try {
      if (!(key in localStorage)) {
        localStorage[key] = value;
      }
    } catch (err) {
      // 隐私模式等场景拿不到 localStorage, 忽略
    }
  }

  // ws 连的是 feproxy 假造的 page target, 截屏面板永远是白的, 还占掉大半窗口
  setDefault('screencast-enabled', 'false');
  // "DevTools is now available in Chinese" 那条提示栏, 每次打开都占一大块
  setDefault('disable-locale-info-bar', 'true');
})();
