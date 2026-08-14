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
 * The worker is a browser asset (not bundled by webpack), so we fake a worker scope and run it
 * directly; only self.onmessage / self.postMessage are needed.
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

/** Send one message in FormatterWorkerPool's protocol and return what the worker replies */
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
    // Without it devtools' WorkerWrapper never resolves and every format task hangs
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
      // Empty objects/arrays don't get expanded onto two lines
      '  "e": {},',
      '  "f": []',
      '}',
    ].join('\n'));

    // Whitespace only: strip it and the content must be identical to the input
    expect(result.content.replace(/\s/g, '')).toEqual(content.replace(/\s/g, ''));
  });

  test('keeps number literals as they are', () => {
    // JSON.parse + stringify rewrites precision and exponent notation; what's captured has to match
    // the actual response
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
    // devtools looks these two arrays up with upperBound, so they must be ascending
    const ascending = (list: number[]) => list.every((item, index) => !index || item > list[index - 1]);
    expect(ascending(mapping.original)).toEqual(true);
    expect(ascending(mapping.formatted)).toEqual(true);
    // Each offset pair points at the same token
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
    // JSONP, error pages and the like: content-type says json but the body isn't
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
    // Chunked task: without the last-chunk marker the caller's callback never fires
    expect(runTask(worker, 'parseCSS', { content: '' })).toEqual({ isLastChunk: true, chunk: [] });
    expect(runTask(worker, 'javaScriptScopeTree', { content: '' })).toEqual(null);
    expect(runTask(worker, 'not-exists')).toEqual(null);
  });
});
