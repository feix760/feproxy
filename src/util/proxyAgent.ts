import type http from 'http';
import type https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * HttpsProxyAgent's constructor options only cover the "local → proxy" hop; TLS options for the
 * target site have to be passed in at connect time.
 */
class TunnelAgent extends HttpsProxyAgent<string> {
  rejectUnauthorized: boolean;

  constructor(proxy: string, options: https.AgentOptions = {}) {
    super(proxy, options);
    this.rejectUnauthorized = options.rejectUnauthorized !== false;
  }

  connect(req: http.ClientRequest, opts: any) {
    return super.connect(req, { ...opts, rejectUnauthorized: this.rejectUnauthorized });
  }
}

/**
 * node-fetch has no `proxy` option, so proxying goes through an agent: http targets get the
 * request line rewritten to an absolute url (carrying Proxy-Authorization along), https targets
 * CONNECT a tunnel first and then upgrade to TLS.
 *
 * Credentials go in the proxy url (`http://user:pass@host:port`). The return value is usable
 * directly as node-fetch's `agent`; the target protocol decides which one is used.
 */
export default (proxy: string, options: https.AgentOptions = {}) => {
  const httpAgent = new HttpProxyAgent(proxy, options);
  const httpsAgent = new TunnelAgent(proxy, options);
  return (parsedURL: URL) => (parsedURL.protocol === 'https:' ? httpsAgent : httpAgent);
};
