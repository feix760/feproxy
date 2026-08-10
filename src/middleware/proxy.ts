import type { MatchedPlugin, ProxyContext } from '../types';

export default async (ctx: ProxyContext) => {
  const proxyPlugins = ctx.app.proxyPlugins;
  const plugins: MatchedPlugin[] = [];

  function matchPlugin(type: string, match: RegExp | string, paramConfig: Record<string, any>) {
    const param = matchReg(ctx.url, match, paramConfig);
    if (param && type && !plugins.find(item => item.type === type)) {
      plugins.push({
        type,
        param,
        fn: proxyPlugins[type].fn,
      });
    }
  }

  const rules = ctx.app.config.getRules(ctx.app.inspector.getBlockedURLs());

  rules.forEach(rule => {
    if (proxyPlugins[rule.type]) {
      matchPlugin(rule.type, rule.match, rule.param);
    } else {
      console.warn('unsupported proxy plugin', rule);
    }
  });

  Object.keys(proxyPlugins).forEach(type => {
    const item = proxyPlugins[type];
    matchPlugin(type, item.match, item.param);
  });

  plugins.sort((a, b) => {
    const ap = proxyPlugins[a.type].priority || 50;
    const bp = proxyPlugins[b.type].priority || 50;
    return ap > bp ? -1 : 1;
  });

  async function chain(index: number) {
    const m = plugins[index];

    if (m) {
      await m.fn(ctx, () => chain(index + 1), m.param, plugins);
    }
  }

  await chain(0);
};

function matchReg(str: string, reg: RegExp | string, replacement: Record<string, any>) {
  replacement = replacement || {};
  let match: RegExpMatchArray | string[];
  if (typeof reg === 'string') {
    if (str.startsWith(reg)) {
      match = [ reg ];
    }
  } else if (reg) {
    match = str.match(reg);
  }

  if (!match) {
    return null;
  }

  const p: Record<string, any> = {};
  Object.keys(replacement).forEach(key => {
    if (typeof replacement[key] === 'string') {
      p[key] = replacement[key].replace(/\$(\d+)/g, (str: string, i: number) => {
        return typeof match[i] !== 'undefined' ? match[i] : str;
      });
    } else {
      p[key] = replacement[key];
    }
  });
  return p;
}
