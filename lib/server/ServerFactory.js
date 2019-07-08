const http = require('http');
const https = require('https');
const LRU = require('lru-cache');
const ca = require('./ca');
const { HttpsAgent } = require('../util/agent');

const certErrorCodes = [
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
];

class ServerFactory {
  constructor(app) {
    this.app = app;

    this.untrustRootCA = ca.getRootCA('feproxy.untrust', this.app.config.RC_DIR);
    this.trustedRootCA = ca.getRootCA('feproxy', this.app.config.RC_DIR);
    this.agent = new HttpsAgent({
      keepAlive: false,
      timeout: 10000,
    });

    this.servers = new LRU(1000);
  }

  async getHTTPServer() {
    let server = this.servers.get('http');

    if (!server) {
      server = http.createServer(this.app.callback());
      this.app.ws.listen({ server });

      this.servers.set('http', server);
    }

    return server;
  }

  async getTSLServer({ hostname, port = 443, group = '' }) {
    const key = `${group}:${hostname}:${port}`;

    let server = this.servers.get(key);
    if (!server) {
      server = (async () => {
        const verifyResult = await this.verifyCertificate(hostname, port);
        const rootCA = verifyResult === 'SUCCESS' ? this.trustedRootCA : this.untrustRootCA;
        const { pem } = ca.createCertificate(rootCA, hostname);

        const realServer = https.createServer(pem, this.app.callback());
        this.app.ws.listen({ server: realServer });
        this.servers.set(key, realServer);
        return realServer;
      })()
        .catch(err => {
          this.servers.del(key);
          return Promise.reject(err);
        });

      this.servers.set(key, server);
    }

    if (server instanceof Promise) {
      server = await server;
    }
    return server;
  }

  async verifyCertificate(hostname, port) {
    if (hostname === this.app.config.hostname) {
      return 'SUCCESS';
    }
    return await new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        port,
        path: '/',
        method: 'GET',
        agent: this.agent,
      }, res => {
        res.destroy();
        resolve('SUCCESS');
      });
      req.on('error', err => {
        if (certErrorCodes.includes(err.code)) {
          resolve('FAIL');
        } else {
          reject(`Verify certificate error ${hostname} ${err.code}`);
        }
      });
      req.end();
    });
  }
}

module.exports = ServerFactory;
