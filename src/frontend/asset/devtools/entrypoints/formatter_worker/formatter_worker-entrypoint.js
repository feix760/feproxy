/* eslint-disable */

// devtools 的格式化 worker。上游把它编译成独立入口(路径写死在 devtools 主 chunk 里:
// `new URL('../../entrypoints/formatter_worker/formatter_worker-entrypoint.js', import.meta.url)`,
// 相对 /devtools/chunk-*.js 算下来就是站点根上的 /entrypoints/...), 但 @chrome-devtools/inspector
// 只发了主 chunk, 这个文件不在包里。
//
// 少了它的后果比「不能格式化」严重得多: devtools 的 WorkerWrapper 在 worker 加载失败时只
// console.error, 既不 reject 也不超时, 于是 postMessage 挂在一个永远不 settle 的 promise 上。
// 而 SourceFrame 对压缩过的内容(isMinified: 有一行超过 500 字符)会自动 pretty print,
// `await this.setPretty(true)` 就此卡死, setContent 再也不会执行 —— 表现是点开请求后
// Response 面板只剩一个空编辑器, 没有报错也没有异常(Preview 走的是 iframe, 所以看着正常)。
//
// 这里按 FormatterWorkerPool 的协议实现一个最小版本: JSON 真的重排, 其余原样返回。

(function () {
  /** 内容没变时的位置映射: offset 一一对应 */
  var IDENTITY_MAPPING = { original: [ 0 ], formatted: [ 0 ] };

  var PUNCTUATION = '{}[]:,';

  /**
   * 只做词法切分, 不校验语法(合法性交给外面的 JSON.parse)。
   * 返回 null 表示出现了 JSON 里不该有的字符。
   */
  function tokenize(content) {
    var tokens = [];
    var i = 0;

    while (i < content.length) {
      var ch = content[i];

      // 原有的空白全部丢掉, 由下面重新排版
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        i++;
        continue;
      }

      var start = i;

      if (ch === '"') {
        i++;
        while (i < content.length && content[i] !== '"') {
          i += content[i] === '\\' ? 2 : 1;
        }
        if (i >= content.length) {
          return null;
        }
        i++;
      } else if (PUNCTUATION.indexOf(ch) !== -1) {
        i++;
      } else if (/[-\w.+]/.test(ch)) {
        // 数字和 true/false/null
        while (i < content.length && /[-\w.+]/.test(content[i])) {
          i++;
        }
      } else {
        return null;
      }

      tokens.push({ start: start, end: i });
    }

    return tokens;
  }

  /**
   * 重排 JSON 的缩进。只动空白, 字面量原样搬过去 —— 用 JSON.parse + stringify 会改写数字
   * (精度、指数写法), 抓包工具里看到的内容不能和实际响应不一样。
   * 顺手记下每个 token 的新旧 offset, devtools 靠这个映射在原始/格式化视图之间换算位置。
   */
  function reindentJSON(content, indentString) {
    var tokens = tokenize(content);
    if (!tokens || !tokens.length) {
      return null;
    }

    var original = [];
    var formatted = [];
    var out = '';
    var depth = 0;
    var newline = false;

    for (var i = 0; i < tokens.length; i++) {
      var text = content.slice(tokens[i].start, tokens[i].end);
      var previous = i > 0 ? content[tokens[i - 1].start] : '';

      if (text === '}' || text === ']') {
        depth--;
        // 空的对象/数组保持 `{}`, 不撑成两行
        newline = previous !== '{' && previous !== '[';
      }

      if (newline) {
        out += '\n';
        for (var n = 0; n < depth; n++) {
          out += indentString;
        }
        newline = false;
      }

      original.push(tokens[i].start);
      formatted.push(out.length);
      out += text;

      if (text === '{' || text === '[') {
        depth++;
        // 下一个 token 就是闭括号的话, 上面那个分支会把它改回 false
        newline = true;
      } else if (text === ',') {
        newline = true;
      } else if (text === ':') {
        out += ' ';
      }
    }

    return {
      content: out,
      mapping: { original: original, formatted: formatted },
    };
  }

  /**
   * devtools 只对这几种类型开格式化按钮: application/javascript、application/json、
   * application/manifest+json、text/css、text/html、text/javascript。
   * 这里只处理 JSON, 其余原样返回(内容照样能显示, 只是 `{}` 按钮点了没变化)。
   */
  function format(params) {
    var content = params.content || '';
    var mimeType = params.mimeType || '';

    if (/json/.test(mimeType)) {
      try {
        JSON.parse(content);
        var result = reindentJSON(content, params.indentString || '    ');
        if (result) {
          return result;
        }
      } catch (err) {
        // 不是合法 JSON(JSONP、报错页面...), 别动它
      }
    }

    return { content: content, mapping: IDENTITY_MAPPING };
  }

  self.onmessage = function (event) {
    var data = event.data || {};
    var params = data.params || {};

    switch (data.method) {
      case 'format':
        self.postMessage(format(params));
        break;
      case 'javaScriptSubstitute':
        self.postMessage(params.content || '');
        break;
      case 'parseCSS':
        // 分块任务, 必须给个结束标记, 否则调用方的回调收不到
        self.postMessage({ isLastChunk: true, chunk: [] });
        break;
      default:
        // javaScriptScopeTree 等: 调用方对 null 有降级分支
        self.postMessage(null);
    }
  };

  // 少了这句 WorkerWrapper 的 promise 不会 resolve
  self.postMessage('workerReady');
})();
