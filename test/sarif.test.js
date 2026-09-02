import assert from "node:assert/strict";
import test from "node:test";
import { toSarif } from "../src/sarif.js";

test("SARIF output preserves rule severity and source location", () => {
  const output = toSarif({
    findings: [{
      code: "E001",
      severity: "error",
      name: "MISSING",
      message: "referenced but absent from every catalog",
      locations: [{ file: "src\\app.js", line: 7 }],
    }],
  });
  assert.equal(output.version, "2.1.0");
  assert.equal(output.runs[0].results[0].level, "error");
  assert.equal(output.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "src/app.js");
  assert.equal(output.runs[0].results[0].locations[0].physicalLocation.region.startLine, 7);
});
