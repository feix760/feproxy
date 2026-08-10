import dns from 'dns';
import http from 'http';
import https from 'https';
import catchError from './catchError';

// TODO override a smarter dns lookup
function lookup(...args: any[]) {
  return (dns.lookup as any)(...args);
}

export class HttpAgent extends http.Agent {
  createConnection(options: http.ClientRequestArgs, callback?: any) {
    options.lookup = lookup;
    const socket = super.createConnection(options, callback);
    catchError(socket);
    return socket;
  }
}

export class HttpsAgent extends https.Agent {
  createConnection(options: http.ClientRequestArgs, callback?: any) {
    options.lookup = lookup;
    const socket = (super.createConnection as any)(options, callback);
    catchError(socket);
    return socket;
  }
}
