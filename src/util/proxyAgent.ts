import type http from 'http';
import type https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * HttpsProxyAgent 的构造选项只作用于「本机 → 代理」这一段,
 * 目标站的 TLS 选项要在 connect 时补进去
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
 * node-fetch 没有 `proxy` 选项, 代理靠 agent 实现:
 * http 目标把请求行改写成绝对地址(顺带带上 Proxy-Authorization),
 * https 目标先 CONNECT 建隧道再升级 TLS。
 *
 * 账号写在 proxy url 里(`http://user:pass@host:port`)。
 * 返回值可直接作为 node-fetch 的 `agent`, 由目标协议决定用哪个。
 */
export default (proxy: string, options: https.AgentOptions = {}) => {
  const httpAgent = new HttpProxyAgent(proxy, options);
  const httpsAgent = new TunnelAgent(proxy, options);
  return (parsedURL: URL) => (parsedURL.protocol === 'https:' ? httpsAgent : httpAgent);
};
