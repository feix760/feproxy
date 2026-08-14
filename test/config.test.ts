import path from 'path';
import fs from 'fs-extra';
import defaultConfig from '../src/defaultConfig';
import ProxyConfig from '../src/util/ProxyConfig';
import type { ConfigData } from '../src/util/ProxyConfig';

const tmpDir = path.join(__dirname, '.tmp');

describe('ProxyConfig test', () => {
  const dirs: string[] = [];

  /** One RC_DIR per case: `require(config.json)` is cached, so dirs can't be reused */
  const createConfig = async (rcConfig?: string, config?: Partial<ConfigData>) => {
    const RC_DIR = path.join(tmpDir, `config-${dirs.length}-${Math.random()}`);
    dirs.push(RC_DIR);
    if (typeof rcConfig === 'string') {
      await fs.outputFile(path.join(RC_DIR, 'config.json'), rcConfig);
    }
    return new ProxyConfig({ ...defaultConfig, RC_DIR, ...config });
  };

  afterAll(async () => {
    await Promise.all(dirs.map(dir => fs.remove(dir)));
  });

  test('builtin rule forwards self site to local server', async () => {
    const config = await createConfig();
    const rules = config.getRules([]);

    expect(rules.length).toEqual(1);
    expect(rules[0].type).toEqual('http');
    expect((rules[0].match as RegExp).test(`http://${defaultConfig.hostname}/log.js`)).toEqual(true);
    expect(rules[0].param.url).toEqual(`http://127.0.0.1:${defaultConfig.port}/$1`);
  });

  test('read config.json in RC_DIR', async () => {
    const config = await createConfig(JSON.stringify({
      https: false,
      projects: [ {
        name: 'p',
        enable: true,
        rules: [ { enable: true, type: 'delay', match: 'a\\.com', param: { delay: 1 } } ],
      } ],
    }));

    expect(config.https).toEqual(false);
    expect(config.getRules([]).length).toEqual(2);
  });

  test('ignore broken config.json', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await createConfig('{ broken');

    expect(config.https).toEqual(defaultConfig.https);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('skip disabled and invalid rules', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await createConfig(undefined, {
      projects: [
        { name: 'disabled project', enable: false, rules: [
          { enable: true, type: 'delay', match: '.*', param: { delay: 1 } },
        ] },
        { name: 'p', enable: true, rules: [
          // disabled
          { enable: false, type: 'delay', match: '.*', param: { delay: 1 } },
          // no type
          { enable: true, type: '', match: '.*', param: {} },
          // invalid regex
          { enable: true, type: 'delay', match: '(', param: { delay: 1 } },
          { enable: true, type: 'delay', match: 'a\\.com', param: { delay: 1 } },
        ] },
      ] as any,
    });

    // One valid rule left, plus the builtin one
    expect(config.getRules([]).length).toEqual(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('blocked urls become 404 rules in front', async () => {
    const config = await createConfig();
    const rules = config.getRules([ 'http://a.com/*.js' ]);

    expect(rules[0].type).toEqual('status');
    expect(rules[0].param.status).toEqual(404);
    expect((rules[0].match as RegExp).test('http://a.com/a/b.js')).toEqual(true);
    // The same blockedURLs hits the cache
    expect(config.getRules([ 'http://a.com/*.js' ])[0]).toBe(rules[0]);
    expect(config.getRules([])[0]).not.toBe(rules[0]);
  });

  test('update persists part of config', async () => {
    const config = await createConfig();
    await config.update({
      projects: [ { name: 'p', enable: true, rules: [] } ],
      https: false,
      inspect: false,
      // credentials can't be changed through the API
      auth: { enable: true, username: 'a', password: 'b' },
      // other fields only take effect in memory
      port: 1234,
    });

    expect(config.https).toEqual(false);
    expect(config.inspect).toEqual(false);
    expect(config.port).toEqual(1234);
    expect(config.auth).toEqual(defaultConfig.auth);

    expect(await fs.readJson(config.RC_PATH)).toEqual({
      projects: [ { name: 'p', enable: true, rules: [] } ],
      https: false,
      ignoreCertError: defaultConfig.ignoreCertError,
      inspect: false,
    });
  });

  test('update keeps unknown fields in config.json', async () => {
    const config = await createConfig(JSON.stringify({ custom: 1 }));
    await config.update({ https: false });

    expect((await fs.readJson(config.RC_PATH)).custom).toEqual(1);
  });

  test('update overwrites broken config.json', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await createConfig('{ broken');
    await config.update({ https: false });

    expect((await fs.readJson(config.RC_PATH)).https).toEqual(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
