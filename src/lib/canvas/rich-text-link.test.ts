import assert from "node:assert/strict";
import test from "node:test";

import { isSafeLinkHref, normalizeLinkHref } from "./rich-text-link";

test("adds a secure protocol to ordinary web addresses", () => {
  assert.equal(normalizeLinkHref("example.com/docs"), "https://example.com/docs");
  assert.equal(normalizeLinkHref(" www.example.com "), "https://www.example.com/");
});

test("keeps supported explicit and relative destinations", () => {
  assert.equal(normalizeLinkHref("https://example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(normalizeLinkHref("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(normalizeLinkHref("tel:+15551234567"), "tel:+15551234567");
  assert.equal(normalizeLinkHref("/app/boards/123"), "/app/boards/123");
  assert.equal(normalizeLinkHref("#details"), "#details");
});

test("rejects empty, malformed, and executable destinations", () => {
  assert.equal(normalizeLinkHref(""), null);
  assert.equal(normalizeLinkHref("not a url"), null);
  assert.equal(normalizeLinkHref("javascript:alert(1)"), null);
  assert.equal(normalizeLinkHref("data:text/html,bad"), null);
  assert.equal(isSafeLinkHref("javascript:alert(1)"), false);
  assert.equal(isSafeLinkHref("https://example.com"), true);
});
