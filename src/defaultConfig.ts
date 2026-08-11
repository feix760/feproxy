import os from 'os';
import path from 'path';
import type { ConfigData } from './util/ProxyConfig';

const defaultConfig: ConfigData = {
  https: true,

  ignoreCertError: false,

  RC_DIR: path.join(os.homedir(), '.feproxy'),

  hostname: 'feproxy.org',

  port: '8888',

  // 代理账号验证, 账号写死在此处, 不支持通过 admin 页面/接口修改, 可以通过 feproxy 命令传入
  auth: {
    enable: false,
    username: 'feproxy',
    password: 'feproxy',
  },

  projects: [],
};

export default defaultConfig;
