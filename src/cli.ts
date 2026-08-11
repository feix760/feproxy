import yargs from 'yargs';
import createApp from './App';
import defaultConfig from './defaultConfig';
import type { ConfigData } from './util/ProxyConfig';

const pkg = require('../package.json');

export function main() {
  const argv = yargs
    .usage('Usage: feproxy [options]')
    .option('port', {
      type: 'string',
      describe: 'Service port',
      default: defaultConfig.port,
    })
    .option('hostname', {
      type: 'string',
      describe: 'Hostname of feproxy self site',
      default: defaultConfig.hostname,
    })
    .option('config', {
      type: 'string',
      describe: 'Directory of config files',
      default: defaultConfig.RC_DIR,
    })
    .option('https', {
      type: 'boolean',
      describe: 'Capture and modify https request, use --no-https to disable',
      default: defaultConfig.https,
    })
    .option('ignore-cert-error', {
      type: 'boolean',
      describe: 'Ignore upstream certificate error',
      default: defaultConfig.ignoreCertError,
    })
    .option('auth', {
      type: 'boolean',
      describe: 'Enable proxy basic authentication, use --no-auth to disable',
      default: defaultConfig.auth?.enable,
    })
    .option('username', {
      type: 'string',
      describe: 'Username of proxy basic authentication',
      default: defaultConfig.auth?.username,
    })
    .option('password', {
      type: 'string',
      describe: 'Password of proxy basic authentication',
      default: defaultConfig.auth?.password,
    })
    .alias('p', 'port')
    .alias('c', 'config')
    .version(pkg.version)
    .alias('v', 'version')
    .describe('version', 'Output the version number')
    .help('help')
    .example('feproxy -p 8888', 'Start proxy server on port 8888')
    .example('feproxy --no-https', 'Do not decrypt https request')
    .example('feproxy --no-auth', 'Disable proxy authentication')
    .argv as Record<string, any>;

  // 命令行参数映射为 config
  const config: Partial<ConfigData> = {
    port: argv.port,
    hostname: argv.hostname,
    RC_DIR: argv.config,
    https: argv.https,
    ignoreCertError: argv.ignoreCertError,
    auth: {
      enable: argv.auth,
      username: argv.username,
      password: argv.password,
    },
  };

  createApp(config).start();

  process.on('uncaughtException', err => {
    console.error(err);
    process.exit(0);
  });
}
