import { parseFieldValue } from "./fieldParser.js";
import { createDom, evaluateNodes } from "./xpath.js";
import { buildRequest } from "./requestBuilder.js";
import { performHttpRequest } from "../services/httpService.js";
import { performWebViewRequest } from "../services/webviewService.js";
import { getFixtureContent } from "../services/fixtureService.js";
import { runUserJs } from "./jsSandbox.js";
import { splitJsPipe } from "./template.js";
import { resolveWithHost } from "../utils/url.js";

const RESERVED_KEYS = new Set([
  "actionID",
  "parserID",
  "responseFormatType",
  "validConfig",
  "requestInfo",
  "host",
  "httpHeaders",
  "list",
  "moreKeys",
  "JSParser",
  "requestJavascript",
  "responseJavascript",
  "requestFunction",
  "responseFunction",
  "requestParamsEncode",
  "responseEncode",
  "nextPageUrl",
  "webView",
  "webViewJs",
  "webViewJsDelay",
  "webViewSkipUrls",
  "webViewSkipUrlsUnless",
  "webViewContentRules",
  "webViewSniff",
  "webViewForbidUrls"
]);

const WEBVIEW_KEYS = [
  "webView",
  "webViewJs",
  "webViewJsDelay",
  "webViewSkipUrls",
  "webViewSkipUrlsUnless",
  "webViewContentRules",
  "webViewSniff",
  "webViewForbidUrls"
];

