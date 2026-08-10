import yargs from 'yargs';
import createApp from './App';

const pkg = require('../package.json');

export function main() {
  const argv = yargs
    .alias('p', 'port')
    .describe('port', 'Service port')
    .describe('https', 'Capture and modify https request')
    .describe('config', 'Directory fo config files')
    .alias('v', 'version')
    .describe('version', 'Output the version number')
    .help('help')
    .argv;

  if (argv.version) {
    console.log(pkg.version);
  } else if (argv.help) {
    console.log((argv.help as () => string)());
  } else {
    createApp().start();
  }

  process.on('uncaughtException', err => {
    console.error(err);
    process.exit(0);
  });
}
