import assert from "node:assert/strict";
import test from "node:test";

import { parseFieldValue } from "../src/engine/fieldParser.js";
import { executeStep } from "../src/engine/stepExecutor.js";
import { createDom, evaluateNodes, evaluateValue } from "../src/engine/xpath.js";
import { resolveWithHost } from "../src/utils/url.js";

test("list child XPath treats a leading // as relative to the current item", () => {
  const document = createDom(
    "<ul><li><a href='/a'>A</a></li><li><a href='/b'>B</a></li></ul>"
  );
  const items = evaluateNodes(document, "//li", document);

  assert.equal(evaluateValue(document, "//a/@href", items[0]), "/a");
  assert.equal(evaluateValue(document, "//a/@href", items[1]), "/b");
});

test("HTML field pipes accept whitespace between || and @js", async () => {
  const document = createDom("<p>value</p>");
  const value = await parseFieldValue({
    document,
    expression: "//missing || @js: return result || 'fallback';",
    contextNode: document,
    context: { config: {}, params: {}, result: null }
  });

  assert.equal(value, "fallback");
});

test("JSON field pipes accept whitespace between || and @js", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo: "https://example.com/detail",
          responseFormatType: "json",
          title: "name || @js: return String(result) + '!';"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "http",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: { bookDetail: "{\"name\":\"Book\"}" }
    }
  });

  assert.equal(result.parseResult.item.title, "Book!");
});

test("URL resolution follows standard URL semantics", () => {
  assert.equal(
    resolveWithHost("https://example.com/base/index.html", "/chapter/1"),
    "https://example.com/chapter/1"
  );
  assert.equal(
    resolveWithHost("http://example.com/base/", "//cdn.example.com/a"),
    "http://cdn.example.com/a"
  );
  assert.equal(
    resolveWithHost("https://example.com/base/", "chapter/1"),
    "https://example.com/base/chapter/1"
  );
});

test("WebView HTTP fallback is blocked and reports the actual runtime", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo: "https://example.com/detail",
          responseFormatType: "html",
          webView: true,
          title: "//h1/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "live",
    engine: "auto",
    queryPayload: {},
    performWebViewRequest: async () => ({
      body: "<h1>Book</h1>",
      responseUrl: "https://example.com/detail",
      status: 200,
      headers: {},
      blockedReason: "",
      trace: [{ type: "webview_engine_fallback" }],
      runtimeEngine: "webview:fallback"
    })
  });

  assert.equal(result.success, false);
  assert.equal(result.blocked, true);
  assert.equal(result.requestDebug.runtimeEngine, "webview:fallback");
  assert.ok(
    result.fieldDiagnostics.some(
      (diagnostic) =>
        diagnostic.field === "webview" &&
        diagnostic.level === "error" &&
        diagnostic.message.includes("fallback")
    )
  );
});

test("fixture request URL must match its manifest URL", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo: "https://example.com/wrong",
          responseFormatType: "html",
          title: "//h1/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "http",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: {
        bookDetail: {
          html: "<h1>Book</h1>",
          url: "https://example.com/detail"
        }
      }
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.requestDebug.fixtureExpectedUrl, "https://example.com/detail");
  assert.equal(result.requestDebug.fixtureUrlVerified, false);
  assert.ok(
    result.fieldDiagnostics.some(
      (diagnostic) =>
        diagnostic.field === "fixture_url" &&
        diagnostic.level === "error" &&
        diagnostic.message.includes("does not match")
    )
  );
});

test("fixture without URL metadata is explicitly unverified", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo: "https://example.com/detail",
          responseFormatType: "html",
          title: "//h1/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "http",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: { bookDetail: "<h1>Book</h1>" }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.requestDebug.fixtureUrlVerified, false);
  assert.ok(
    result.fieldDiagnostics.some(
      (diagnostic) =>
        diagnostic.field === "fixture_url" &&
        diagnostic.level === "warning" &&
        diagnostic.message.includes("url_unverified")
    )
  );
});

for (const unsupportedCase of [
  {
    name: "parserID=JS",
    action: { parserID: "JS" },
    capability: "parserID=JS"
  },
  {
    name: "special response format",
    action: { responseFormatType: "data" },
    capability: "responseFormatType=data"
  },
  {
    name: "WebView sniff",
    action: { webViewSniff: true },
    capability: "webViewSniff"
  },
  {
    name: "GBK POST params",
    action: {
      requestParamsEncode: "2147485234",
      requestInfo: "@js:return {'url':'https://example.com/post','POST':true,'httpParams':{'q':'x'}};"
    },
    capability: "requestParamsEncode=gbk(POST)"
  }
]) {
  test(`unsupported ${unsupportedCase.name} produces a structured error`, async () => {
    const result = await executeStep({
      step: "bookDetail",
      source: {
        Source: {
          sourceUrl: "https://example.com",
          bookDetail: {
            requestInfo: "https://example.com/detail",
            responseFormatType: "html",
            title: "//h1",
            ...unsupportedCase.action
          }
        }
      },
      sourceKey: "Source",
      mode: "fixture",
      engine: "http",
      queryPayload: {},
      fixturesState: {
        mode: "map",
        data: { bookDetail: "<h1>Book</h1>" }
      }
    });

    assert.equal(result.success, false);
    assert.ok(
      result.fieldDiagnostics.some(
        (diagnostic) =>
          diagnostic.field === "unsupported" &&
          diagnostic.level === "error" &&
          diagnostic.message.includes(unsupportedCase.capability)
      )
    );
  });
}

