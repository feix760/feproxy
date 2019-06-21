
const http = require('http');
const https = require('https');
const dns = require('dns');
const catchError = require('./catchError');

// TODO override a smarter dns lookup
function lookup(...args) {
  // console.log('lookup', args);
  return dns.lookup(...args);
}

class HttpAgent extends http.Agent {
  createConnection(options, callback) {
    options.lookup = lookup;
    const socket = super.createConnection(options, callback);
    catchError(socket);
    return socket;
  }
}

class HttpsAgent extends https.Agent {
  createConnection(options, callback) {
    options.lookup = lookup;
    const socket = super.createConnection(options, callback);
    catchError(socket);
    return socket;
  }
}

exports.HttpAgent = HttpAgent;
exports.HttpsAgent = HttpsAgent;
