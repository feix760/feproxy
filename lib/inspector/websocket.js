
const url = require('url');
const ip = require('ip');
const inspectUtil = require('../util/inspectUtil');

module.exports = inspector => {
  const webSocketWillSendHandshakeRequest = ctx => {
    ctx.requestId = inspector.nextId();

    inspector.sendAll('Network.webSocketCreated', {
      requestId: ctx.requestId,
      url: ctx.url,
      initiator: {
        type: 'other',
      },
    });

    inspector.sendAll('Network.webSocketWillSendHandshakeRequest', {
      requestId: ctx.requestId,
      timestamp: inspector.timestamp(),
      wallTime: Date.now() / 1000,
      request: {
        headers: ctx.req.headers,
      },
    });
  };

  const webSocketHandshakeResponseReceived = ctx => {
    const ws = ctx.websocket;

    const requestHeaders = ctx.req.headers;
    const responseHeaders = ctx.getResponseHeaders ? ctx.getResponseHeaders() : {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
    };

    inspector.sendAll('Network.webSocketHandshakeResponseReceived', {
      requestId: ctx.requestId,
      timestamp: inspector.timestamp(),
      response: {
        status: 101,
        statusText: 'Switching Protocols',
        headers: responseHeaders,
        headersText: inspectUtil.headers2text(responseHeaders),
        requestHeaders,
        requestHeadersText: inspectUtil.headers2text(requestHeaders),
      },
    });

    ws.on('message', msg => {
      inspector.sendAll('Network.webSocketFrameSent', {
        requestId: ctx.requestId,
        timestamp: inspector.timestamp(),
        response: {
          opcode: 1,
          mask: true,
          payloadData: msg,
        },
      });
    });

    const originSend = ws.send;
    ws.send = function(msg) {
      originSend.apply(this, arguments);

      inspector.sendAll('Network.webSocketFrameReceived', {
        requestId: ctx.requestId,
        timestamp: inspector.timestamp(),
        response: {
          opcode: 1,
          mask: false,
          payloadData: msg,
        },
      });
    };
  };

  function inspectable(ctx) {
    const urlInfo = url.parse(ctx.url);
    const { config } = ctx.app;

    const expr = `^(localhost|127.0.0.1|${ip.address()}|${config.hostname})$`.replace(/\./g, '\\.');

    return !new RegExp(expr, 'i').test(urlInfo.hostname)
      || urlInfo.port !== config.port
      || urlInfo.path !== '/ws';
  }

  inspector.on('webSocketWillSendHandshakeRequest', ctx => {
    if (inspector.hasClient() && inspectable(ctx)) {
      try {
        webSocketWillSendHandshakeRequest(ctx);
      } catch (err) {
        console.log(err);
      }
    }
  })
    .on('webSocketHandshakeResponseReceived', ctx => {
      if (inspector.hasClient() && inspectable(ctx)) {
        try {
          webSocketHandshakeResponseReceived(ctx);
        } catch (err) {
          console.error(err);
        }
      }
    });

  const methods = {};

  return {
    methods,
  };
};
