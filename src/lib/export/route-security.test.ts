import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginExportRequest } from "./route-security";

function exportRequest(url: string, origin?: string) {
  return {
    url,
    headers: new Headers(origin ? { origin } : undefined),
  };
}

test("accepts only a matching browser origin", () => {
  assert.equal(
    isSameOriginExportRequest(exportRequest(
      "https://manojalam.example/api/export-asset",
      "https://manojalam.example"
    )),
    true
  );
  assert.equal(
    isSameOriginExportRequest(exportRequest(
      "https://manojalam.example/api/export-asset",
      "https://attacker.example"
    )),
    false
  );
  assert.equal(
    isSameOriginExportRequest(exportRequest("https://manojalam.example/api/export-asset")),
    false
  );
});

test("normalizes default ports but keeps non-default ports isolated", () => {
  assert.equal(
    isSameOriginExportRequest(exportRequest(
      "https://manojalam.example/api/export-asset",
      "https://manojalam.example:443"
    )),
    true
  );
  assert.equal(
    isSameOriginExportRequest(exportRequest(
      "http://localhost:3005/api/export-asset",
      "http://localhost:3010"
    )),
    false
  );
});
