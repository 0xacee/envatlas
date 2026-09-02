import path from "node:path";

export function normalizePath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

export function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      index += 1;
      if (normalized[index + 1] === "/") {
        index += 1;
        source += "(?:.*/)?";
      } else {
        source += ".*";
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += char.replace(/[\\^$+?.()|{}\[\]]/g, "\\$&");
  }

  return new RegExp(`${source}$`);
}

export function matchesAny(value, patterns) {
  const normalized = normalizePath(value);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export function matchesName(name, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}
