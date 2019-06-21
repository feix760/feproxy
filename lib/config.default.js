
const path = require('path');
const os = require('os');

module.exports = {
  https: true,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  get RC_PATH() {
    return path.join(this.RC_DIR, 'config.json');
  },

  hostname: 'feproxy.org',

  port: '8080',

  projects: [],
};
