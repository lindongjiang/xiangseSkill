import { JSDOM } from "jsdom";

function nodeToText(node) {
  if (Object.prototype.hasOwnProperty.call(node, "value") && node.value !== undefined) {
    return String(node.value || "").trim();
  }
  return String(node.textContent || "").trim();
}

export function createDom(html) {
  return new JSDOM(String(html || "")).window.document;
}

export function evaluateNodes(document, expression, contextNode) {
  const expr = String(expression || "").trim();
  if (!expr) {
    return [];
  }

  const result = document.evaluate(
    expr,
    contextNode || document,
    null,
    document.defaultView.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  const nodes = [];
  for (let i = 0; i < result.snapshotLength; i += 1) {
    const node = result.snapshotItem(i);
    if (node) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function evaluateValue(document, expression, contextNode) {
  const nodes = evaluateNodes(document, expression, contextNode);
  if (nodes.length > 0) {
    if (nodes.length === 1) {
      return nodeToText(nodes[0]);
    }
    return nodes.map(nodeToText).filter(Boolean).join(" ").trim();
  }

  const strResult = document.evaluate(
    expression,
    contextNode || document,
    null,
    document.defaultView.XPathResult.STRING_TYPE,
    null
  );

  return String(strResult.stringValue || "").trim();
}
