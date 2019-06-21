
const fs = require('fs-extra');
const ip = require('ip');
const RULES = Symbol('RULES');

class Config {
  constructor(defaultConfig) {
    let rcConfig = {};

    try {
      if (fs.existsSync(defaultConfig.RC_PATH)) {
        rcConfig = require(defaultConfig.RC_PATH);
      }
    } catch (err) {
      console.warn('Read config error', err);
    }

    const config = {
      ...defaultConfig,

      ...rcConfig,
    };

    config.devtoolsURL = `/devtools/inspector.html?ws=${ip.address()}:${config.port}/ws`;

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
            .filter(item => item.enable)
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

  getRules() {
    return this[RULES];
  }
}

module.exports = Config;
