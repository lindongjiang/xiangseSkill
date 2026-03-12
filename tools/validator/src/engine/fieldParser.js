import { isJsRule, unwrapJsRule } from "./template.js";
import { runUserJs } from "./jsSandbox.js";
import { evaluateValue } from "./xpath.js";

export async function parseFieldValue(input) {
  const { document, expression, contextNode, context } = input;
  const raw = String(expression || "").trim();
  if (!raw) {
    return "";
  }

  if (isJsRule(raw)) {
    return runUserJs(unwrapJsRule(raw), context);
  }

  const pipeIndex = raw.indexOf("||@js:");
  if (pipeIndex >= 0) {
    const xpathExpr = raw.slice(0, pipeIndex).trim();
    const jsExpr = raw.slice(pipeIndex + "||@js:".length);
    const baseValue = xpathExpr ? evaluateValue(document, xpathExpr, contextNode) : context.result;
    return runUserJs(jsExpr, { ...context, result: baseValue });
  }

  return evaluateValue(document, raw, contextNode);
}
