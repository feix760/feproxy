import url from 'url';
import ip from 'ip';
import * as inspectorUtil from '../util/inspectorUtil';
import type { InspectorModuleResult, ProxyContext } from '../types';
import type Inspector from './Inspector';

export default (inspector: Inspector): InspectorModuleResult => {
  const webSocketWillSendHandshakeRequest = (ctx: ProxyContext) => {
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

  const webSocketHandshakeResponseReceived = (ctx: ProxyContext) => {
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
        headersText: inspectorUtil.headers2text(responseHeaders),
        requestHeaders,
        requestHeadersText: inspectorUtil.headers2text(requestHeaders),
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
    ws.send = function (msg: any, ...args: any[]) {
      originSend.apply(this, [ msg, ...args ]);

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

  function inspectable(ctx: ProxyContext) {
    const urlInfo = url.parse(ctx.url);
    const { config } = ctx.app;

    const expr = `^(localhost|127.0.0.1|${ip.address()}|${config.hostname})$`.replace(/\./g, '\\.');

    return !new RegExp(expr, 'i').test(urlInfo.hostname)
      || urlInfo.port !== config.port
      || urlInfo.path !== '/ws';
  }

  inspector.on('webSocketWillSendHandshakeRequest', (ctx: ProxyContext) => {
    if (inspector.hasClient() && inspectable(ctx)) {
      try {
        webSocketWillSendHandshakeRequest(ctx);
      } catch (err) {
        console.log(err);
      }
    }
  })
    .on('webSocketHandshakeResponseReceived', (ctx: ProxyContext) => {
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
