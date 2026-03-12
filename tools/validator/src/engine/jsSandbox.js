import { getQuickJS } from "quickjs-emscripten";
import { config as appConfig } from "../config.js";

let quickJsPromise = null;

async function getQuickJsModule() {
  if (!quickJsPromise) {
    quickJsPromise = getQuickJS();
  }
  return quickJsPromise;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

export async function runUserJs(code, context) {
  const QuickJS = await getQuickJsModule();
  const vm = QuickJS.newContext();
  const deadline = Date.now() + appConfig.jsTimeoutMs;

  vm.runtime.setInterruptHandler(() => Date.now() > deadline);

  const wrapped = `
const config = ${safeJson(context?.config)};
const params = ${safeJson(context?.params)};
const result = ${safeJson(context?.result)};
const __user_fn = function() {
${String(code || "")}
};
__user_fn();
`;

  try {
    const evalResult = vm.evalCode(wrapped);
    if (evalResult.error) {
      const errText = vm.dump(evalResult.error);
      evalResult.error.dispose();
      throw new Error(typeof errText === "string" ? errText : JSON.stringify(errText));
    }

    const output = vm.dump(evalResult.value);
    evalResult.value.dispose();
    return output;
  } finally {
    vm.dispose();
  }
}
