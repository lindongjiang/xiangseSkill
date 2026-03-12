import fs from "node:fs";
import path from "node:path";

const STEP_NAMES = ["searchBook", "bookDetail", "chapterList", "chapterContent"];

function loadFixtureMapFromJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function resolveFixtureFileFromDir(dirPath, step) {
  const candidates = [
    `${step}.html`,
    `${step}.json`,
    `${step}.txt`,
    `${step}.response`,
    `${step}.resp`
  ];
  for (const name of candidates) {
    const full = path.join(dirPath, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  return "";
}

function resolveMapEntry(map, step) {
  const entry = map?.[step];
  if (!entry) return null;
  if (typeof entry === "string") {
    if (fs.existsSync(entry) && fs.statSync(entry).isFile()) {
      return { content: fs.readFileSync(entry, "utf8"), used: entry };
    }
    return { content: entry, used: "inline" };
  }
  if (typeof entry === "object") {
    if (entry.html) return { content: String(entry.html), used: "inline" };
    if (entry.file && fs.existsSync(entry.file) && fs.statSync(entry.file).isFile()) {
      return { content: fs.readFileSync(entry.file, "utf8"), used: entry.file };
    }
  }
  return null;
}

export function normalizeFixturesInput(fixturesInput) {
  const raw = String(fixturesInput || "").trim();
  if (!raw) return { mode: "none", data: {} };

  if (raw.startsWith("{")) {
    try {
      return { mode: "map", data: JSON.parse(raw) };
    } catch {
      return { mode: "none", data: {} };
    }
  }

  if (!fs.existsSync(raw)) {
    return { mode: "none", data: {} };
  }

  const stat = fs.statSync(raw);
  if (stat.isFile()) {
    if (raw.toLowerCase().endsWith(".json")) {
      return { mode: "map", data: loadFixtureMapFromJson(raw) };
    }
    return { mode: "single", data: { __all__: raw } };
  }

  if (stat.isDirectory()) {
    const map = {};
    for (const step of STEP_NAMES) {
      const f = resolveFixtureFileFromDir(raw, step);
      if (f) map[step] = f;
    }
    return { mode: "dir", data: map };
  }

  return { mode: "none", data: {} };
}

export function getFixtureContent(step, fixturesState) {
  if (!fixturesState || fixturesState.mode === "none") return null;

  if (fixturesState.mode === "single") {
    const file = fixturesState.data.__all__;
    return { content: fs.readFileSync(file, "utf8"), used: file };
  }

  if (fixturesState.mode === "map" || fixturesState.mode === "dir") {
    const resolved = resolveMapEntry(fixturesState.data, step);
    if (resolved) return resolved;
    const filePath = fixturesState.data?.[step];
    if (typeof filePath === "string" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return { content: fs.readFileSync(filePath, "utf8"), used: filePath };
    }
  }

  return null;
}
