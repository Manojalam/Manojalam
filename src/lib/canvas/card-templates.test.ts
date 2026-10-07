import { placeTemplateField } from "./template-field-order";
import type { CardSection } from "../types";
import assert from "node:assert/strict";
import test from "node:test";
import { expandedCardRows, insertCardRowRepeat, cardSections, cardTemplateNodeData, detachCardTemplateData, newHomeworkTemplate, normalizeCardTemplates, renderCardSections, renderCardTemplate, savedHomeworkTemplate } from "./card-templates";

test("row and field styles survive persistence and repeated sections without changing answers", () => {
  const template = newHomeworkTemplate("styled");
  Object.assign(template.rows[0], { textAlign: "center", lineSpacing: 1.75 });
  Object.assign(template.rows[0].fields[0], { fontFamily: "Noto Serif Devanagari", fontSize: 28, bold: true, italic: true, underline: true });
  const saved = normalizeCardTemplates(JSON.parse(JSON.stringify([template])))[0];
  assert.deepEqual(saved.rows[0], template.rows[0]);
  const sections = [{ id: "one", values: { question: { text: "Heading" }, answer: { text: "Answer" } }, extraRows: [] }];
  const output = renderCardSections(saved, sections);
  assert.match(output.richText, /text-align: center;[^>]*line-height: 1.75/);
  assert.match(output.richText, /font-size: 28px; font-family: Noto Serif Devanagari/);
  assert.match(output.richText, /<u><em><strong>Heading<\/strong><\/em><\/u>/);
  assert.match(output.richText, /text-align: left;[^>]*line-height: 1.5/);
  assert.equal(output.text, "Heading\nAnswer");
  assert.deepEqual(cardTemplateNodeData(saved, undefined, undefined, sections).cardSections, sections);
  const cleared = structuredClone(saved);
  delete cleared.rows[0].lineSpacing;
  delete cleared.rows[0].fields[0].fontSize;
  delete cleared.rows[0].fields[0].fontFamily;
  const reset = renderCardSections(normalizeCardTemplates([cleared])[0], sections);
  assert.doesNotMatch(reset.richText, /font-size: 28px|font-family: Noto Serif Devanagari|line-height: 1.75/);
});

test("invalid row and field styles normalize safely", () => {
  const template = newHomeworkTemplate("invalid");
  Object.assign(template.rows[0], { textAlign: "invalid", lineSpacing: 99 });
  Object.assign(template.rows[0].fields[0], { fontSize: -20, bold: "false", italic: false });
  const saved = normalizeCardTemplates([template])[0];
  assert.equal(saved.rows[0].textAlign, undefined);
  assert.equal(saved.rows[0].lineSpacing, 4);
  assert.equal(saved.rows[0].fields[0].fontSize, 8);
  assert.equal(saved.rows[0].fields[0].bold, undefined);
});
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
  assert.doesNotMatch(output.richText, /&emsp;/);
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
  assert.equal("fillOpacity" in first, false);
  template.rows[0].fields[0].label = "New label";
  template.rows = template.rows.slice(0, 1);
  const updated = cardTemplateNodeData(template, first.cardFieldValues);
  assert.doesNotMatch(updated.text, /New label/);
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

test("adjacent fields use only authored spaces and separators", () => {
  const template = newHomeworkTemplate("spacing");
  template.rows = [template.rows[1]];
  const compact = renderCardTemplate(template, {
    answer: { text: "A" }, sutram: { text: "B" }, example: { text: "C" },
  });
  assert.equal(compact.text, "ABC");
  assert.doesNotMatch(compact.richText, /&emsp;|&nbsp;|<\/span>\s+<span/);
  const spaced = renderCardTemplate(template, {
    answer: { text: "A  " }, sutram: { text: " | B " }, example: { text: " C" },
  });
  assert.equal(spaced.text, "A   | B  C");
  assert.match(spaced.richText, /white-space: pre-wrap/);
  assert.match(spaced.richText, /A  <\/span><span[^>]*> \| B <\/span><span[^>]*> C/);
});

