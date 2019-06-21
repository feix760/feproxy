#! /usr/bin/env node

const argv = require('yargs')
  .alias('v', 'version')
  .describe('version', 'output the version number')
  .help('help')
  .argv;

const App = require('../lib/App');
const pkg = require('../package.json');

if (argv.version) {
  console.log(pkg.version);
} else if (argv.help) {
  console.log(argv.help());
} else {
  App().start();
}

process.on('uncaughtException', err => {
  console.error(err);
  process.exit(0);
});
