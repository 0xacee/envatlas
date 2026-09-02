import path from "node:path";

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/;

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function regexOccurrences(text, regex, syntax) {
  const occurrences = [];
  for (const match of text.matchAll(regex)) {
    const name = match[1];
    if (!VARIABLE_NAME.test(name)) continue;
    occurrences.push({ name, line: lineNumberAt(text, match.index), syntax });
  }
  return occurrences;
}

function uniqueOccurrences(occurrences) {
  const seen = new Set();
  return occurrences.filter((occurrence) => {
    const key = `${occurrence.name}:${occurrence.line}:${occurrence.syntax}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseCatalog(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) continue;
    entries.push({ name: match[1].toUpperCase(), line: index + 1, syntax: "dotenv" });
  }

  return entries;
}

export function detectReferences(file, text) {
  const extension = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();
  const occurrences = [];

  if ([".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx"].includes(extension)) {
    occurrences.push(...regexOccurrences(
      text,
      /\b(?:process\.env\.|import\.meta\.env\.)([A-Z_][A-Z0-9_]*)\b/g,
      "javascript",
    ));
  }

  if (extension === ".py") {
    occurrences.push(...regexOccurrences(
      text,
      /\bos\.(?:getenv\(\s*|environ(?:\.get\(\s*|\[\s*))['"]([A-Z_][A-Z0-9_]*)['"]/g,
      "python",
    ));
  }

  if ([".sh", ".bash", ".zsh"].includes(extension)) {
    occurrences.push(...regexOccurrences(
      text,
      /(?<!\$)\$\{?([A-Z_][A-Z0-9_]*)(?:(?::?[-+?=])[^}]*)?\}?/g,
      "shell",
    ));
  }

  if ([".yaml", ".yml"].includes(extension)) {
    occurrences.push(...regexOccurrences(
      text,
      /(?<!\$)\$\{([A-Z_][A-Z0-9_]*)(?:(?::?[-+?=])[^}]*)?\}/g,
      "interpolation",
    ));
  }

  if (basename === "dockerfile" || basename.startsWith("dockerfile.")) {
    occurrences.push(...regexOccurrences(text, /^\s*ARG\s+([A-Z_][A-Z0-9_]*)\b/gm, "docker-arg"));
    occurrences.push(...regexOccurrences(
      text,
      /(?<!\$)\$\{?([A-Z_][A-Z0-9_]*)(?:(?::?[-+?=])[^}]*)?\}?/g,
      "docker",
    ));
  }

  return uniqueOccurrences(occurrences);
}

export function isSupportedSource(file) {
  const extension = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();
  return [
    ".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx",
    ".py", ".sh", ".bash", ".zsh", ".yaml", ".yml",
  ].includes(extension) || basename === "dockerfile" || basename.startsWith("dockerfile.");
}
