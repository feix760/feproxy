import defaultConfig from '../src/defaultConfig';

const mockStart = jest.fn();
const mockCreateApp = jest.fn(() => ({ start: mockStart }));

jest.mock('../src/App', () => ({
  __esModule: true,
  default: (config: any) => mockCreateApp(config),
}));

/**
 * yargs 17 的默认导出是个单例, 加载时就把 hideBin(process.argv) 存了下来,
 * 所以每个用例都要先改 process.argv 再 resetModules 重新 require。
 */
function runCli(args: string[]) {
  const argv = process.argv;
  process.argv = [ 'node', 'feproxy', ...args ];
  try {
    jest.resetModules();

    require('../src/cli').main();
  } finally {
    process.argv = argv;
  }
  return mockCreateApp.mock.calls[mockCreateApp.mock.calls.length - 1][0] as any;
}

describe('cli test', () => {
  const listeners = process.listeners('uncaughtException');

  beforeEach(() => {
    mockCreateApp.mockClear();
    mockStart.mockClear();
  });

  afterEach(() => {
    // main() 每次都会挂一个 uncaughtException, 这里清掉避免污染其他 suite
    process.listeners('uncaughtException')
      .filter(fn => !listeners.includes(fn))
      .forEach(fn => process.removeListener('uncaughtException', fn));
  });

  test('start app with default config', () => {
    const config = runCli([]);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(config).toEqual({
      port: defaultConfig.port,
      hostname: defaultConfig.hostname,
      RC_DIR: defaultConfig.RC_DIR,
      https: defaultConfig.https,
      ignoreCertError: defaultConfig.ignoreCertError,
      inspect: defaultConfig.inspect,
      auth: {
        enable: defaultConfig.auth.enable,
        username: defaultConfig.auth.username,
        password: defaultConfig.auth.password,
      },
    });
  });

  test('short alias', () => {
    const config = runCli([ '-p', '8909', '-c', '/tmp/feproxy-cli-test' ]);

    expect(config.port).toEqual('8909');
    expect(config.RC_DIR).toEqual('/tmp/feproxy-cli-test');
  });

  test('long options', () => {
    const config = runCli([
      '--port', '8910',
      '--hostname', 'feproxy.test',
      '--config', '/tmp/feproxy-cli-test2',
      '--ignore-cert-error',
      '--username', 'u',
      '--password', 'p',
    ]);

    expect(config).toEqual({
      port: '8910',
      hostname: 'feproxy.test',
      RC_DIR: '/tmp/feproxy-cli-test2',
      https: true,
      ignoreCertError: true,
      inspect: true,
      auth: {
        enable: defaultConfig.auth.enable,
        username: 'u',
        password: 'p',
      },
    });
  });

  test('negated boolean options', () => {
    const config = runCli([ '--no-https', '--no-inspect', '--no-auth' ]);

    expect(config.https).toEqual(false);
    expect(config.inspect).toEqual(false);
    expect(config.auth.enable).toEqual(false);
  });

  test('uncaughtException handler exits', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    runCli([]);

    const handler = process.listeners('uncaughtException')
      .filter(fn => !listeners.includes(fn))
      .pop();
    const err = new Error('boom');
    (handler as any)(err);

    expect(error).toHaveBeenCalledWith(err);
    expect(exit).toHaveBeenCalledWith(0);

    exit.mockRestore();
    error.mockRestore();
  });
});
