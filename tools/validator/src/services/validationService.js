import { executeStep } from "../engine/stepExecutor.js";
import { canResolveAgainstHost } from "../utils/url.js";

function defaultConfig(input = {}) {
  return {
    keyword: input.keyword || "都市",
    pageIndex: Number(input.pageIndex || 1),
    offset: Number(input.offset || 0),
    bookPickIndex: Number(input.bookPickIndex || 0),
    chapterPickIndex: Number(input.chapterPickIndex || 0),
    mode: input.mode || "live",
    fixturesState: input.fixturesState || { mode: "none", data: {} },
    minContentLength: Number(input.minContentLength || 50)
  };
}

function makeStepFailure(step, message, mode) {
  return {
    step,
    success: false,
    blocked: false,
    blockedReason: "",
    requestDebug: {
      request: {},
      mode
    },
    parseResult: {
      listLengthOnlyDebug: 0,
      list: [],
      item: {}
    },
    fieldDiagnostics: [
      {
        step,
        field: "runtime",
        level: "error",
        message
      }
    ],
    elapsedMs: 0
  };
}

function pushError(result, field, message, suggestion) {
  result.fieldDiagnostics.push({
    step: result.step,
    field,
    level: "error",
    message,
    suggestion
  });
}

function pushWarning(result, field, message, suggestion) {
  result.fieldDiagnostics.push({
    step: result.step,
    field,
    level: "warning",
    message,
    suggestion
  });
}

function finalizeSuccess(result) {
  result.success = !result.fieldDiagnostics.some((d) => d.level === "error");
}

function firstNonEmpty(item, keys) {
  for (const key of keys) {
    const text = String(item?.[key] || "").trim();
    if (text) return text;
  }
  return "";
}

function applySearchCriteria(result) {
  const list = result.parseResult.list || [];
  if ((result.parseResult.listLengthOnlyDebug || 0) < 1) {
    pushError(result, "list", "searchBook listLengthOnlyDebug must be >= 1");
    finalizeSuccess(result);
    return;
  }

  const first = list[0] || {};
  if (!String(first.bookName || first.title || "").trim()) {
    pushError(result, "bookName", "searchBook first item missing bookName/title");
  }
  if (!String(first.detailUrl || first.url || "").trim()) {
    pushError(result, "detailUrl", "searchBook first item missing detailUrl/url");
  }

  const optional = ["author", "status", "lastChapterTitle", "cat", "desc", "cover"];
  optional.forEach((key) => {
    if (!String(first[key] || "").trim()) {
      pushWarning(result, key, `searchBook optional field missing: ${key}`);
    }
  });

  finalizeSuccess(result);
}

function applyBookDetailCriteria(result) {
  if (result.blocked) {
    finalizeSuccess(result);
    return;
  }

  const item = result.parseResult.item || {};
  const titleText = firstNonEmpty(item, ["title", "bookName", "name"]);
  if (!titleText) {
    pushError(result, "title", "bookDetail missing title/bookName/name");
  }

  const optional = ["author", "desc", "cat", "status", "cover", "lastChapterTitle"];
  optional.forEach((key) => {
    if (!String(item[key] || "").trim()) {
      pushWarning(result, key, `bookDetail optional field missing: ${key}`);
    }
  });

  finalizeSuccess(result);
}

function applyChapterListCriteria(result, sourceUrl) {
  if (result.blocked) {
    finalizeSuccess(result);
    return;
  }

  const list = result.parseResult.list || [];
  if ((result.parseResult.listLengthOnlyDebug || 0) < 1) {
    pushError(result, "list", "chapterList listLengthOnlyDebug must be >= 1");
    finalizeSuccess(result);
    return;
  }

  const first = list[0] || {};
  if (!String(first.title || "").trim()) {
    pushError(result, "title", "chapterList first item missing title");
  }

  const url = String(first.url || first.detailUrl || "").trim();
  if (!url) {
    pushError(result, "url", "chapterList first item missing url/detailUrl");
  } else if (!canResolveAgainstHost(sourceUrl, url)) {
    pushError(result, "url", "chapterList url cannot be resolved against source host", sourceUrl);
  }

  finalizeSuccess(result);
}

function stripWhitespace(input) {
  return String(input || "").replace(/\s+/g, "").trim();
}

function applyChapterContentCriteria(result, minLength) {
  if (result.blocked) {
    finalizeSuccess(result);
    return;
  }

  const item = result.parseResult.item || {};
  const contentRaw = String(item.content || "");
  const content = stripWhitespace(contentRaw);

  if (!content || content.length < minLength) {
    pushError(result, "content", `chapterContent content length should be >= ${minLength}, current=${content.length}`);
  }

  if (!String(item.title || "").trim()) {
    pushWarning(result, "title", "chapterContent title is recommended");
  }

  finalizeSuccess(result);
}

