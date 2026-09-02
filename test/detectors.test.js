import assert from "node:assert/strict";
import test from "node:test";
import { detectReferences, parseCatalog } from "../src/detectors.js";

test("catalog parser records names and locations without values", () => {
  const secret = "should-never-appear";
  const entries = parseCatalog(`# note\nexport API_KEY=${secret}\nEMPTY=\n`);
  assert.deepEqual(entries, [
    { name: "API_KEY", line: 2, syntax: "dotenv" },
    { name: "EMPTY", line: 3, syntax: "dotenv" },
  ]);
  assert.equal(JSON.stringify(entries).includes(secret), false);
});

test("JavaScript detector ignores dynamic and lowercase lookups", () => {
  const source = "process.env.API_URL; import.meta.env.PUBLIC_NAME; process.env[key]; process.env.debug";
  assert.deepEqual(detectReferences("app.ts", source).map(({ name }) => name), ["API_URL", "PUBLIC_NAME"]);
});

test("Compose detector understands defaults and escaped interpolation", () => {
  const source = "image: app:${TAG:-latest}\ncommand: echo $${NOT_HOST}\nurl: ${API_URL?required}\n";
  assert.deepEqual(detectReferences("compose.yaml", source).map(({ name }) => name), ["TAG", "API_URL"]);
});

test("Python detector covers getenv, environ.get, and indexing", () => {
  const source = `os.getenv("FIRST")\nos.environ.get('SECOND')\nos.environ["THIRD"]\n`;
  assert.deepEqual(detectReferences("app.py", source).map(({ name }) => name), ["FIRST", "SECOND", "THIRD"]);
});
