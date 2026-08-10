import delay from './proxy/delay';
import file from './proxy/file';
import header from './proxy/header';
import host from './proxy/host';
import http from './proxy/http';
import status from './proxy/status';
import websocket from './proxy/websocket';
import type { FeproxyApp, ProxyPlugins } from './types';

export default (app: FeproxyApp): ProxyPlugins => { // eslint-disable-line
  return {
    header: {
      fn: header,
    },
    delay: {
      fn: delay,
      priority: 80,
    },
    host: {
      fn: host,
    },
    status: {
      fn: status,
      priority: 30,
    },
    file: {
      fn: file,
      priority: 20,
    },
    http: {
      fn: http,
      match: /^https?:/i,
      priority: 10,
    },
    websocket: {
      fn: websocket,
      match: /^wss?:/i,
      priority: 10,
    },
  };
};
