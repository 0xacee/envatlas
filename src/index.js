import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { detectReferences, isSupportedSource, parseCatalog } from "./detectors.js";
import { matchesAny, matchesName, normalizePath } from "./patterns.js";

const DEFAULT_EXCLUDES = [
  ".git/**",
  "node_modules/**",
  "vendor/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".venv/**",
  "venv/**",
  "__pycache__/**",
  ".next/**",
];

const DEFAULT_IGNORES = [
  "CI", "HOME", "HOSTNAME", "LOGNAME", "OLDPWD", "PATH", "PWD", "SHELL",
  "TEMP", "TMP", "TMPDIR", "USER", "GITHUB_*", "RUNNER_*",
];

const DEFAULT_CONFIG = Object.freeze({
  catalogs: [],
  include: ["**"],
  exclude: [],
  ignore: DEFAULT_IGNORES,
  allowUnused: [],
});

function assertStringArray(value, key) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`Configuration field "${key}" must be an array of strings.`);
  }
}

export function validateConfig(input) {
  if (input === null || Array.isArray(input) || typeof input !== "object") {
    throw new TypeError("Configuration must be a JSON object.");
  }

  const known = new Set(["$schema", "catalogs", "include", "exclude", "ignore", "allowUnused"]);
  const unknown = Object.keys(input).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unknown configuration field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`);
  }

  for (const key of ["catalogs", "include", "exclude", "ignore", "allowUnused"]) {
    if (key in input) assertStringArray(input[key], key);
  }

  return {
    catalogs: input.catalogs ?? DEFAULT_CONFIG.catalogs,
    include: input.include ?? DEFAULT_CONFIG.include,
    exclude: input.exclude ?? DEFAULT_CONFIG.exclude,
    ignore: input.ignore ?? DEFAULT_CONFIG.ignore,
    allowUnused: input.allowUnused ?? DEFAULT_CONFIG.allowUnused,
  };
}

export async function loadConfig(root, configPath) {
  const target = path.resolve(root, configPath ?? ".envatlas.json");
  try {
    const raw = await readFile(target, "utf8");
    return { config: validateConfig(JSON.parse(raw)), path: target, explicit: true };
  } catch (error) {
    if (error?.code === "ENOENT" && configPath === undefined) {
      return { config: { ...DEFAULT_CONFIG }, path: target, explicit: false };
    }
    if (error instanceof SyntaxError) {
      throw new SyntaxError(`Invalid JSON in ${target}: ${error.message}`);
    }
    throw error;
  }
}

function isAutomaticCatalog(file) {
  const basename = path.basename(file).toLowerCase();
  return basename === ".env.example"
    || basename === ".env.sample"
    || basename.endsWith(".env.example")
    || basename.endsWith(".env.sample");
}

async function walk(root, relativeDirectory, config, explicitCatalogs, files) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relative = normalizePath(path.join(relativeDirectory, entry.name));
    const directoryProbe = entry.isDirectory() ? `${relative}/` : relative;
    if (matchesAny(directoryProbe, [...DEFAULT_EXCLUDES, ...config.exclude])) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(root, relative, config, explicitCatalogs, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const isCatalog = explicitCatalogs.has(relative) || (explicitCatalogs.size === 0 && isAutomaticCatalog(relative));
    const included = matchesAny(relative, config.include);
    if (!isCatalog && (!included || !isSupportedSource(relative))) continue;

    const fileStat = await stat(path.join(root, relative));
    if (fileStat.size > 1024 * 1024) continue;
    files.push({ relative, isCatalog });
  }
}

function groupOccurrences(occurrences) {
  const grouped = new Map();
  for (const occurrence of occurrences) {
    const current = grouped.get(occurrence.name) ?? [];
    current.push(occurrence);
    grouped.set(occurrence.name, current);
  }
  return grouped;
}

export async function scanRepository(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = options.config
    ? { config: validateConfig(options.config), explicit: true }
    : await loadConfig(root, options.configPath);
  const config = loaded.config;
  const explicitCatalogs = new Set(config.catalogs.map(normalizePath));
  const files = [];
  await walk(root, "", config, explicitCatalogs, files);

  const foundCatalogs = files.filter((file) => file.isCatalog).map((file) => file.relative);
  const missingCatalogs = [...explicitCatalogs].filter((catalog) => !foundCatalogs.includes(catalog));
  if (missingCatalogs.length > 0) {
    throw new Error(`Catalog file${missingCatalogs.length > 1 ? "s" : ""} not found: ${missingCatalogs.join(", ")}.`);
  }
  if (foundCatalogs.length === 0) {
    throw new Error("No environment catalog found. Add .env.example or run `envatlas init`.");
  }

  const declarations = [];
  const references = [];
  for (const file of files) {
    const text = await readFile(path.join(root, file.relative), "utf8");
    const detected = file.isCatalog ? parseCatalog(text) : detectReferences(file.relative, text);
    const target = file.isCatalog ? declarations : references;
    for (const occurrence of detected) target.push({ ...occurrence, file: file.relative });
  }

  const declared = groupOccurrences(declarations);
  const referenced = groupOccurrences(references);
  const names = [...new Set([...declared.keys(), ...referenced.keys()])]
    .filter((name) => !matchesName(name, config.ignore))
    .sort();
  const variables = names.map((name) => ({
    name,
    declarations: declared.get(name) ?? [],
    references: referenced.get(name) ?? [],
  }));
  const findings = [];

  for (const variable of variables) {
    if (variable.declarations.length === 0 && variable.references.length > 0) {
      findings.push({
        code: "E001",
        severity: "error",
        name: variable.name,
        message: "referenced but absent from every catalog",
        locations: variable.references,
      });
    }
    if (variable.references.length === 0
      && variable.declarations.length > 0
      && !matchesName(variable.name, config.allowUnused)) {
      findings.push({
        code: "W001",
        severity: "warning",
        name: variable.name,
        message: "catalogued but not referenced",
        locations: variable.declarations,
      });
    }

    const byFile = groupOccurrences(variable.declarations.map((entry) => ({ ...entry, name: entry.file })));
    for (const duplicates of byFile.values()) {
      if (duplicates.length < 2) continue;
      findings.push({
        code: "W002",
        severity: "warning",
        name: variable.name,
        message: `declared ${duplicates.length} times in ${duplicates[0].file}`,
        locations: duplicates,
      });
    }
  }

  findings.sort((left, right) => left.severity.localeCompare(right.severity) || left.name.localeCompare(right.name));
  return {
    schemaVersion: 1,
    root,
    catalogs: foundCatalogs,
    filesScanned: files.length,
    variables,
    findings,
  };
}
