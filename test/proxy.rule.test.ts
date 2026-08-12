import http from 'http';
import fs from 'fs-extra';
import getPort from 'get-port';
import fetch from 'node-fetch';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('proxy rule test', () => {
  let app: FeproxyApp;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('rule delay test', async () => {
    const delay = 2000;
    const url = util.getTestURL();
    app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'delay',
          param: {
            delay,
          },
        } ],
      } ],
    });
    const st = Date.now();
    const response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    await response.text();
    expect(response.status).toEqual(200);
    expect(Date.now() - st).toBeGreaterThan(delay);
  });

  test('rule file test', async () => {
    const filePath = __filename;
    const url = util.getTestURL();
    app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'file',
          param: {
            path: filePath,
          },
        } ],
      } ],
    });
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      agent: util.getProxyAgent(app),
    });
    expect(optionsResponse.status).toEqual(204);
    expect(optionsResponse.headers.get('access-control-allow-origin')).toBeTruthy();
    const response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    const fileContent = await fs.readFile(filePath);
    expect(await response.text()).toEqual(fileContent.toString());
  });

  test('rule header test', async () => {
    const key = 'test-header';
    const url = util.getTestURL();
    app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'header',
          param: {
            [key]: key,
          },
        } ],
      } ],
    });
    const response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    await response.text();
    expect(response.headers.get(key)).toEqual(key);
  });

  test('rule host test', async () => {
    const url = util.getTestURL(false);
    const param = {
      hostname: '127.0.0.1',
      port: await getPort(),
    };
    app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'host',
          param,
        } ],
      } ],
    });

    const server = http.createServer((req, res) => {
      res.end('success');
    });
    server.listen(param.port);

    const response = await fetch(url, {
      agent: util.getProxyAgent(app),
    });
    const body = await response.text();

    server.close();

    expect(body).toEqual('success');
  });

  test('rule status test', async () => {
    const url = util.getTestURL();
    const param = {
      status: 302,
      location: url,
    };
    app.config.update({
      projects: [ {
        name: '',
        enable: true,
        rules: [ {
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'status',
          param,
        } ],
      } ],
    });

    const response = await fetch(url, {
      agent: util.getProxyAgent(app),
      redirect: 'manual',
    });
    await response.text();

    expect(response.status).toEqual(param.status);
    expect(response.headers.get('location')).toEqual(param.location);
  });
});
