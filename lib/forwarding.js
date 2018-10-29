
const fs = require('fs');
const path = require('path');

module.exports = app => {
  let forwarding = {};

  const p = path.join(__dirname, '../run/forwarding.js');
  forwarding = fs.existsSync(p) && require(p) || {};

  forwarding = Object.assign({
    rule: [],
  }, forwarding);

  forwarding.rule.push({
    match: new RegExp(`^https?://${app.config.hostname.replace(/\./g, '\\.')}/(.*)`, 'i'),

    to: `http://127.0.0.1:${app.config.port}/$1`,
  });

  return forwarding;
};
