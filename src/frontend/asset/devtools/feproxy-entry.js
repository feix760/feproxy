/* eslint-disable */

// Injected into devtools' inspector.html by controller/devtools.ts, ahead of the devtools main
// chunk: devtools stores settings in localStorage keyed by setting name (values are JSON), so they
// have to be written before the frontend boots.
// Note: inspector.html carries a CSP (script-src 'self'), so this must be external, not inline.

(function () {
  // Only write a default if the user hasn't touched it
  function setDefault(key, value) {
    try {
      if (!(key in localStorage)) {
        localStorage[key] = value;
      }
    } catch (err) {
      // localStorage is unavailable in private mode and the like; ignore
    }
  }

  // The ws connects to a page target faked by feproxy, so the screencast panel is always blank —
  // and it takes up most of the window
  setDefault('screencast-enabled', 'false');
  // The "DevTools is now available in <language>" info bar, which eats a big strip every time
  setDefault('disable-locale-info-bar', 'true');
})();
