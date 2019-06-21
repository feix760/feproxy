
const http = require('http');
const https = require('https');
const ca = require('./ca');
const { HttpsAgent } = require('../util/agent');

const agent = new HttpsAgent({
  keepAlive: false,
  timeout: 10000,
});

module.exports = app => {
  const { config } = app;
  const untrustRootCA = ca.getRootCA('feproxy.untrust', config.RC_DIR);
  const trustedRootCA = ca.getRootCA('feproxy', config.RC_DIR);
  const serverMap = {};

  function isTrustHost(hostname, port) {
    if (hostname === app.config.hostname) {
      return Promise.resolve(2);
    }
    return new Promise(resolve => {
      const req = https.request({
        hostname,
        port,
        path: '/',
        method: 'GET',
        agent,
      }, res => {
        res.on('error', () => {});
        resolve(2);
      });
      req.on('error', err => {
        console.warn('Verify host error', hostname, err.code);
        if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_HAS_EXPIRED/.test(err.code)) {
          resolve(0);
        } else {
          resolve(1);
        }
      });
      req.end();
    });
  }

  async function getHTTPServer() {
    if (!serverMap.http) {
      serverMap.http = http.createServer(app.callback());
      app.ws.listen({ server: serverMap.http });
    }
    return serverMap.http;
  }

  async function getTSLServer({ hostname, port = 443, isProxy = false }) {
    const key = `${hostname}:${port}:${isProxy}`;
    if (!serverMap[key]) {
      serverMap[key] = (async () => {
        const isTrust = !isProxy || await isTrustHost(hostname, port) > 0;
        const { pem } = ca.createCertificate(isTrust ? trustedRootCA : untrustRootCA, hostname);
        const server = https.createServer(pem, app.callback());
        if (isProxy) {
          server.proxy = {
            hostname,
            port,
          };
        }
        app.ws.listen({ server });

        serverMap[key] = server;
      })();
    }

    if (serverMap[key] instanceof Promise) {
      await serverMap[key];
    }

    return serverMap[key];
  }

  return {
    getHTTPServer,
    getTSLServer,
  };
};
