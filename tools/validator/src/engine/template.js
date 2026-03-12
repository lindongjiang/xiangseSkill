export function applyTemplate(raw, params) {
  return String(raw || "")
    .replaceAll("%@keyWord", String(params?.keyWord ?? ""))
    .replaceAll("%@pageIndex", String(params?.pageIndex ?? 1))
    .replaceAll("%@offset", String(params?.offset ?? 0))
    .replaceAll("%@filter", String(params?.filter ?? ""))
    .replaceAll("%@result", String(params?.result ?? ""));
}

export function isJsRule(value) {
  return String(value || "").trimStart().startsWith("@js:");
}

export function unwrapJsRule(value) {
  return String(value || "").trimStart().replace(/^@js:\s*/m, "");
}
