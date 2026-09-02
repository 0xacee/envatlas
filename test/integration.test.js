import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepository, validateConfig } from "../src/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "envatlas-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, ".env.example"), "API_URL=placeholder\nSTALE_FLAG=1\nDUP=one\nDUP=two\n");
  await writeFile(path.join(root, "src", "app.js"), "process.env.API_URL; process.env.NEW_FLAG; process.env.GITHUB_SHA;\n");
  return root;
}

test("scanner reports missing, unused, and duplicate contract entries", async () => {
  const root = await fixture();
  const result = await scanRepository({ root });
  assert.deepEqual(result.findings.map(({ code, name }) => `${code}:${name}`).sort(), [
    "E001:NEW_FLAG",
    "W001:DUP",
    "W001:STALE_FLAG",
    "W002:DUP",
  ]);
  assert.equal(result.variables.some(({ name }) => name === "GITHUB_SHA"), false);
});

test("explicit policy patterns can suppress externally consumed entries", async () => {
  const root = await fixture();
  const result = await scanRepository({
    root,
    config: {
      catalogs: [".env.example"],
      include: ["src/**"],
      exclude: [],
      ignore: ["NEW_*", "GITHUB_*"],
      allowUnused: ["STALE_*", "DUP"],
    },
  });
  assert.deepEqual(result.findings.map(({ code }) => code), ["W002"]);
});

test("configuration rejects unknown fields", () => {
  assert.throws(() => validateConfig({ surprise: true }), /Unknown configuration field/);
});