test("cleared template colors and default font survive saving and inherit at render time", () => {
  const template = newHomeworkTemplate("defaults");
  template.style.textColor = "";
  template.style.fillColor = "";
  template.style.borderColor = "";
  template.style.fontFamily = "Georgia, serif";
  template.style.lineSpacing = 1.75;
  template.rows[0].fields[0].color = "";
  const saved = normalizeCardTemplates(JSON.parse(JSON.stringify([template])))[0];
  assert.deepEqual(saved, template);
  const data = cardTemplateNodeData(saved, { question: { text: "Question" } });
  for (const property of ["textColor", "fillColor", "borderColor", "fontFamily", "lineSpacing", "textPadding", "layoutAutoFill"]) assert.equal(property in data, false);
  assert.match(data.richText, /font-family: Georgia, serif/);
  assert.match(data.richText, /color: inherit/);
  assert.match(data.richText, /line-height: 1.75/);
});

test("card-only rows survive redesign without adding fields to the shared template", () => {
  const template = newHomeworkTemplate("extras");
  template.rows = template.rows.slice(0, 2);
  const data = cardTemplateNodeData(template, { question: { text: "Question" } }, ["My <explanation>\nnext line", ""]);
  assert.match(data.richText, /My &lt;explanation&gt;<br>next line/);
  assert.equal(template.rows.length, 2);
  const saved = JSON.parse(JSON.stringify(data));
  template.rows.reverse();
  const redesigned = cardTemplateNodeData(template, saved.cardFieldValues, saved.cardExtraRows);
  assert.deepEqual(redesigned.cardExtraRows, data.cardExtraRows);
  assert.match(redesigned.text, /My <explanation>\nnext line$/);
  assert.doesNotMatch(cardTemplateNodeData(template).text, /explanation/);
});

test("homework shortcut reopens the saved design including renamed templates and custom rows", () => {
  const template = newHomeworkTemplate("saved-homework");
  template.name = "My custom chart";
  template.style.lineSpacing = 1.75;
  template.rows = [{ id: "custom-row", indent: 3, fields: [{ id: "custom-field", label: "Notes", color: "", kind: "text" }] }];
  const saved = normalizeCardTemplates(JSON.parse(JSON.stringify([template])));
  assert.deepEqual(savedHomeworkTemplate(saved), template);
  const copy = { ...structuredClone(template), id: "copy" };
  assert.equal(savedHomeworkTemplate([...saved, copy], template.id)?.id, template.id);
  assert.equal(savedHomeworkTemplate([...saved, copy])?.id, copy.id);
  assert.equal(savedHomeworkTemplate([]), undefined);
});

test("homework shortcut recognizes previously saved starters without confusing custom templates", () => {
  const legacy = newHomeworkTemplate("legacy");
  delete legacy.starter;
  legacy.name = "Renamed homework";
  legacy.style.lineSpacing = 1.75;
  const custom = { ...structuredClone(legacy), id: "custom", rows: [{ id: "my-row", indent: 0, fields: [{ id: "my-field", label: "My label", color: "", kind: "text" as const }] }] };
  assert.equal(savedHomeworkTemplate([legacy, custom])?.id, legacy.id);
  assert.equal(savedHomeworkTemplate([custom]), undefined);
});

test("existing cards become one section without losing values or extra rows", () => {
  const legacy = { cardFieldValues: { question: { text: "Existing question" } }, cardExtraRows: ["My explanation"] };
  const sections = cardSections(legacy);
  assert.deepEqual(sections, [{ id: "first", values: legacy.cardFieldValues, extraRows: legacy.cardExtraRows }]);
  sections[0].values.question.text = "Edited";
  sections[0].extraRows.push("Another row");
  assert.equal(legacy.cardFieldValues.question.text, "Existing question");
  assert.equal(legacy.cardExtraRows.length, 1);
});

