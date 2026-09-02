#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { scanRepository } from "../src/index.js";
import { toSarif } from "../src/sarif.js";

const VERSION = "0.1.0";
const HELP = `EnvAtlas ${VERSION} — map environment-variable contracts without reading values

Usage:
  envatlas check [options]
  envatlas explain <NAME> [options]
  envatlas init [--root <path>]

Options:
  --root <path>       repository root (default: current directory)
  --config <path>     config path relative to root (default: .envatlas.json)
  --format <format>   text, json, or sarif (default: text)
  --strict            treat warnings as failures
  -h, --help          show help
  -v, --version       show version
`;

function fail(message) {
  process.stderr.write(`envatlas: ${message}\n`);
  process.exitCode = 2;
}

function parseArguments(argv) {
  const options = { command: "check", root: process.cwd(), format: "text", strict: false };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    options.command = argv[0];
    index = 1;
  }

  if (options.command === "explain") {
    options.name = argv[index];
    index += 1;
    if (!options.name || !/^[A-Z_][A-Z0-9_]*$/.test(options.name)) {
      throw new Error("explain requires an uppercase variable name.");
    }
  }

  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") options.strict = true;
    else if (argument === "--root") options.root = argv[++index];
    else if (argument === "--config") options.configPath = argv[++index];
    else if (argument === "--format") options.format = argv[++index];
    else if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "-v" || argument === "--version") options.version = true;
    else throw new Error(`unknown option: ${argument}`);
  }

  if (!["check", "explain", "init"].includes(options.command)) {
    throw new Error(`unknown command: ${options.command}`);
  }
  if (!["text", "json", "sarif"].includes(options.format)) {
    throw new Error("--format must be text, json, or sarif.");
  }
  return options;
}

function location(entry) {
  return `${entry.file}:${entry.line}`;
}

function printCheck(result) {
  process.stdout.write(`EnvAtlas mapped ${result.variables.length} variables across ${result.filesScanned} files.\n`);
  for (const finding of result.findings) {
    const label = finding.severity === "error" ? "ERROR" : "WARN ";
    process.stdout.write(`\n${label} ${finding.code}  ${finding.name}\n`);
    process.stdout.write(`  ${finding.message} at ${finding.locations.map(location).join(", ")}\n`);
  }
  const errors = result.findings.filter((finding) => finding.severity === "error").length;
  const warnings = result.findings.length - errors;
  process.stdout.write(`\n${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}\n`);
}

function printExplanation(result, name) {
  const variable = result.variables.find((candidate) => candidate.name === name);
  if (!variable) {
    process.stdout.write(`${name} was not found in a scanned catalog or source file.\n`);
    return false;
  }

  process.stdout.write(`${name}\n`);
  process.stdout.write("  catalogues:\n");
  for (const entry of variable.declarations) process.stdout.write(`    - ${location(entry)}\n`);
  if (variable.declarations.length === 0) process.stdout.write("    - none\n");
  process.stdout.write("  references:\n");
  for (const entry of variable.references) process.stdout.write(`    - ${location(entry)} (${entry.syntax})\n`);
  if (variable.references.length === 0) process.stdout.write("    - none\n");
  return true;
}

async function initialize(root) {
  const target = path.resolve(root, ".envatlas.json");
  const config = {
    $schema: "https://raw.githubusercontent.com/0xacee/envatlas/main/schemas/config.schema.json",
    catalogs: [".env.example"],
    include: ["src/**", "scripts/**", "compose*.yml", "compose*.yaml", "Dockerfile*"],
    exclude: ["**/fixtures/**", "**/generated/**"],
    ignore: ["CI", "NODE_ENV", "GITHUB_*", "RUNNER_*"],
    allowUnused: [],
  };
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`Created ${target}\n`);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  try {
    if (options.command === "init") {
      await initialize(options.root);
      return;
    }

    const result = await scanRepository(options);
    if (options.format === "json" || options.format === "sarif") {
      const output = options.format === "sarif" ? toSarif(result) : result;
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else if (options.command === "explain") {
      if (!printExplanation(result, options.name)) process.exitCode = 1;
    } else {
      printCheck(result);
    }

    if (options.command === "check") {
      const errors = result.findings.some((finding) => finding.severity === "error");
      const warnings = result.findings.some((finding) => finding.severity === "warning");
      if (errors || (options.strict && warnings)) process.exitCode = 1;
    }
  } catch (error) {
    if (error?.code === "EEXIST") fail(".envatlas.json already exists; no file was changed.");
    else fail(error.message);
  }
}

await main();
