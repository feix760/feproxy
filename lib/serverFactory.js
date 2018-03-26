
const http = require('http');
const https = require('https');
const getCertificate = require('./ca').getCertificate;

module.exports = app => {
  let normalServer;

  function getHTTPServer() {
    if (!normalServer) {
      normalServer = http.createServer(app.callback());
      app.ws.listen({ server: normalServer });
    }
    return normalServer;
  }

  const tslServerMap = {};
  function getTSLServer({ hostname, port = 443, isProxy = false }) {
    if (!hostname) {
      return httpServer;
    }

    const key = `${hostname}:${port}:${isProxy}`;

    if (!tslServerMap[key]) {
      const pem = getCertificate(hostname).pem;
      const server = tslServerMap[key] = https.createServer(pem, app.callback());
      if (isProxy) {
        server.proxy = {
          hostname,
          port,
        };
      }
      app.ws.listen({ server });
    }

    return tslServerMap[key];
  }

  return {
    getHTTPServer,
    getTSLServer,
  };
};
