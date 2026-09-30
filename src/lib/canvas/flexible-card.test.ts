import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML, DOMParser, Node, Element, HTMLElement } from "linkedom";
import { flexibleCardContent } from "./flexible-card";
import { newHomeworkTemplate, cardTemplateNodeData } from "./card-templates";
import { newSampleLabel, sampleCardData } from "./sample-templates";
import { sanitizePastedHtml } from "./rich-text-paste";
const { document } = parseHTML("<html><body></body></html>");
class BrowserParser { parseFromString(value: string, type: string) { return new DOMParser().parseFromString(`<html><body>${value}</body></html>`, type as "text/html"); } }
Object.assign(globalThis, { document, DOMParser: BrowserParser, Node, Element, HTMLElement });
test("template style changes preserve local paragraphs and labels", () => {
  const template = newHomeworkTemplate("t");
  const data = cardTemplateNodeData(template, { answer: { text: "Moved answer" }, question: { text: "Question text" } });
  const root = document.createElement("div"); root.innerHTML = data.richText;
  const answer = root.querySelector('[data-field-label="answer"]')!;
  root.firstElementChild!.prepend(answer);
  template.rows.reverse(); template.rows.flatMap(row => row.fields).find(field => field.id === "answer")!.color = "#ff3300";
  const updated = flexibleCardContent({ ...data, richText: root.innerHTML }, { cardTemplates: [template] });
  root.innerHTML = updated.richText;
  assert.equal(root.firstElementChild!.firstElementChild!.getAttribute("data-field-label"), "answer");
  assert.equal(root.querySelector('[data-field-label="answer"]')!.getAttribute("data-field-name"), "Answer");
  assert.match(root.querySelector('[data-field-label="answer"]')!.getAttribute("style")!, /#ff3300/);
  assert.match(updated.text, /Moved answerQuestion text/);
});
test("internal clipboard preserves portable labels and safe links", () => {
  const html = sanitizePastedHtml('<p data-pm-slice="1 1 []"><span data-field-label="answer" data-field-owner="card:t" data-field-name="Answer" style="color:#15803d"><a href="https://example.com">Moved</a></span></p>');
  assert.match(html, /data-field-label="answer"/); assert.match(html, /data-field-owner="card:t"/); assert.match(html, /data-field-name="Answer"/); assert.match(html, /href="https:\/\/example.com"/);
});
test("sample fields become flowing labeled text without fixed field widths", () => {
  const template = { id: "s", name: "Sample", width: 800, height: 300, style: {}, labels: [newSampleLabel("l", "Custom label")], richText: '<p>Fixed <span data-sample-field="f" data-sample-label="l" data-sample-width="450">Sample</span></p>' };
  const data = sampleCardData(template, [{ id: "entry", values: { f: { text: "Value", href: "https://example.com" } } }]);
  const result = flexibleCardContent(data, { sampleTemplates: [template] });
  assert.match(result.richText, /data-field-name="Custom label"/); assert.match(result.richText, /data-field-owner="sample:s"/);
  assert.doesNotMatch(result.richText, /data-sample-field|width:450|inline-block/);
  assert.match(result.richText, /href="https:\/\/example.com\/"/); assert.match(result.text, /Fixed Value/);
});
