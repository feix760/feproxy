
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const ip = require('ip');

const RC_DIR = path.join(os.homedir(), '.feproxy');
const RC_PATH = path.join(RC_DIR, 'config.json');

const defaultConfig = {
  hostname: 'feproxy.org',

  port: '8080',

  projects: [],

  activeProjects: [],
};

module.exports = () => {
  let rcConfig = {};

  try {
    if (fs.existsSync(RC_PATH)) {
      rcConfig = require(RC_PATH);
    }
  } catch (err) {
    console.warn('Read config error', err);
  }

  const config = {
    ...defaultConfig,

    ...rcConfig,
  };

  config.devtoolsURL = `chrome-devtools://devtools/bundled/inspector.html?ws=${ip.address()}:${config.port}/ws`;

  const forwarding = {};

  function updateForwarding() {
    let rules = [];
    let hosts = [];

    config.projects.filter(item => item.enable)
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
        hosts = hosts.concat(
          item.hosts
            .filter(item => item.enable)
            .map(item => ({
              ...item,
            }))
        );
      });

    rules.push({
      match: new RegExp(`^https?://${config.hostname.replace(/\./g, '\\.')}/(.*)`, 'i'),

      to: `http://127.0.0.1:${config.port}/$1`,
    });

    Object.assign(forwarding, {
      rules,
      hosts,
    });
  }

  updateForwarding();

  Object.defineProperties(config, {
    setConfig: {
      writable: false,
      value(conf) {
        Object.assign(config, conf);

        updateForwarding();

        fs.outputFileSync(RC_PATH, JSON.stringify(config));
      },
    },
    forwarding: {
      enumerable: false,
      value: forwarding,
    },
    RC_DIR: {
      enumerable: false,
      value: RC_DIR,
    },
  });

  return config;
};
