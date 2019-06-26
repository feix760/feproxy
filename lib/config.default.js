
const path = require('path');
const os = require('os');

module.exports = {
  https: true,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  hostname: 'feproxy.org',

  port: '8080',

  projects: [],
};
