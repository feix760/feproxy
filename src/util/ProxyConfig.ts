import path from 'path';
import escapeStringRegexp from 'escape-string-regexp';
import fs from 'fs-extra';
import type { Project, Rule } from '../types';

const RULES = Symbol('RULES');
const BLOCKED_URLS_CACHE = Symbol('BLOCKED_URLS_CACHE');

export interface AuthConfig {
  /** 是否开启代理账号验证 */
  enable: boolean;
  username: string;
  password: string;
}

export interface ConfigData {
  RC_DIR: string;
  hostname: string;
  port: string | number;
  https: boolean;
  ignoreCertError: boolean;
  auth?: AuthConfig;
  projects: Project[];
  [key: string]: any;
}

class ProxyConfig {
  RC_PATH: string;
  RC_DIR: string;
  hostname: string;
  port: string | number;
  https: boolean;
  ignoreCertError: boolean;
  auth?: AuthConfig;
  projects: Project[];
  [key: string]: any;

  private [RULES]: Rule[];
  private [BLOCKED_URLS_CACHE]: { key: string; rules: Rule[] };

  constructor(defaultConfig: ConfigData) {
    let rcConfig = {};

    this.RC_PATH = path.join(defaultConfig.RC_DIR, 'config.json');

    try {
      if (fs.existsSync(this.RC_PATH)) {
        rcConfig = require(this.RC_PATH);
      }
    } catch (err) {
      console.warn('Read config error', err);
    }

    const config = {
      ...defaultConfig,

      ...rcConfig,
    };

    Object.assign(this, config);
    this[RULES] = [];
    this.updateRules();
  }

  async update(config: Partial<ConfigData>) {
    const update = { ...config };
    // 代理账号写死在 defaultConfig.ts, 不允许通过接口修改
    delete update.auth;
    Object.assign(this, update);

    this.updateRules();

    await fs.outputJson(this.RC_PATH, {
      projects: this.projects,
      https: this.https,
      ignoreCertError: this.ignoreCertError,
    });
  }

  updateRules() {
    let rules: Rule[] = [];

    this.projects.filter(item => item.enable)
      .forEach(item => {
        rules = rules.concat(
          item.rules
            .filter(item => item.enable && item.type)
            .map(item => {
              let match;
              try {
                match = new RegExp(item.match as string, 'i');
              } catch (err) {
                console.warn(err.message);
              }
              return {
                ...item,
                match,
              };
            })
            .filter(item => item.match),
        );
      });

    rules.push({
      type: 'http',
      match: new RegExp(`^https?://${this.hostname.replace(/\./g, '\\.')}/(.*)`, 'i'),
      param: {
        url: `http://127.0.0.1:${this.port}/$1`,
      },
    });

    this[RULES] = rules;
  }

  getRules(blockedURLs: string[]): Rule[] {
    const key = blockedURLs.join(',');
    let cache = this[BLOCKED_URLS_CACHE];

    if (!cache || cache.key !== key) {
      const rules = blockedURLs.map(url => {
        return {
          type: 'status',
          match: new RegExp(`${escapeStringRegexp(url).replace(/\\\*/g, '.*')}`),
          param: {
            status: 404,
          },
        };
      });
      this[BLOCKED_URLS_CACHE] = cache = {
        key,
        rules,
      };
    }

    return [ ...cache.rules, ...this[RULES] ];
  }
}

export default ProxyConfig;
