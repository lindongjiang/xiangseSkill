export function isAbsoluteUrl(input) {
  return /^https?:\/\//i.test(String(input || ""));
}

export function resolveWithHost(host, input) {
  const cleaned = String(input || "").trim();
  if (!cleaned) {
    return "";
  }
  if (isAbsoluteUrl(cleaned)) {
    return cleaned;
  }

  const base = String(host || "").endsWith("/") ? String(host) : `${String(host || "")}/`;

  if (cleaned.startsWith("//")) {
    return `https:${cleaned}`;
  }

  return new URL(cleaned.startsWith("/") ? cleaned.slice(1) : cleaned, base).toString();
}

export function canResolveAgainstHost(host, maybeRelative) {
  try {
    resolveWithHost(host, maybeRelative);
    return true;
  } catch {
    return false;
  }
}
