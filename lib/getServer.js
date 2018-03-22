
const http = require('http');
const https = require('https');
const getCertificate = require('./ca').getCertificate;

module.exports = app => {
  const httpServer = http.createServer(app.callback());
  app.ws.listen({ server: httpServer });
  const httpsServerMap = {};

  return hostname => {
    if (!hostname) {
      return httpServer;
    }

    const globhost = hostname.split('.').length > 2 ? hostname.replace(/^[^\.]+/, '*') : hostname;

    if (!httpsServerMap[globhost]) {
      const pem = getCertificate(globhost).pem;
      const server = httpsServerMap[globhost] = https.createServer(pem, app.callback());
      app.ws.listen({ server });
    }

    return httpsServerMap[globhost];
  };
};
