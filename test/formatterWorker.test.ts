import fs from 'fs';
import path from 'path';

const WORKER_PATH = path.join(
  __dirname,
  '../src/frontend/asset/devtools/entrypoints/formatter_worker/formatter_worker-entrypoint.js',
);

interface WorkerScope {
  onmessage: (event: { data: any }) => void;
  postMessage: jest.Mock;
}

/**
 * worker 是给浏览器用的资源文件(不走 webpack 打包), 这里造一个假的 worker 作用域直接跑它,
 * 只需要 self.onmessage / self.postMessage 两个东西
 */
const createWorker = (): WorkerScope => {
  const source = fs.readFileSync(WORKER_PATH, 'utf8');
  const self = {
    onmessage: null,
    postMessage: jest.fn(),
  } as unknown as WorkerScope;

  new Function('self', source)(self);

  return self;
};

/** 按 FormatterWorkerPool 的协议发一条消息, 返回 worker 回的内容 */
const runTask = (worker: WorkerScope, method: string, params?: any) => {
  worker.postMessage.mockClear();
  worker.onmessage({ data: { method, params } });

  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  return worker.postMessage.mock.calls[0][0];
};

describe('formatter worker test', () => {
  let worker: WorkerScope;

  beforeEach(() => {
    worker = createWorker();
  });

  test('sends workerReady on startup', () => {
    // 少了这条 devtools 的 WorkerWrapper 永远不 resolve, 所有格式化任务都会挂住
    expect(worker.postMessage).toHaveBeenCalledWith('workerReady');
    expect(typeof worker.onmessage).toEqual('function');
  });

  test('formats minified json', () => {
    const content = '{"a":1,"b":[1,2],"c":{"d":"x"},"e":{},"f":[]}';
    const result = runTask(worker, 'format', {
      mimeType: 'application/json',
      content,
      indentString: '  ',
    });

    expect(result.content).toEqual([
      '{',
      '  "a": 1,',
      '  "b": [',
      '    1,',
      '    2',
      '  ],',
      '  "c": {',
      '    "d": "x"',
      '  },',
      // 空的对象/数组不撑成两行
      '  "e": {},',
      '  "f": []',
      '}',
    ].join('\n'));

    // 只动空白: 去掉空白后的内容必须和原来一模一样
    expect(result.content.replace(/\s/g, '')).toEqual(content.replace(/\s/g, ''));
  });

  test('keeps number literals as they are', () => {
    // JSON.parse + stringify 会改写精度和指数写法, 抓包看到的内容不能和实际响应不一样
    const content = '{"big":12345678901234567890,"exp":1E+2,"small":0.10}';
    const result = runTask(worker, 'format', {
      mimeType: 'application/json',
      content,
    });

    expect(result.content).toContain('12345678901234567890');
    expect(result.content).toContain('1E+2');
    expect(result.content).toContain('0.10');
  });

  test('does not break strings with punctuation inside', () => {
    const content = '{"a":"{\\"x\\":1},[2]","b":":,"}';
    const result = runTask(worker, 'format', {
      mimeType: 'application/json',
      content,
    });

    expect(result.content).toEqual([
      '{',
      '    "a": "{\\"x\\":1},[2]",',
      '    "b": ":,"',
      '}',
    ].join('\n'));
  });

  test('mapping keeps token offsets of both sides', () => {
    const content = '{"a":1}';
    const { mapping, content: formatted } = runTask(worker, 'format', {
      mimeType: 'application/json',
      content,
    });

    expect(mapping.original.length).toEqual(mapping.formatted.length);
    // devtools 用 upperBound 查这两个数组, 必须递增
    const ascending = (list: number[]) => list.every((item, index) => !index || item > list[index - 1]);
    expect(ascending(mapping.original)).toEqual(true);
    expect(ascending(mapping.formatted)).toEqual(true);
    // 每一对 offset 指向的是同一个 token
    mapping.original.forEach((offset: number, index: number) => {
      expect(formatted[mapping.formatted[index]]).toEqual(content[offset]);
    });
  });

  test('returns content as is for other mime types', () => {
    const content = 'body{color:red}';
    const result = runTask(worker, 'format', {
      mimeType: 'text/css',
      content,
    });

    expect(result.content).toEqual(content);
    expect(result.mapping).toEqual({ original: [ 0 ], formatted: [ 0 ] });
  });

  test('returns content as is for broken json', () => {
    // JSONP、报错页面之类, content-type 是 json 但内容不是
    const content = 'callback({"a":1})';
    const result = runTask(worker, 'format', {
      mimeType: 'application/json',
      content,
    });

    expect(result.content).toEqual(content);
  });

  test('formats empty content', () => {
    const result = runTask(worker, 'format', { mimeType: 'application/json' });

    expect(result.content).toEqual('');
  });

  test('answers the rest of the protocol', () => {
    expect(runTask(worker, 'javaScriptSubstitute', { content: 'var a = 1;' })).toEqual('var a = 1;');
    // 分块任务, 不给结束标记调用方的回调收不到
    expect(runTask(worker, 'parseCSS', { content: '' })).toEqual({ isLastChunk: true, chunk: [] });
    expect(runTask(worker, 'javaScriptScopeTree', { content: '' })).toEqual(null);
    expect(runTask(worker, 'not-exists')).toEqual(null);
  });
});
