import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML, DOMParser, Node, Element, HTMLElement } from "linkedom";
import { newSampleLabel, normalizeSampleTemplates, sampleCardData, sampleFields, refreshSampleFields, sampleEntryHtml } from "./sample-templates";
import type { SampleCardTemplate, SampleCardEntry } from "../types";
const { document } = parseHTML("<html><body></body></html>");
class BrowserParser {
  parseFromString(value: string, type: string) { return new DOMParser().parseFromString(`<html><body>${value}</body></html>`, type as "text/html"); }
}
Object.assign(globalThis, { document, DOMParser: BrowserParser, Node, Element, HTMLElement });
const label = newSampleLabel("own-label", "My custom label");
const template: SampleCardTemplate = { id: "sample", name: "Any chart", labels: [label], width: 800, height: 300, style: {}, richText: '<p>Fixed heading</p><p style="padding-left:2em"><span data-sample-field="first" data-sample-label="own-label">Sample A</span> - <span data-sample-field="second" data-sample-label="own-label">Sample B</span></p>' };
test("new cards clear tagged samples, keep fixed layout and never print field labels", () => {
  const empty = sampleCardData(template, [{ id: "one", values: {} }]);
  assert.match(empty.richText, /Fixed heading/);
  assert.doesNotMatch(empty.text, /Sample A|Sample B|My custom label/);
  assert.match(empty.richText, /padding-left/);
  assert.match(template.richText, /Sample A/);
});
test("same-label occurrences and repeated sections retain independent values after redesign", () => {
  const entries: SampleCardEntry[] = [{ id: "one", values: { first: { text: "Answer A" }, second: { text: "Answer B" } } }, { id: "two", values: { first: { text: "Answer C" } } }];
  const redesigned = { ...template, labels: [{ ...label, color: "#ff0000" }], richText: template.richText + '<p><span data-sample-field="new" data-sample-label="own-label">New sample</span></p>' };
  const output = sampleCardData(redesigned, entries);
  assert.match(output.text, /Answer A/); assert.match(output.text, /Answer B/); assert.match(output.text, /Answer C/);
  assert.doesNotMatch(output.text, /New sample|My custom label/);
  assert.equal(output.sampleEntries[0].values.first.text, "Answer A");
  assert.equal(sampleFields(output.richText).length, 6);
});
test("copied fields receive independent IDs and untagged deleted labels retain fixed text", () => {
  const html = refreshSampleFields(template.richText + template.richText, [label]);
  assert.equal(new Set(sampleFields(html).map(field => field.id)).size, 4);
  assert.equal(sampleFields(refreshSampleFields(html, [])).length, 0);
});
test("rendering escapes values, validates links, and normalization bounds styles", () => {
  const output = sampleEntryHtml(template, { id: "one", values: { first: { text: "<script>alert(1)</script>", href: "javascript:alert(1)" } } }, 0);
  assert.doesNotMatch(output, /<script>|href="javascript:/);
  const clean = normalizeSampleTemplates([{ ...template, labels: [{ ...label, fontSize: 999, color: "invalid" }] }])[0];
  assert.equal(clean.labels[0].fontSize, 120); assert.equal(clean.labels[0].color, "#2563eb");
});
