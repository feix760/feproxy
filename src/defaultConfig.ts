import os from 'os';
import path from 'path';
import type { ConfigData } from './util/ProxyConfig';

const defaultConfig: ConfigData = {
  https: true,

  ignoreCertError: false,

  // Push request/response events to devtools; when off, only forward
  inspect: true,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  hostname: 'feproxy.org',

  port: '8888',

  // Credentials are hardcoded here: not changeable via the admin page or API, only via CLI args
  auth: {
    enable: false,
    username: 'feproxy',
    password: 'feproxy',
  },

  projects: [],
};

export default defaultConfig;
