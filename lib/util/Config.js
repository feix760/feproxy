
const path = require('path');
const fs = require('fs-extra');
const escapeStringRegexp = require('escape-string-regexp');
const RULES = Symbol('RULES');
const BLOCKED_URLS_CACHE = Symbol('BLOCKED_URLS_CACHE');

class Config {
  constructor(defaultConfig) {
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

  async update(config) {
    Object.assign(this, config);

    this.updateRules();

    await fs.outputJson(this.RC_PATH, {
      projects: this.projects,
    });
  }

  updateRules() {
    let rules = [];

    this.projects.filter(item => item.enable)
      .forEach(item => {
        rules = rules.concat(
          item.rules
            .filter(item => item.enable && item.type)
            .map(item => {
              let match;
              try {
                match = new RegExp(item.match, 'i');
              } catch (err) {
                console.warn(err.message);
              }
              return {
                ...item,
                match,
              };
            })
            .filter(item => item.match)
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

  getRules(blockedURLs) {
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

module.exports = Config;
