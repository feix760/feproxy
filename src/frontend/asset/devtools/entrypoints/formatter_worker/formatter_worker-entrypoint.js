/* eslint-disable */

// devtools' formatter worker. Upstream compiles it into a standalone entry whose path is baked
// into the devtools main chunk (`new URL('../../entrypoints/formatter_worker/
// formatter_worker-entrypoint.js', import.meta.url)`, which resolves against /devtools/chunk-*.js
// to /entrypoints/... at the site root), but @chrome-devtools/inspector only ships the main chunk.
//
// Missing it is far worse than "can't format": when a worker fails to load, devtools'
// WorkerWrapper only console.errors — it neither rejects nor times out — so postMessage hangs on
// a promise that never settles. SourceFrame auto pretty-prints minified content (isMinified: any
// line over 500 chars), so `await this.setPretty(true)` deadlocks and setContent never runs. The
// symptom is an empty editor in the Response panel with no error at all (Preview uses an iframe,
// so it still looks fine).
//
// This is a minimal implementation of the FormatterWorkerPool protocol: JSON really is reindented,
// everything else comes back untouched.

(function () {
  /** Position mapping for unchanged content: offsets map one to one */
  var IDENTITY_MAPPING = { original: [ 0 ], formatted: [ 0 ] };

  var PUNCTUATION = '{}[]:,';

  /**
   * Lexical split only, no syntax checking — validity is the caller's JSON.parse to decide.
   * Returns null when a character that can't appear in JSON shows up.
   */
  function tokenize(content) {
    var tokens = [];
    var i = 0;

    while (i < content.length) {
      var ch = content[i];

      // Drop all existing whitespace; it gets laid out again below
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
        // numbers and true/false/null
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
   * Reindent JSON. Only whitespace changes; literals are copied verbatim — JSON.parse +
   * stringify would rewrite numbers (precision, exponent notation), and a capture tool must not
   * show content that differs from the actual response.
   * Old and new offsets of every token are recorded along the way; devtools uses that mapping to
   * translate positions between the original and formatted views.
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
        // Keep empty objects/arrays as `{}` instead of spreading them over two lines
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
        // If the next token is the closing bracket, the branch above flips this back to false
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
   * devtools only offers the format button for these types: application/javascript,
   * application/json, application/manifest+json, text/css, text/html, text/javascript.
   * We only handle JSON and return everything else untouched (it still displays fine, the `{}`
   * button just does nothing).
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
        // Not valid JSON (JSONP, an error page...) — leave it alone
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
        // A chunked task: without an end marker the caller's callback never fires
        self.postMessage({ isLastChunk: true, chunk: [] });
        break;
      default:
        // javaScriptScopeTree and friends: callers have a fallback path for null
        self.postMessage(null);
    }
  };

  // Without this the WorkerWrapper promise never resolves
  self.postMessage('workerReady');
})();
