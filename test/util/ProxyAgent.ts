import http from 'http';
import net from 'net';

interface ProxyOptions extends http.ClientRequestArgs {
  proxy?: {
    host: string;
    port: string | number;
  };
}

type OnCreate = (err: Error | null, socket?: net.Socket) => void;

class ProxyAgent extends http.Agent {
  createConnection(options: ProxyOptions, oncreate: OnCreate) {
    const { port, host, proxy } = options;
    const socket = net.connect(Number(proxy.port), proxy.host);
    socket.once('error', oncreate);
    socket.on('connect', () => {
      socket.write([
        `CONNECT ${host}:${port} HTTP/1.1`,
        `Host: ${host}:${port}`,
        '\n\r',
      ].join('\n\r'));
    });
    socket.once('data', buffer => {
      socket.removeListener('error', oncreate);
      if (/\s200\sConnection\sestablished/i.test(buffer.toString())) {
        oncreate(null, socket);
      } else {
        oncreate(new Error(buffer.toString()));
      }
    });
  }
}

export default ProxyAgent;
