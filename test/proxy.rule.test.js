
const http = require('http');
const getPort = require('get-port');
const rp = require('request-promise');
const fs = require('fs-extra');
const util = require('./util');

describe('proxy rule test', () => {
  let app;
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
      projects: [{
        name: '',
        enable: true,
        rules: [{
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'delay',
          param: {
            delay,
          },
        }],
      }],
    });
    const st = Date.now();
    const response = await rp({
      url,
      strictSSL: false,
      proxy: util.getURL(app),
      resolveWithFullResponse: true,
    });
    expect(response.statusCode).toEqual(200);
    expect(Date.now() - st).toBeGreaterThan(delay);
  });

  test('rule file test', async () => {
    const filePath = __filename;
    const url = util.getTestURL();
    app.config.update({
      projects: [{
        name: '',
        enable: true,
        rules: [{
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'file',
          param: {
            path: filePath,
          },
        }],
      }],
    });
    const optionsResponse = await rp({
      url,
      method: 'OPTIONS',
      strictSSL: false,
      resolveWithFullResponse: true,
      proxy: util.getURL(app),
    });
    expect(optionsResponse.statusCode).toEqual(204);
    expect(optionsResponse.headers['access-control-allow-origin']).toBeTruthy();
    const response = await rp({
      url,
      strictSSL: false,
      proxy: util.getURL(app),
    });
    const fileContent = await fs.readFile(filePath);
    expect(response).toEqual(fileContent.toString());
  });

  test('rule header test', async () => {
    const key = 'test-header';
    const url = util.getTestURL();
    app.config.update({
      projects: [{
        name: '',
        enable: true,
        rules: [{
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'header',
          param: {
            [ key ]: key,
          },
        }],
      }],
    });
    const response = await rp({
      url,
      strictSSL: false,
      proxy: util.getURL(app),
      resolveWithFullResponse: true,
    });
    expect(response.headers[key]).toEqual(key);
  });

  test('rule host test', async () => {
    const url = util.getTestURL(false);
    const param = {
      hostname: '127.0.0.1',
      port: await getPort(),
    };
    app.config.update({
      projects: [{
        name: '',
        enable: true,
        rules: [{
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'host',
          param,
        }],
      }],
    });

    const server = http.createServer((req, res) => {
      res.end('success');
    });
    server.listen(param.port);

    const response = await rp({
      url,
      proxy: util.getURL(app),
    });

    server.close();

    expect(response).toEqual('success');
  });

  test('rule status test', async () => {
    const url = util.getTestURL();
    const param = {
      status: 302,
      location: url,
    };
    app.config.update({
      projects: [{
        name: '',
        enable: true,
        rules: [{
          enable: true,
          match: url.replace(/\./g, '\\.'),
          type: 'status',
          param,
        }],
      }],
    });

    let response;
    try {
      await rp({
        url,
        proxy: util.getURL(app),
        strictSSL: false,
        followRedirect: false,
        resolveWithFullResponse: true,
      });
    } catch (err) {
      // test redirect will throw error
      response = err && err.response;
    }
    expect(response).toBeTruthy();
    expect(response.statusCode).toEqual(param.status);
    expect(response.headers.location).toEqual(param.location);
  });
});