function jsonPathGet(obj, pathExpr) {
  const clean = String(pathExpr || "").trim();
  if (!clean) {
    return obj;
  }

  const normalized = clean.replace(/^\$\.?/, "");
  const segments = normalized.includes("/")
    ? normalized.split("/").filter(Boolean)
    : normalized.split(".").filter(Boolean);

  let current = obj;
  for (const key of segments) {
    if (current == null) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

async function parseJsonField(expression, item, context) {
  const raw = String(expression || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("@js:")) {
    return runUserJs(raw.replace(/^@js:\s*/, ""), { ...context, result: item });
  }

  const pipe = splitJsPipe(raw);
  if (pipe) {
    const base = jsonPathGet(item, pipe.baseExpression);
    return runUserJs(pipe.jsCode, { ...context, result: base });
  }

  return jsonPathGet(item, raw);
}

function actionFields(actionConfig) {
  return Object.keys(actionConfig).filter((key) => !RESERVED_KEYS.has(key));
}

function hasNonEmpty(value) {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function hasWebViewSignal(action, request) {
  return WEBVIEW_KEYS.some((k) => hasNonEmpty(action?.[k]) || hasNonEmpty(request?.[k]));
}

function resolveRuntimeEngine(input, action, request) {
  const preferred = String(input?.engine || "auto").toLowerCase();
  if (preferred === "http" || preferred === "webview") {
    return preferred;
  }
  return hasWebViewSignal(action, request) ? "webview" : "http";
}

function collectWebViewAppliedKeys(action, request) {
  return WEBVIEW_KEYS.filter((k) => hasNonEmpty(action?.[k]) || hasNonEmpty(request?.[k]));
}

function canonicalFixtureUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function unsupportedDiagnostic(step, capability) {
  return {
    step,
    field: "unsupported",
    level: "error",
    message: `Unsupported Xiangse capability: ${capability}`
  };
}

function collectUnsupportedDiagnostics(step, action, request) {
  const capabilities = [];
  const parserID = String(action?.parserID || "DOM").trim().toUpperCase();
  const responseType = String(request?.responseFormatType || action?.responseFormatType || "html")
    .trim()
    .toLowerCase();

  if (parserID !== "DOM") {
    capabilities.push(`parserID=${parserID || "empty"}`);
  }
  if (!["html", "json"].includes(responseType)) {
    capabilities.push(`responseFormatType=${responseType || "empty"}`);
  }
  if (hasNonEmpty(action?.webViewSniff) || hasNonEmpty(request?.webViewSniff)) {
    capabilities.push("webViewSniff");
  }
  if (hasNonEmpty(action?.webViewContentRules) || hasNonEmpty(request?.webViewContentRules)) {
    capabilities.push("webViewContentRules");
  }

  const requestParamsEncode = String(request?.requestParamsEncode || "").trim();
  if (
    requestParamsEncode &&
    requestParamsEncode !== "2147485234" &&
    requestParamsEncode.toLowerCase() !== "gbk"
  ) {
    capabilities.push(`requestParamsEncode=${requestParamsEncode}`);
  } else if (requestParamsEncode && String(request?.method || "").toUpperCase() === "POST") {
    capabilities.push("requestParamsEncode=gbk(POST)");
  }

  for (const key of [
    "JSParser",
    "requestJavascript",
    "responseJavascript",
    "requestFunction",
    "responseFunction"
  ]) {
    if (hasNonEmpty(action?.[key])) {
      capabilities.push(key);
    }
  }

  return [...new Set(capabilities)].map((capability) => unsupportedDiagnostic(step, capability));
}

function computeMaxPages(action) {
  const explicit = Number(action?.moreKeys?.maxPage || 0);
  if (Number.isFinite(explicit) && explicit >= 1) return explicit;
  return 10;
}

function resolveNextPageUrl(value) {
  const text = String(value || "").trim();
  if (!text || text === "null" || text === "undefined") return "";
  return text;
}

async function fetchStepPage(request, input) {
  const result = {
    body: "",
    responseUrl: request.url,
    status: 200,
    blockedReason: "",
    trace: [],
    runtimeEngine: input.engine || "http",
    fixtureUsed: undefined,
    fixtureExpectedUrl: "",
    fixtureUrlVerified: false
  };

  if (input.mode === "fixture") {
    const fixture = getFixtureContent(input.step, input.fixturesState);
    if (!fixture) {
      result.body = "";
      result.status = 404;
      result.fixtureMissing = true;
      return result;
    }
    result.body = fixture.content;
    result.fixtureUsed = fixture.used;
    result.fixtureExpectedUrl = String(fixture.expectedUrl || "").trim();
    result.runtimeEngine = input.runtimeEngine || result.runtimeEngine;
    if (result.runtimeEngine === "webview") {
      result.trace.push({
        type: "fixture_replay",
        message: "fixture mode replay, webview runtime skipped"
      });
    }
    if (result.fixtureExpectedUrl) {
      const expectedUrl = canonicalFixtureUrl(result.fixtureExpectedUrl);
      const actualUrl = canonicalFixtureUrl(request.url);
      result.fixtureUrlVerified = Boolean(expectedUrl && actualUrl && expectedUrl === actualUrl);
    }
    return result;
  }

  if (input.runtimeEngine === "webview") {
    const webviewRequest = input.performWebViewRequest || performWebViewRequest;
    const webviewResult = await webviewRequest(request, {
      webViewTimeoutMs: input.webViewTimeoutMs
    });
    result.body = webviewResult.body;
    result.responseUrl = webviewResult.responseUrl;
    result.status = webviewResult.status;
    result.blockedReason = webviewResult.blockedReason || "";
    result.trace = webviewResult.trace || [];
    result.runtimeEngine = webviewResult.runtimeEngine || input.runtimeEngine;
    return result;
  }

  const httpRequest = input.performHttpRequest || performHttpRequest;
  const httpResult = await httpRequest(request);
  result.body = httpResult.body;
  result.responseUrl = httpResult.responseUrl;
  result.status = httpResult.status;
  result.blockedReason = httpResult.blockedReason || "";
  result.runtimeEngine = "http";
  return result;
}

async function parseResponsePage({ body, responseUrl, responseType, action, sourceEntry, queryPayload, parseLimit }) {
  const normalizedType = String(responseType || action.responseFormatType || "html").toLowerCase();
  const fields = actionFields(action);
  const baseContext = {
    config: { ...sourceEntry, ...action },
    params: {
      ...queryPayload,
      responseUrl
    },
    result: null
  };

  const nextPageExpr = String(action?.nextPageUrl || "").trim();

  if (normalizedType === "json") {
    let jsonObj = null;
    let parseError = "";
    try {
      jsonObj = JSON.parse(body || "{}");
    } catch (err) {
      parseError = err?.message || "unknown";
      jsonObj = {};
    }

    const listPath = String(action.list || "").trim();
    const list = [];
    let item = {};
    let listLengthOnlyDebug = 0;

    if (listPath) {
      const rawList = jsonPathGet(jsonObj, listPath);
      const arr = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
      listLengthOnlyDebug = arr.length;
      for (const rawItem of arr.slice(0, parseLimit)) {
        const parsed = {};
        for (const field of fields) {
          parsed[field] = await parseJsonField(String(action[field] || ""), rawItem, {
            ...baseContext,
            result: rawItem
          });
        }
        list.push(parsed);
      }
    } else {
      for (const field of fields) {
        item[field] = await parseJsonField(String(action[field] || ""), jsonObj, {
          ...baseContext,
          result: jsonObj
        });
      }
    }

    let nextPageUrl = "";
    if (nextPageExpr) {
      nextPageUrl = resolveNextPageUrl(
        await parseJsonField(nextPageExpr, jsonObj, { ...baseContext, result: jsonObj })
      );
    }

    return { list, item, listLengthOnlyDebug, nextPageUrl, parseError };
  }

  const document = createDom(body || "");
  const listExpr = String(action.list || "").trim();
  const list = [];
  let item = {};
  let listLengthOnlyDebug = 0;

  if (listExpr) {
    const nodes = evaluateNodes(document, listExpr, document);
    listLengthOnlyDebug = nodes.length;
    for (const node of nodes.slice(0, parseLimit)) {
      const parsed = {};
      for (const field of fields) {
        parsed[field] = await parseFieldValue({
          document,
          expression: String(action[field] || ""),
          contextNode: node,
          context: { ...baseContext, result: null }
        });
      }
      list.push(parsed);
    }
  } else {
    for (const field of fields) {
      item[field] = await parseFieldValue({
        document,
        expression: String(action[field] || ""),
        contextNode: document,
        context: { ...baseContext, result: null }
      });
    }
  }

  let nextPageUrl = "";
  if (nextPageExpr) {
    nextPageUrl = resolveNextPageUrl(
      await parseFieldValue({
        document,
        expression: nextPageExpr,
        contextNode: document,
        context: { ...baseContext, result: null }
      })
    );
  }

  return { list, item, listLengthOnlyDebug, nextPageUrl };
}

function mergePagedResults(accumulator, page) {
  accumulator.pages.push({
    page: page.page,
    url: page.url,
    status: page.status,
    listLength: page.parsed.listLengthOnlyDebug
  });

  if (page.parsed.list.length > 0) {
    accumulator.list.push(...page.parsed.list);
    accumulator.hasList = true;
    accumulator.listLengthOnlyDebug += page.parsed.listLengthOnlyDebug;
  } else if (Object.keys(page.parsed.item).length > 0) {
    accumulator.item = accumulator.item || {};
    for (const [key, value] of Object.entries(page.parsed.item)) {
      if (key === "content") {
        const existing = String(accumulator.item.content || "");
        const incoming = String(value || "");
        if (incoming && !existing.includes(incoming)) {
          accumulator.item.content = existing ? `${existing}\n${incoming}` : incoming;
        }
      } else if (accumulator.item[key] === undefined || !String(accumulator.item[key] || "").trim()) {
        accumulator.item[key] = value;
      }
    }
    accumulator.hasItem = true;
  }
}

export async function executeStep(input) {
  const startedAt = Date.now();
  const sourceEntry = input.source[input.sourceKey];
  if (!sourceEntry) {
    throw new Error(`sourceKey not found: ${input.sourceKey}`);
  }

  const action = sourceEntry[input.step];
  if (!action) {
    throw new Error(`Missing action: ${input.step}`);
  }

  const issues = [];
  const parseLimit = Math.max(1, Number(input.queryPayload?._parseLimit || 10));
  const request = await buildRequest({
    sourceConfig: sourceEntry,
    actionConfig: action,
    params: input.queryPayload,
    result: input.queryPayload?.result
  });
  issues.push(...collectUnsupportedDiagnostics(input.step, action, request));

  const runtimeEngine = resolveRuntimeEngine(input, action, request);
  input.runtimeEngine = runtimeEngine;
  const webviewAppliedKeys = collectWebViewAppliedKeys(action, request);
  const effectiveResponseType = String(request?.responseFormatType || action.responseFormatType || "");

  const firstPage = await fetchStepPage(request, input);
  let body = firstPage.body;
  let responseUrl = firstPage.responseUrl;
  let status = firstPage.status;
  let blockedReason = firstPage.blockedReason || "";
  let webviewTrace = firstPage.trace || [];
  let fixtureUsed = firstPage.fixtureUsed;
  let fixtureExpectedUrl = firstPage.fixtureExpectedUrl;
  let fixtureUrlVerified = firstPage.fixtureUrlVerified;
  if (firstPage.runtimeEngine) {
    input.runtimeEngine = firstPage.runtimeEngine;
  }
  const actualRuntimeEngine = input.runtimeEngine;

  if (input.mode === "fixture" && firstPage.fixtureMissing) {
    issues.push({
      step: input.step,
      field: "fixture",
      level: "error",
      message: "Fixture mode enabled but no fixture found"
    });
    status = 404;
  } else if (input.mode === "fixture" && fixtureExpectedUrl && !fixtureUrlVerified) {
    issues.push({
      step: input.step,
      field: "fixture_url",
      level: "error",
      message: `Fixture manifest URL does not match request URL: expected ${fixtureExpectedUrl}, actual ${request.url}`
    });
  } else if (input.mode === "fixture" && !fixtureExpectedUrl) {
    issues.push({
      step: input.step,
      field: "fixture_url",
      level: "warning",
      message: "url_unverified: fixture has no manifest URL metadata"
    });
  }

  if (actualRuntimeEngine === "webview:fallback") {
    blockedReason =
      blockedReason ||
      "WebView runtime unavailable; HTTP + JSDOM fallback is incomplete evidence";
    issues.push({
      step: input.step,
      field: "webview",
      level: "error",
      message: "WebView fallback cannot satisfy live validation"
    });
  }

  if (input.mode !== "fixture" && status >= 400) {
    issues.push({
      step: input.step,
      field: "http",
      level: "error",
      message: `HTTP status ${status}`
    });
  }
  if (blockedReason) {
    issues.push({
      step: input.step,
      field: "blocked",
      level: "error",
      message: blockedReason
    });
  }

  const firstParsed = await parseResponsePage({
    body,
    responseUrl,
    responseType: effectiveResponseType,
    action,
    sourceEntry,
    queryPayload: input.queryPayload,
    parseLimit
  });
  if (firstParsed.parseError) {
    issues.push({
      step: input.step,
      field: "response",
      level: "error",
      message: `Invalid JSON response: ${firstParsed.parseError}`
    });
  }

  const accumulator = {
    pages: [],
    list: [],
    item: {},
    hasList: false,
    hasItem: false,
    listLengthOnlyDebug: 0
  };
  mergePagedResults(accumulator, {
    page: 1,
    url: responseUrl,
    status,
    parsed: firstParsed
  });

  const pagination = {
    enabled: Boolean(String(action?.nextPageUrl || "").trim()),
    pagesRequested: 1,
    maxPages: computeMaxPages(action),
    fixtureLimited: false,
    skippedForWebview: false,
    lastNextPageUrl: firstParsed.nextPageUrl,
    pages: accumulator.pages
  };

  const nextPageExpr = String(action?.nextPageUrl || "").trim();
  if (nextPageExpr && pagination.lastNextPageUrl) {
    if (input.mode === "fixture") {
      pagination.fixtureLimited = true;
    } else if (actualRuntimeEngine === "webview") {
      pagination.skippedForWebview = true;
      issues.push({
        step: input.step,
        field: "pagination",
        level: "warning",
        message: "pagination skipped for webview runtime; first page only"
      });
    } else {
      let nextUrl = pagination.lastNextPageUrl;
      let page = 2;
      while (nextUrl && page <= pagination.maxPages) {
        const baseUrl = String(responseUrl || request.url || "");
        const absUrl = resolveWithHost(baseUrl, nextUrl);
        const pageResult = await fetchStepPage(
          { ...request, url: absUrl, method: "GET" },
          { ...input, runtimeEngine: "http" }
        );
        if (pageResult.status >= 400 || pageResult.blockedReason) {
          issues.push({
            step: input.step,
            field: "pagination",
            level: "warning",
            message: `pagination page ${page} ${pageResult.blockedReason || `HTTP ${pageResult.status}`}`,
            suggestion: "First page passed; subsequent page failed"
          });
          break;
        }
        const parsedPage = await parseResponsePage({
          body: pageResult.body,
          responseUrl: pageResult.responseUrl || absUrl,
          responseType: effectiveResponseType,
          action,
          sourceEntry,
          queryPayload: input.queryPayload,
          parseLimit
        });
        mergePagedResults(accumulator, {
          page,
          url: pageResult.responseUrl || absUrl,
          status: pageResult.status,
          parsed: parsedPage
        });
        pagination.pagesRequested += 1;
        pagination.lastNextPageUrl = parsedPage.nextPageUrl;
        nextUrl = parsedPage.nextPageUrl;
        page += 1;
      }
    }
  }

  const list = accumulator.hasList ? accumulator.list : [];
  const item = accumulator.hasItem ? accumulator.item : {};
  const listLengthOnlyDebug = accumulator.hasList
    ? accumulator.listLengthOnlyDebug
    : firstParsed.listLengthOnlyDebug;

  const elapsedMs = Date.now() - startedAt;
  return {
    step: input.step,
    success: !issues.some((issue) => issue.level === "error"),
    blocked: Boolean(blockedReason),
    blockedReason,
    requestDebug: {
      request,
      responseUrl,
      mode: input.mode,
      runtimeEngine: actualRuntimeEngine,
      fixtureUsed,
      fixtureExpectedUrl,
      fixtureUrlVerified,
      status,
      blocked: Boolean(blockedReason),
      blockedReason,
      webviewTrace,
      webviewAppliedKeys,
      pagination
    },
    parseResult: {
      listLengthOnlyDebug,
      list,
      item
    },
    fieldDiagnostics: issues,
    elapsedMs
  };
}
