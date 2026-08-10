/* eslint-disable */

(function() {
  var index = 0;

  function inject(obj, method) {
    var fn = obj[method];

    obj[method] = function() {
      var args = [].slice.call(arguments);
      fn.apply(obj, args);
      var msg = '';
      try {
        msg = JSON.stringify(args);
      } catch (err) {
        msg = '[feproxy stringify failed]';
      }
      new Image().src = '//feproxy.org/log?str=' + encodeURIComponent(msg) + '&index=' + (++index);
    };
  }

  if (!/[?&]_nolog\b/.test(location.href)) {
    inject(console, 'error');
    inject(console, 'warn');
    inject(console, 'log');
    inject(console, 'info');
  }
})();
