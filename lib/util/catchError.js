
// prevent ECONNRESET
function catchError(stream) {
  function onerror(err) {
    if (stream.listeners('error').length === 1) {
      if (stream.destroyed === false && typeof stream.destroy === 'function') {
        stream.destroy();
      }
      console.error('error', err && err.message);
    }
  }
  if (stream && !stream.listeners('error').includes(onerror)) {
    stream.on('error', onerror);
  }
}

module.exports = catchError;
