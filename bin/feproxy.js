#! /usr/bin/env node

const path = require('path');
const child_process = require('child_process');

const argv = require('yargs')
  .alias('v', 'version')
  .describe('version', 'output the version number')
  .help('help')
  .argv;

const app = path.join(__dirname, '../app.js');
const pkg = require('../package.json');

if (argv.version) {
  console.log(pkg.version);
} else if (argv.help) {
  console.log(argv.help());
} else {
  child_process.fork(app, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });
}
