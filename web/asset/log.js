/* eslint-disable */

(function() {
  var index = 0;

  function inject(obj, method) {
    var fn = obj[method];

    obj[method] = function() {
      var args = [].slice.call(arguments);
      fn.apply(obj, args);
      new Image().src = '//feproxy.org/log?str=' + encodeURIComponent(JSON.stringify(args)) + '&index=' + (++index);
    };
  }

  if (!/[?&]_nolog\b/.test(location.href)) {
    inject(console, 'error');
    inject(console, 'warn');
    inject(console, 'log');
    inject(console, 'info');
  }
})();
