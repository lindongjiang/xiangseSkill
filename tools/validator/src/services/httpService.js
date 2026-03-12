import axios from "axios";
import { config as appConfig } from "../config.js";

function toText(value) {
  return String(value || "").toLowerCase();
}

function headerGet(headers, key) {
  if (!headers) return "";
  const direct = headers[key];
  if (direct != null) return String(direct);
  const lowerKey = String(key).toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lowerKey) return String(v);
  }
  return "";
}

function detectBlocked(status, body, headers) {
  const bodyText = toText(body);
  const cfMitigated = toText(headerGet(headers, "cf-mitigated"));

  if (status === 429) {
    return "HTTP 429 rate limited";
  }

  if (status === 403) {
    if (cfMitigated.includes("challenge")) {
      return "HTTP 403 blocked by Cloudflare challenge";
    }
    if (
      bodyText.includes("cloudflare") ||
      bodyText.includes("just a moment") ||
      bodyText.includes("attention required") ||
      bodyText.includes("cf-mitigated") ||
      bodyText.includes("challenge")
    ) {
      return "HTTP 403 blocked by anti-bot challenge";
    }
    return "HTTP 403 forbidden";
  }

  if (cfMitigated.includes("challenge")) {
    return "Blocked by challenge middleware (cf-mitigated)";
  }

  return "";
}

export async function performHttpRequest(request) {
  const headers = request?.httpHeaders || {};
  let response;

  if (request?.method === "POST") {
    const params = new URLSearchParams();
    Object.entries(request?.httpParams || {}).forEach(([key, value]) => {
      params.set(key, String(value ?? ""));
    });

    response = await axios.post(request.url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...headers
      },
      timeout: appConfig.httpTimeoutMs,
      responseType: "text",
      validateStatus: () => true
    });
  } else {
    response = await axios.get(request.url, {
      params: request?.httpParams || {},
      headers,
      timeout: appConfig.httpTimeoutMs,
      responseType: "text",
      validateStatus: () => true
    });
  }

  const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  const blockedReason = detectBlocked(response.status, body, response.headers || {});

  return {
    body,
    responseUrl: response?.request?.res?.responseUrl || request.url,
    status: response.status,
    headers: response.headers || {},
    blockedReason
  };
}
