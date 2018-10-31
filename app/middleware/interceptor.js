
const url = require('url');

function matchTo(str, match, to) {
  if (typeof match === 'string') {
    if (str.startsWith(match)) {
      return to.replace('$1', str.replace(match, ''));
    }
  } else {
    const m = str.match(match);
    if (m) {
      return to.replace(/\$(\d+)/g, (str, index) => m[index]);
    }
  }
  return '';
}

module.exports = async (ctx, next) => {
  const { url: rawURL } = ctx;
  const forwarding = {
    rules: [],
    hosts: [],
    ...ctx.app.config.forwarding,
  };

  const result = {};

  forwarding.rules.some(item => {
    const to = matchTo(rawURL, item.match, item.to);
    if (to) {
      result.url = to;
      if (item.hostname) {
        result.hostname = item.hostname;
      }
      return true;
    }
    return false;
  });

  if (!result.hostname) {
    const hostname = url.parse(result.url || rawURL).hostname;

    forwarding.hosts.some(item => {
      const to = matchTo(hostname, item.match, item.to);
      if (to) {
        result.hostname = to;
        return true;
      }
      return false;
    });
  }

  ctx.forwarding = result;

  await next();
};
