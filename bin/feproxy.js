#! /usr/bin/env node

const path = require('path');
const child_process = require('child_process');

const app = path.join(__dirname, '../app.js');

child_process.fork(app, {
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});
