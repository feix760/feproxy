import os from 'os';
import path from 'path';
import type { ConfigData } from './util/Config';

const configDefault: ConfigData = {
  https: true,

  ignoreCertError: false,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  hostname: 'feproxy.org',

  port: '8888',

  projects: [],
};

export default configDefault;
