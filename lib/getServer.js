
const http = require('http');
const https = require('https');
const getCertificate = require('./ca').getCertificate;

module.exports = app => {
  const httpServer = http.createServer(app.callback());
  app.ws.listen({ server: httpServer });
  const httpsServerMap = {};

  return (hostname, port) => {
    if (!hostname) {
      return httpServer;
    }

    const host = `${hostname}:${port}`;

    if (!httpsServerMap[host]) {
      const pem = getCertificate(hostname).pem;
      const server = httpsServerMap[host] = https.createServer(pem, app.callback());
      server.proxy = {
        hostname,
        port,
      };
      app.ws.listen({ server });
    }

    return httpsServerMap[host];
  };
};
