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
      alias: 'p',
      describe: 'Service port',
      default: defaultConfig.port,
    })
    .option('hostname', {
      type: 'string',
      describe: 'Hostname of FeProxy self site',
      default: defaultConfig.hostname,
    })
    .option('config', {
      type: 'string',
      alias: 'c',
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
    .option('inspect', {
      type: 'boolean',
      describe: 'Inspect request in devtools, use --no-inspect to disable',
      default: defaultConfig.inspect,
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
    // Aliases go inside option() rather than a separate .alias(): in yargs 17 the latter
    // makes --help drop the [default] annotation
    .version(pkg.version)
    .alias('v', 'version')
    .describe('version', 'Output the version number')
    .help('help')
    .example('feproxy -p 8888', 'Start proxy server on port 8888')
    .example('feproxy --no-https', 'Do not decrypt https request')
    .example('feproxy --no-inspect', 'Disable request inspecting')
    .example('feproxy --no-auth', 'Disable proxy authentication')
    .argv as Record<string, any>;

  const config: Partial<ConfigData> = {
    port: argv.port,
    hostname: argv.hostname,
    RC_DIR: argv.config,
    https: argv.https,
    ignoreCertError: argv.ignoreCertError,
    inspect: argv.inspect,
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
