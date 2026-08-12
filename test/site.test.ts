import fetch from 'node-fetch';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('site router test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('home page', async () => {
    const response = await fetch(util.getURL(app));
    expect(response.status).toEqual(200);
    expect(await response.text()).toBeTruthy();
  });

  test('download crt file', async () => {
    const response = await fetch(`${util.getURL(app)}feproxy.crt`);
    expect(response.headers.get('content-type')).toEqual('application/octet-stream');
    expect(await response.text()).toBeTruthy();
  });

  test('log message', async () => {
    const url = `${util.getURL(app)}log?index=1&str=${encodeURIComponent(JSON.stringify([ 'message' ]))}`;
    const response = await fetch(url);
    expect(response.status).toEqual(204);
  });
});
