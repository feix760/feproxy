
const http = require('http');
const https = require('https');

module.exports = app => {
  const getCertificate = require('./ca').getCertificate;
  const serverMap = {};

  function isTrustHost(hostname, port) {
    if (hostname === app.config.hostname) {
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      const req = https.request({
        hostname,
        port,
        path: '/',
        method: 'GET',
      }, res => {
        res.on('error', () => {});
        resolve(true);
      });
      req.on('error', err => {
        if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_HAS_EXPIRED/.test(err.code)) {
          resolve(false);
        } else {
          console.warn('Verify host error', hostname, err);
          resolve(true);
        }
      });
      req.end();
    });
  }

  return {
    async getHTTPServer() {
      if (!serverMap.http) {
        serverMap.http = http.createServer(app.callback());
        app.ws.listen({ server: serverMap.http });
      }
      return serverMap.http;
    },
    async getTSLServer({ hostname, port = 443, isProxy = false }) {
      const key = `${hostname}:${port}:${isProxy}`;
      if (!serverMap[key]) {
        const isTrust = !isProxy || await isTrustHost(hostname, port);
        const pem = getCertificate(hostname, isTrust).pem;
        const server = serverMap[key] = https.createServer(pem, app.callback());
        if (isProxy) {
          server.proxy = {
            hostname,
            port: +port,
          };
        }
        app.ws.listen({ server });
      }

      return serverMap[key];
    },
  };
};
