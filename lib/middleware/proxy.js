
module.exports = async ctx => {
  const proxyPlugins = ctx.app.proxyPlugins;
  const plugins = [];

  function matchPlugin(type, match, paramConfig) {
    const param = matchReg(ctx.url, match, paramConfig);
    if (param && type && !plugins.find(item => item.type === type)) {
      plugins.push({
        type,
        param,
        fn: proxyPlugins[type].fn,
      });
    }
  }

  ctx.app.config.getRules().forEach(rule => {
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

  async function chain(index) {
    const m = plugins[index];

    if (m) {
      await m.fn(ctx, () => chain(index + 1), m.param, plugins);
    }
  }

  await chain(0);
};

function matchReg(str, reg, replacement) {
  replacement = replacement || {};
  let match;
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

  const p = {};
  Object.keys(replacement).forEach(key => {
    if (typeof replacement[key] === 'string') {
      p[key] = replacement[key].replace(/\$(\d+)/g, (str, i) => {
        return typeof match[i] !== 'undefined' ? match[i] : str;
      });
    } else {
      p[key] = replacement[key];
    }
  });
  return p;
}
