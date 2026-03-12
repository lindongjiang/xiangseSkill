import { applyTemplate, isJsRule, unwrapJsRule } from "./template.js";
import { runUserJs } from "./jsSandbox.js";
import { resolveWithHost } from "../utils/url.js";

export async function buildRequest(input) {
  const { sourceConfig, actionConfig, params, result } = input;
  const host = String(actionConfig?.host || sourceConfig?.sourceUrl || "");
  const baseHeaders = {
    ...(sourceConfig?.httpHeaders || {}),
    ...(actionConfig?.httpHeaders || {})
  };

  const requestInfo = actionConfig?.requestInfo;
  if (!requestInfo) {
    throw new Error("requestInfo is required");
  }

  const runtimeConfig = {
    ...sourceConfig,
    ...actionConfig,
    host,
    httpHeaders: baseHeaders
  };

  if (typeof requestInfo === "string") {
    if (isJsRule(requestInfo)) {
      const jsResult = await runUserJs(unwrapJsRule(requestInfo), {
        config: runtimeConfig,
        params,
        result
      });

      if (typeof jsResult === "string") {
        return {
          url: resolveWithHost(host, jsResult),
          method: "GET",
          httpHeaders: baseHeaders
        };
      }

      const jsUrl = String(jsResult?.url || "").trim();
      return {
        url: resolveWithHost(host, jsUrl),
        method: jsResult?.POST ? "POST" : "GET",
        httpParams: jsResult?.httpParams || {},
        httpHeaders: {
          ...baseHeaders,
          ...(jsResult?.httpHeaders || {})
        }
      };
    }

    const templated = applyTemplate(requestInfo, {
      keyWord: params?.keyWord,
      pageIndex: params?.pageIndex,
      offset: params?.offset,
      filter: params?.filter,
      result: typeof result === "string" ? result : ""
    });

    return {
      url: resolveWithHost(host, templated),
      method: "GET",
      httpHeaders: baseHeaders
    };
  }

  if (typeof requestInfo === "object") {
    return {
      url: resolveWithHost(host, String(requestInfo?.url || "")),
      method: requestInfo?.POST ? "POST" : "GET",
      httpParams: requestInfo?.httpParams || {},
      httpHeaders: {
        ...baseHeaders,
        ...(requestInfo?.httpHeaders || {})
      }
    };
  }

  throw new Error("Unsupported requestInfo type");
}
