import assert from "node:assert/strict";
import test from "node:test";
import { cardTemplateNodeData, detachCardTemplateData, newHomeworkTemplate, normalizeCardTemplates, renderCardTemplate } from "./card-templates";
import { searchSutras, sutraFieldValue } from "../sanskrit/sutra-search";

test("card layout renders custom labels, rows, indentation and safe sūtra links", () => {
  const template = newHomeworkTemplate("homework");
  template.rows[0].fields[0].label = "मम प्रश्नः <script>";
  const output = renderCardTemplate(template, {
    question: { text: "First <question>\nSecond line" },
    sutram: { text: "३.४.८९ मेर्निः", href: "https://ashtadhyayi.com/sutraani/3/4/89" },
    example: { text: '<img src=x onerror="alert(1)">' },
  });
  assert.match(output.richText, /padding-left: 2em/);
  assert.match(output.richText, /text-align: left/);
  assert.match(output.richText, /&emsp;&emsp;/);
  assert.match(output.richText, /First &lt;question&gt;<br>Second line/);
  assert.match(output.richText, /href="https:\/\/ashtadhyayi.com\/sutraani\/3\/4\/89"/);
  assert.ok(!output.richText.includes("<script>"));
  assert.ok(!output.richText.includes("<img"));
  assert.match(output.text, /First <question>/);
});

test("redesign preserves independent field values by ID, including removed fields", () => {
  const template = newHomeworkTemplate("homework");
  const values = { question: { text: "Original question" }, answer: { text: "My answer" } };
  const first = cardTemplateNodeData(template, values);
  assert.equal(first.fillOpacity, 1);
  template.rows[0].fields[0].label = "New label";
  template.rows = template.rows.slice(0, 1);
  const updated = cardTemplateNodeData(template, first.cardFieldValues);
  assert.doesNotMatch(updated.richText, /New label/);
  assert.equal(updated.cardTemplateSnapshot.rows[0].fields[0].label, "New label");
  assert.match(updated.richText, /Original question/);
  assert.equal(updated.cardFieldValues.answer.text, "My answer");
  assert.equal(first.cardTemplateSnapshot.rows[0].fields[0].label, "Question");
  const detached = detachCardTemplateData(updated);
  assert.equal(detached.cardTemplateId, undefined);
  assert.equal(detached.richText, updated.richText);
});

test("normalization validates colors, bounds and identities and roundtrips saved cards", () => {
  const template = newHomeworkTemplate("homework");
  assert.deepEqual(normalizeCardTemplates(JSON.parse(JSON.stringify([template]))), [template]);
  const malformed = { ...template, style: { fontSize: Infinity, width: -2, fillColor: 'red; background:url(x)' }, rows: [...template.rows, template.rows[0]] };
  const clean = normalizeCardTemplates([null, {}, malformed, template]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].rows.length, 3);
  assert.equal(clean[0].style.fontSize, 22);
  assert.equal(clean[0].style.width, 240);
  assert.equal(clean[0].style.fillColor, "#ffffff");
  assert.ok(!renderCardTemplate(template, { sutram: { text: "Unsafe", href: "javascript:alert(1)" } }).richText.includes("javascript:"));
});

test("sūtra lookup accepts both numeral systems, source URLs and words", () => {
  const sutras = [
    { number: "3.4.89", text: "मेर्निः", roman: "mernih" },
    { number: "3.4.8", text: "Example", roman: "example" },
  ];
  for (const query of ["3.4.89", "३.४.८९", "मेर्निः", "merniḥ", "https://ashtadhyayi.com/sutraani/3/4/89"]) {
    assert.equal(searchSutras(sutras, query)[0]?.number, "3.4.89");
  }
  assert.deepEqual(searchSutras(sutras, "nonexistent"), []);
  assert.deepEqual(searchSutras(sutras, ""), []);
  assert.deepEqual(sutraFieldValue(sutras[0]), { text: "३.४.८९ मेर्निः", href: "https://ashtadhyayi.com/sutraani/3/4/89" });
});