test("repeated sections retain independent answers, links and extra rows after reload and redesign", () => {
  const template = newHomeworkTemplate("repeat");
  template.style.lineSpacing = 1.75;
  const sections = [
    { id: "one", values: { question: { text: "First question" }, sutram: { text: "First sutra", href: "https://example.com/one" } }, extraRows: ["First extra <row>"] },
    { id: "two", values: { question: { text: "Second question" }, sutram: { text: "Second sutra", href: "https://example.com/two" } }, extraRows: ["Second extra row"] },
  ];
  const data = cardTemplateNodeData(template, undefined, undefined, sections);
  assert.match(data.richText, /First question[\s\S]*First extra &lt;row&gt;[\s\S]*Second question[\s\S]*Second extra row/);
  assert.match(data.richText, /href="https:\/\/example.com\/one"/);
  assert.match(data.richText, /href="https:\/\/example.com\/two"/);
  assert.match(data.richText, /line-height: 1.75/);
  const restored = cardSections(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored, sections);
  template.rows.reverse();
  template.rows.flatMap(row => row.fields).find(field => field.id === "question")!.color = "#ff0000";
  const redesigned = cardTemplateNodeData(template, undefined, undefined, restored);
  assert.deepEqual(redesigned.cardSections, sections);
  assert.equal((redesigned.richText.match(/color: #ff0000/g) ?? []).length, 2);
  const detached = detachCardTemplateData(redesigned);
  assert.equal(detached.cardSections, undefined);
  assert.equal(detached.richText, redesigned.richText);
});

test("new sections start blank and rendering does not print section headings or field labels", () => {
  const template = newHomeworkTemplate("blank");
  const sections: CardSection[] = [{ id: "one", values: { question: { text: "Keep this answer" } }, extraRows: [] }, { id: "two", values: {}, extraRows: [] }];
  const output = renderCardSections(template, sections);
  assert.equal(output.text.match(/Keep this answer/g)?.length, 1);
  assert.doesNotMatch(output.text, /Section|Question|Answer|\.\.\./);
  assert.equal(cardTemplateNodeData(template).cardSections.length, 1);
  assert.deepEqual(cardTemplateNodeData(template).cardSections[0].values, {});
});


test("row repeats keep independent answers and shared design through persistence", () => {
  const template = newHomeworkTemplate("repeat-test");
  const original = structuredClone(template);
  const sections: CardSection[] = [{ id: "first", values: { answer: { text: "Original" }, explanation: { text: "Last" } }, extraRows: [], rowRepeats: [
    { id: "a", rowId: "answer_row", values: { answer: { text: "Repeat A" }, sutram: { text: "Reference", href: "https://example.com/a" } } },
    { id: "b", rowId: "answer_row", values: { answer: { text: "Repeat B" }, example: { text: "<example>" } } },
    { id: "c", rowId: "question_row", values: { question: { text: "Repeated question" } } },
  ] }];
  const data = cardTemplateNodeData(template, undefined, undefined, sections);
  const restored = cardSections(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored, sections);
  assert.deepEqual(template, original);
  assert.equal(data.text, "Repeated question\nOriginalRepeat AReferenceRepeat B<example>\nLast");
  assert.match(data.richText, /href="https:\/\/example.com\/a"/);
  assert.ok(data.richText.includes("&lt;example&gt;"));
  assert.equal((data.richText.match(/data-field-label="answer"/g) ?? []).length, 3);
  template.rows[1].indent = 3;
  template.rows[1].fields[0].color = "#123456";
  const updated = renderCardSections(template, restored);
  assert.equal((updated.richText.match(/padding-left: 3em/g) ?? []).length, 1);
  assert.equal((updated.richText.match(/color: #123456/g) ?? []).length, 3);
  restored[0].rowRepeats![0].values.answer.text = "Changed copy";
  assert.equal(sections[0].rowRepeats![0].values.answer.text, "Repeat A");
  assert.equal(restored[0].values.answer.text, "Original");
  assert.equal(cardTemplateNodeData(template).cardSections[0].rowRepeats, undefined);
});


test("repeat before and after place blank copies beside originals and copies", () => {
  const template = newHomeworkTemplate("positions");
  const values = { answer: { text: "Original" } };
  let repeats = insertCardRowRepeat([], "answer_row", "", "after", "a");
  repeats[0].values = { answer: { text: "First copy" } };
  repeats = insertCardRowRepeat(repeats, "answer_row", "", "before", "b");
  repeats = insertCardRowRepeat(repeats, "answer_row", "b", "before", "c");
  repeats = insertCardRowRepeat(repeats, "answer_row", "b", "after", "d");
  repeats = insertCardRowRepeat(repeats, "answer_row", "a", "before", "e");
  repeats = insertCardRowRepeat(repeats, "answer_row", "a", "after", "f");
  repeats = insertCardRowRepeat(repeats, "answer_row", "", "after", "g");
  repeats = insertCardRowRepeat(repeats, "answer_row", "", "before", "h");
  const ids = (items: typeof repeats) => expandedCardRows(template, values, items).filter(item => item.row.id === "answer_row").map(item => item.repeatId || "original");
  assert.deepEqual(ids(repeats), ["c", "b", "d", "h", "original", "g", "e", "a", "f"]);
  assert.deepEqual(repeats.find(item => item.id === "f")!.values, {});
  assert.equal(repeats.find(item => item.id === "a")!.values.answer.text, "First copy");
  const restored = cardSections(JSON.parse(JSON.stringify(cardTemplateNodeData(template, undefined, undefined, [{ id: "first", values, extraRows: [], rowRepeats: repeats }]))));
  assert.deepEqual(ids(restored[0].rowRepeats!), ids(repeats));
  // Copies do not depend on an anchor that may later be removed.
  assert.deepEqual(ids(repeats.filter(item => item.id !== "b")), ["c", "d", "h", "original", "g", "e", "a", "f"]);
  assert.deepEqual(ids([{ id: "legacy", rowId: "answer_row", values: {} }]), ["original", "legacy"]);
});


test("repeated fields flow inline and preserve only authored whitespace and line breaks", () => {
  const template = newHomeworkTemplate("inline");
  const values = { answer: { text: "Original " } };
  const repeats = [
    { id: "before", rowId: "answer_row", position: "before" as const, values: { answer: { text: "Before " } } },
    { id: "after", rowId: "answer_row", values: { answer: { text: "After" } } },
  ];
  const inline = renderCardTemplate(template, values, [], repeats);
  assert.equal(inline.text, "Before Original After");
  assert.equal((inline.richText.match(/<p /g) ?? []).length, 1);
  assert.ok(!inline.richText.includes("<br>"));
  repeats[1].values.answer.text = "\nAfter\nAnother line";
  const multiline = renderCardTemplate(template, values, [], repeats);
  assert.equal(multiline.text, "Before Original \nAfter\nAnother line");
  assert.equal((multiline.richText.match(/<br>/g) ?? []).length, 2);
  assert.equal((multiline.richText.match(/<p /g) ?? []).length, 1);
});


test("field placement preserves IDs, values and styles across rows and new rows", () => {
  const template = newHomeworkTemplate("move");
  const original = structuredClone(template.rows);
  let rows = placeTemplateField(template.rows, "example", "answer_row", "answer");
  assert.deepEqual(rows[1].fields.map(f => f.id), ["example", "answer", "sutram"]);
  rows = placeTemplateField(rows, "question", "answer_row", "sutram");
  assert.deepEqual(rows.map(r => r.id), ["answer_row", "explanation_row"]);
  assert.deepEqual(rows[0].fields.map(f => f.id), ["example", "answer", "question", "sutram"]);
  rows = placeTemplateField([{ id: "new", indent: 2, fields: [] }, ...rows], "sutram", "new");
  assert.equal(rows[0].fields[0].kind, "sutra");
  assert.equal(rows[0].fields[0].color, original[1].fields[1].color);
  const output = renderCardTemplate({ ...template, rows }, { sutram: { text: "Saved reference", href: "https://example.com" }, question: { text: "Saved question" } });
  assert.ok(output.text.startsWith("Saved reference\n"));
  assert.ok(output.text.includes("Saved question"));
  assert.deepEqual(template.rows, original);
  assert.equal(placeTemplateField(rows, "sutram", "missing"), rows);
  assert.equal(placeTemplateField(rows, "sutram", "new", "sutram"), rows);
});


test("optional empty rows and sections leave no gaps but keep their saved fields", () => {
  const template = newHomeworkTemplate("optional");
  const values = { question: { text: "Question" }, answer: { text: "  \n " }, explanation: { text: "Explanation\nsecond line" } };
  const sections: CardSection[] = [
    { id: "empty", values: {}, extraRows: [" ", "\n"] },
    { id: "filled", values, extraRows: ["", "  "] },
    { id: "empty-last", values: {}, extraRows: [] },
  ];
  const data = cardTemplateNodeData(template, undefined, undefined, sections);
  assert.equal(data.text, "Question\nExplanation\nsecond line");
  assert.equal((data.richText.match(/<p /g) ?? []).length, 2);
  assert.equal((data.richText.match(/<br>/g) ?? []).length, 1);
  assert.deepEqual(cardSections(JSON.parse(JSON.stringify(data))), sections);
  assert.equal(renderCardTemplate(template).richText, "");
  const repeated = renderCardTemplate(template, {}, [], [{ id: "repeat", rowId: "answer_row", values: { answer: { text: "Only repeat filled" } } }]);
  assert.equal(repeated.text, "Only repeat filled");
  assert.equal((repeated.richText.match(/<p /g) ?? []).length, 1);
});


test("conditional constants follow populated inputs in each repeat, with safe styling and persistence", () => {
  const template = newHomeworkTemplate("constants");
  template.rows = [{ id: "step", indent: 0, fields: [
    { id: "arrow", label: "Arrow", kind: "constant", constantText: "→ ", color: "" },
    { id: "root", label: "Root", kind: "text", color: "" },
    { id: "plus", label: "Plus", kind: "constant", constantText: " + ", constantWhenFieldId: "ending", color: "#ff0000", bold: true },
    { id: "ending", label: "Ending", kind: "text", color: "" },
    { id: "open", label: "Open", kind: "constant", constantText: " [", constantWhenFieldId: "sutra", color: "" },
    { id: "sutra", label: "Sutra", kind: "sutra", color: "" },
    { id: "close", label: "Close", kind: "constant", constantText: "]", constantWhenFieldId: "sutra", color: "" },
  ] }];
  const saved = normalizeCardTemplates(JSON.parse(JSON.stringify([template])))[0];
  assert.deepEqual(saved, template);
  assert.equal(renderCardTemplate(saved, {}).text, "");
  assert.equal(renderCardTemplate(saved, { root: { text: "भू" }, plus: { text: "stale" }, sutra: { text: "  " } }).text, "→ भू  ");
  const values = { root: { text: "भू" }, ending: { text: "तिप्" }, sutra: { text: "३.४.७८", href: "https://ashtadhyayi.com/sutraani/3/4/78" } };
  const output = renderCardTemplate(saved, values);
  assert.equal(output.text, "→ भू + तिप् [३.४.७८]");
  assert.match(output.richText, /<strong> \+ <\/strong>/);
  assert.match(output.richText, /href="https:/);
  const repeated = renderCardTemplate(saved, values, [], [{ id: "again", rowId: "step", values: { root: { text: "भवति" } } }]);
  assert.equal(repeated.text, "→ भू + तिप् [३.४.७८]→ भवति");
  saved.rows[0].fields.find(field => field.id === "open")!.constantText = '<script>&"';
  assert.match(renderCardTemplate(saved, values).richText, /&lt;script&gt;&amp;&quot;/);
  saved.rows[0].fields = saved.rows[0].fields.filter(field => field.id !== "sutra");
  assert.equal(renderCardTemplate(saved, values).text, "→ भू + तिप्");
  assert.equal(renderCardTemplate(saved, {}, [], [{ id: "empty", rowId: "step", values: {} }]).richText, "");
});
