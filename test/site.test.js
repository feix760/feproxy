
const rp = require('request-promise');
const util = require('./util');

describe('site router test', () => {
  let app;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('home page', async () => {
    const response = await rp({
      url: util.getURL(app),
    });
    expect(response).toBeTruthy();
  });

  test('download crt file', async () => {
    const response = await rp({
      url: `${util.getURL(app)}feproxy.crt`,
      resolveWithFullResponse: true,
    });
    expect(response.headers['content-type']).toEqual('application/octet-stream');
    expect(response.body).toBeTruthy();
  });

  test('log message', async () => {
    const response = await rp({
      url: `${util.getURL(app)}log?index=1&str=${encodeURIComponent(JSON.stringify([ 'message' ]))}`,
      resolveWithFullResponse: true,
    });
    expect(response.statusCode).toEqual(204);
  });
});
