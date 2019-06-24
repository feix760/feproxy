
const rp = require('request-promise');
const util = require('./util');

describe('proxy test', () => {
  let app;
  beforeAll(async () => {
    app = await util.startApp();
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('start server normal', async () => {
    expect(app).toBeTruthy();
  });

  test('proxy http', async () => {
    const url = util.getURL(app);
    const response = await rp({
      url,
      proxy: url,
    });

    expect(response).toBeTruthy();
  });

  test('proxy https', async () => {
    const url = util.getURL(app);
    const response = await rp({
      url: `https://${app.config.hostname}/`,
      proxy: url,
      strictSSL: false,
    });

    expect(response).toBeTruthy();
  });

  test('proxy https use connect', async () => {
    const url = util.getURL(app);
    app.config.https = false;
    const response = await rp({
      url: util.getTestURL(),
      proxy: url,
      strictSSL: true,
    });
    app.config.https = true;

    expect(response).toBeTruthy();
  });
});
