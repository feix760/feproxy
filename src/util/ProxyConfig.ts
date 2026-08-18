import path from 'path';
import escapeStringRegexp from 'escape-string-regexp';
import fs from 'fs-extra';
import type { Project, Rule } from '../types';

const RULES = Symbol('RULES');
const BLOCKED_URLS_CACHE = Symbol('BLOCKED_URLS_CACHE');

export interface AuthConfig {
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
  /** Master switch for request capturing, only settable at startup (see update()) */
  inspect: boolean;
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
  inspect: boolean;
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
    // Credentials are hardcoded in defaultConfig.ts and can't be changed through the API
    delete update.auth;
    // Capturing is a startup decision (--no-inspect / config.json), so it is read-only here too
    delete update.inspect;
    Object.assign(this, update);

    this.updateRules();

    // Read the existing file first so unrelated fields survive the write
    let rcConfig: Record<string, any> = {};
    try {
      if (fs.existsSync(this.RC_PATH)) {
        rcConfig = await fs.readJson(this.RC_PATH);
      }
    } catch (err) {
      console.warn('Read config error', err);
    }

    // inspect is deliberately not persisted: it is never updated through the API, so writing the
    // in-memory value back would turn a one-off `--no-inspect` run into a permanent setting with no
    // way to undo it from the UI. A hand-written one survives through rcConfig.
    await fs.outputJson(this.RC_PATH, {
      ...rcConfig,
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