function collectVerdict(report) {
  const allIssues = [
    ...report.steps.searchBook.fieldDiagnostics,
    ...report.steps.bookDetail.fieldDiagnostics,
    ...report.steps.chapterList.fieldDiagnostics,
    ...report.steps.chapterContent.fieldDiagnostics
  ];

  const blockedReasons = [
    report.steps.searchBook.blockedReason,
    report.steps.bookDetail.blockedReason,
    report.steps.chapterList.blockedReason,
    report.steps.chapterContent.blockedReason
  ].filter(Boolean);

  const failReasons = allIssues.filter((i) => i.level === "error").map((i) => `[${i.step}.${i.field}] ${i.message}`);
  const warnings = allIssues.filter((i) => i.level === "warning").map((i) => `[${i.step}.${i.field}] ${i.message}`);
  const pass = failReasons.length === 0;

  let status = "pass";
  if (blockedReasons.length > 0) {
    status = "blocked";
  } else if (!pass) {
    status = "fail";
  }

  return { pass, status, failReasons, warnings, blockedReasons };
}

function pickBookFromSearch(searchStep, bookPickIndex) {
  const list = searchStep.parseResult.list || [];
  return list[bookPickIndex] || list[0] || {};
}

function pickChapterFromList(chapterListStep, chapterPickIndex) {
  const list = chapterListStep.parseResult.list || [];
  return list[chapterPickIndex] || list[0] || {};
}

function pickDetailSeed(book) {
  return String(book.detailUrl || book.url || "").trim();
}

function pickChapterListSeed(detailStep, book) {
  const detailItem = detailStep.parseResult.item || {};
  return String(
    detailItem.chapterListUrl || detailItem.url || detailStep.requestDebug.responseUrl || book.detailUrl || book.url || ""
  ).trim();
}

function pickContentSeed(chapter) {
  return String(chapter.url || chapter.detailUrl || "").trim();
}

export async function runFullValidation(input) {
  const cfg = defaultConfig(input.testConfig);
  const sourceEntry = input.source[input.sourceKey] || {};
  const sourceUrl = String(sourceEntry.sourceUrl || "");

  let searchStep;
  try {
    searchStep = await executeStep({
      step: "searchBook",
      source: input.source,
      sourceKey: input.sourceKey,
      mode: cfg.mode,
      queryPayload: {
        keyWord: cfg.keyword,
        pageIndex: cfg.pageIndex,
        offset: cfg.offset,
        _parseLimit: Math.max(cfg.bookPickIndex + 2, 6)
      },
      fixturesState: cfg.fixturesState
    });
  } catch (error) {
    searchStep = makeStepFailure("searchBook", error?.message || "Unknown searchBook error", cfg.mode);
  }
  applySearchCriteria(searchStep);

  const book = pickBookFromSearch(searchStep, cfg.bookPickIndex);

  let bookDetailStep;
  try {
    bookDetailStep = await executeStep({
      step: "bookDetail",
      source: input.source,
      sourceKey: input.sourceKey,
      mode: cfg.mode,
      queryPayload: {
        queryInfo: book,
        result: pickDetailSeed(book)
      },
      fixturesState: cfg.fixturesState
    });
  } catch (error) {
    bookDetailStep = makeStepFailure("bookDetail", error?.message || "Unknown bookDetail error", cfg.mode);
  }
  applyBookDetailCriteria(bookDetailStep);

  let chapterListStep;
  try {
    chapterListStep = await executeStep({
      step: "chapterList",
      source: input.source,
      sourceKey: input.sourceKey,
      mode: cfg.mode,
      queryPayload: {
        queryInfo: book,
        result: pickChapterListSeed(bookDetailStep, book),
        _parseLimit: Math.max(cfg.chapterPickIndex + 2, 10)
      },
      fixturesState: cfg.fixturesState
    });
  } catch (error) {
    chapterListStep = makeStepFailure("chapterList", error?.message || "Unknown chapterList error", cfg.mode);
  }
  applyChapterListCriteria(chapterListStep, sourceUrl);

  const chapter = pickChapterFromList(chapterListStep, cfg.chapterPickIndex);

  let chapterContentStep;
  try {
    chapterContentStep = await executeStep({
      step: "chapterContent",
      source: input.source,
      sourceKey: input.sourceKey,
      mode: cfg.mode,
      queryPayload: {
        queryInfo: chapter,
        result: pickContentSeed(chapter)
      },
      fixturesState: cfg.fixturesState
    });
  } catch (error) {
    chapterContentStep = makeStepFailure("chapterContent", error?.message || "Unknown chapterContent error", cfg.mode);
  }
  applyChapterContentCriteria(chapterContentStep, cfg.minContentLength || 50);

  const report = {
    success:
      searchStep.success &&
      bookDetailStep.success &&
      chapterListStep.success &&
      chapterContentStep.success,
    sourceKey: input.sourceKey,
    meta: {
      sourceName: String(sourceEntry.sourceName || input.sourceKey),
      sourceUrl: String(sourceEntry.sourceUrl || ""),
      sourceType: String(sourceEntry.sourceType || "text")
    },
    steps: {
      searchBook: searchStep,
      bookDetail: bookDetailStep,
      chapterList: chapterListStep,
      chapterContent: chapterContentStep
    },
    verdict: {
      pass: false,
      status: "fail",
      failReasons: [],
      warnings: [],
      blockedReasons: []
    },
    createdAt: new Date().toISOString()
  };

  report.verdict = collectVerdict(report);
  report.success = report.verdict.pass && report.verdict.status === "pass";

  return { report };
}
