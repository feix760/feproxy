/* eslint-disable */

var index = 0;
var _log = console.log;

console.log = function() {
  _log.apply(console, args);
  var args = [].slice.call(arguments);
  new Image().src = '//feproxy.org/log?str=' + JSON.stringify(args) + '&index=' + (++index);
};