test("webViewForbidUrls is treated as a WebView signal", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo: "https://example.com/detail",
          responseFormatType: "html",
          webViewForbidUrls: ["https://example.com/ads.js"],
          title: "//h1/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "auto",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: { bookDetail: "<h1>Book</h1>" }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.requestDebug.runtimeEngine, "webview");
  assert.ok(result.requestDebug.webviewAppliedKeys.includes("webViewForbidUrls"));
});

test("requestInfo JS may override responseFormatType for the current step", async () => {
  const result = await executeStep({
    step: "bookDetail",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        bookDetail: {
          requestInfo:
            "@js:return {'url':'https://example.com/api/detail','responseFormatType':'json'};",
          responseFormatType: "html",
          title: "name"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "http",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: { bookDetail: '{"name":"Book Title"}' }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.parseResult.item.title, "Book Title");
});

test("fixture pagination is first-page-only and never an unsupported error", async () => {
  const result = await executeStep({
    step: "chapterContent",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        chapterContent: {
          requestInfo: "https://example.com/book/1/1.html",
          responseFormatType: "html",
          moreKeys: { maxPage: 3 },
          nextPageUrl: "//a[@id='next']/@href",
          title: "//h1/text()",
          content: "//div[@id='content']/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "fixture",
    engine: "http",
    queryPayload: {},
    fixturesState: {
      mode: "map",
      data: { chapterContent: "<h1>C1</h1><div id='content'>Page one</div><a id='next' href='1_2.html'>next</a>" }
    }
  });

  assert.equal(result.success, true);
  assert.ok(
    !result.fieldDiagnostics.some(
      (diagnostic) =>
        diagnostic.field === "unsupported" && diagnostic.message.includes("pagination")
    )
  );
  assert.equal(result.requestDebug.pagination.enabled, true);
  assert.equal(result.requestDebug.pagination.pagesRequested, 1);
  assert.equal(result.requestDebug.pagination.fixtureLimited, true);
  assert.equal(result.parseResult.item.content, "Page one");
});

test("live pagination loops nextPageUrl, merges content, and respects maxPage", async () => {
  const pages = {
    "https://example.com/book/1/1.html":
      "<h1>C1</h1><div id='content'>Page one</div><a id='next' href='1_2.html'>next</a>",
    "https://example.com/book/1/1_2.html":
      "<h1>C1</h1><div id='content'>Page two</div><a id='next' href='1_3.html'>next</a>",
    "https://example.com/book/1/1_3.html":
      "<h1>C1</h1><div id='content'>Page three</div>"
  };
  const performHttpRequest = async (request) => {
    const body = pages[request.url] || "<html></html>";
    return {
      body,
      responseUrl: request.url,
      status: 200,
      headers: {},
      blockedReason: ""
    };
  };

  const result = await executeStep({
    step: "chapterContent",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        chapterContent: {
          requestInfo: "https://example.com/book/1/1.html",
          responseFormatType: "html",
          moreKeys: { maxPage: 5 },
          nextPageUrl: "//a[@id='next']/@href",
          title: "//h1/text()",
          content: "//div[@id='content']/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "live",
    engine: "http",
    queryPayload: {},
    performHttpRequest
  });

  assert.equal(result.success, true);
  assert.equal(result.requestDebug.pagination.pagesRequested, 3);
  assert.equal(result.requestDebug.pagination.lastNextPageUrl, "");
  assert.equal(result.parseResult.item.title, "C1");
  assert.equal(result.parseResult.item.content, "Page one\nPage two\nPage three");
  assert.equal(result.requestDebug.pagination.pages.length, 3);
});

test("live pagination stops at maxPage and warns on failed later pages", async () => {
  const pages = {
    "https://example.com/book/1/1.html":
      "<h1>C1</h1><div id='content'>Page one</div><a id='next' href='1_2.html'>next</a>",
    "https://example.com/book/1/1_2.html":
      "<h1>C1</h1><div id='content'>Page two</div><a id='next' href='1_3.html'>next</a>"
  };
  const performHttpRequest = async (request) => {
    if (request.url === "https://example.com/book/1/1_3.html") {
      return { body: "", responseUrl: request.url, status: 403, headers: {}, blockedReason: "HTTP 403 forbidden" };
    }
    const body = pages[request.url] || "<html></html>";
    return { body, responseUrl: request.url, status: 200, headers: {}, blockedReason: "" };
  };

  const result = await executeStep({
    step: "chapterContent",
    source: {
      Source: {
        sourceUrl: "https://example.com",
        chapterContent: {
          requestInfo: "https://example.com/book/1/1.html",
          responseFormatType: "html",
          moreKeys: { maxPage: 3 },
          nextPageUrl: "//a[@id='next']/@href",
          title: "//h1/text()",
          content: "//div[@id='content']/text()"
        }
      }
    },
    sourceKey: "Source",
    mode: "live",
    engine: "http",
    queryPayload: {},
    performHttpRequest
  });

  assert.equal(result.success, true);
  assert.equal(result.requestDebug.pagination.pagesRequested, 2);
  assert.ok(
    result.fieldDiagnostics.some(
      (diagnostic) =>
        diagnostic.field === "pagination" && diagnostic.level === "warning"
    )
  );
  assert.equal(result.parseResult.item.content, "Page one\nPage two");
});
