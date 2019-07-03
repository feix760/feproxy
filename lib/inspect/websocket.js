
const url = require('url');
const ip = require('ip');

module.exports = inspect => {
  const webSocketWillSendHandshakeRequest = ctx => {
    const ws = ctx.websocket;
    ws.requestId = inspect.nextId();

    inspect.sendAll('Network.webSocketCreated', {
      requestId: ws.requestId,
      url: ctx.url,
      initiator: {
        type: 'other',
      },
    });

    inspect.sendAll('Network.webSocketWillSendHandshakeRequest', {
      requestId: ws.requestId,
      timestamp: inspect.timestamp(),
      wallTime: Date.now() / 1000,
      request: {
        headers: ctx.req.headers,
      },
    });

    ws.on('message', msg => {
      inspect.sendAll('Network.webSocketFrameSent', {
        requestId: ws.requestId,
        timestamp: inspect.timestamp(),
        response: {
          opcode: 1,
          mask: true,
          payloadData: msg,
        },
      });
    });

    const _send = ws.send;
    ws.send = function(msg) {
      _send.apply(this, arguments);

      inspect.sendAll('Network.webSocketFrameReceived', {
        requestId: ws.requestId,
        timestamp: inspect.timestamp(),
        response: {
          opcode: 1,
          mask: false,
          payloadData: msg,
        },
      });
    };
  };

  const webSocketHandshakeResponseReceived = ctx => {
    const ws = ctx.websocket;

    const requestHeaders = ctx.req.headers;
    // TODO
    const responseHeaders = {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
    };

    inspect.sendAll('Network.webSocketHandshakeResponseReceived', {
      requestId: ws.requestId,
      timestamp: inspect.timestamp(),
      response: {
        status: 101,
        statusText: 'Switching Protocols',
        headers: responseHeaders,
        headersText: getHeadersText(responseHeaders),
        requestHeaders,
        requestHeadersText: getHeadersText(requestHeaders),
      },
    });
  };

  function inspectable(ctx) {
    const urlInfo = url.parse(ctx.url);
    const { config } = ctx.app;

    const expr = `^(localhost|127.0.0.1|${ip.address()}|${config.hostname})$`.replace(/\./g, '\\.');

    return !new RegExp(expr, 'i').test(urlInfo.hostname)
      || urlInfo.port !== config.port
      || urlInfo.path !== '/ws';
  }

  inspect.on('webSocketWillSendHandshakeRequest', ctx => {
    if (inspect.hasClient() && inspectable(ctx)) {
      try {
        webSocketWillSendHandshakeRequest(ctx);
      } catch (err) {
        console.log(err);
      }
    }
  })
    .on('webSocketHandshakeResponseReceived', ctx => {
      if (inspect.hasClient() && inspectable(ctx)) {
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

function getHeadersText(headers) {
  return Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('\r\n');
}
