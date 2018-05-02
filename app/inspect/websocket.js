
module.exports = inspect => {
  const webSocketWillSendHandshakeRequest = async ctx => {
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
  };

  const webSocketHandshakeResponseReceived = async ctx => {
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
        requestHeaders: requestHeaders,
        requestHeadersText: getHeadersText(requestHeaders),
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

    ws.proxy.res.on('message', msg => {
      inspect.sendAll('Network.webSocketFrameReceived', {
        requestId: ws.requestId,
        timestamp: inspect.timestamp(),
        response: {
          opcode: 1,
          mask: false,
          payloadData: msg,
        },
      });
    });
  };

  inspect.on('webSocketWillSendHandshakeRequest', ctx => {
      if (inspect.hasClient()) {
        webSocketWillSendHandshakeRequest(ctx)
          .catch(err => console.error(err));
      }
    })
    .on('webSocketHandshakeResponseReceived', ctx => {
      if (inspect.hasClient()) {
        webSocketHandshakeResponseReceived(ctx)
          .catch(err => console.error(err));
      }
    });

  const methods = {
  };

  return {
    methods,
  };
};

function getHeadersText(headers) {
  return Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('\r\n');
}
