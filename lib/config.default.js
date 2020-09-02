
const path = require('path');
const os = require('os');

module.exports = {
  https: true,

  ignoreCertError: false,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  hostname: 'feproxy.org',

  port: '8080',

  projects: [],
};
