import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOARD_SETTINGS } from "../types";
import { newHomeworkTemplate } from "../canvas/card-templates";
import { collectBoardTemplates, importLibraryTemplate } from "./board-library";

test("library discovers saved designs without importing board answers", () => {
  const template = newHomeworkTemplate("shared");
  const sources = [
    { id: "old", title: "Old board", updatedAt: "2026-01-01", settings: { cardTemplates: [template] } },
    { id: "new", title: "New board", updatedAt: "2026-02-01", settings: { cardTemplates: [{ ...template, name: "Updated" }] } },
    { id: "here", title: "Here", updatedAt: "2026-03-01", settings: { cardTemplates: [newHomeworkTemplate("local")] } },
  ];
  const entries = collectBoardTemplates(sources, "here");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceId, "new");
  const imported = importLibraryTemplate(DEFAULT_BOARD_SETTINGS, entries[0]);
  assert.equal(imported.cardTemplates![0].name, "Updated");
  imported.cardTemplates![0].rows[0].fields[0].label = "Local label";
  assert.equal(sources[1].settings.cardTemplates[0].rows[0].fields[0].label, "Question");
  const reused = importLibraryTemplate({ ...DEFAULT_BOARD_SETTINGS, ...imported }, entries[0]);
  assert.equal(reused.cardTemplates!.length, 1);
  assert.equal(reused.cardTemplates![0].rows[0].fields[0].label, "Local label");
});

test("library handles empty and malformed saved template arrays", () => {
  assert.deepEqual(collectBoardTemplates([{ id: "old", title: "Old", updatedAt: "", settings: {} }]), []);
  assert.deepEqual(collectBoardTemplates([{ id: "bad", title: "Bad", updatedAt: "", settings: { cardTemplates: [null] as never } }]), []);
});


test("sample templates and linked styles can be reused independently", () => {
  const entries = collectBoardTemplates([{ id: "source", title: "Source", updatedAt: "2026-01-01", settings: {
    sampleTemplates: [{ id: "sample", name: "Sample", richText: "<p>Fixed text</p>", labels: [], style: {}, width: 600, height: 300 }],
    styleTemplates: [{ id: "style", name: "Style", style: { fontSize: 24 }, roles: [], sample: { type: "shape", text: "Example", richText: "<p>Example</p>", width: 400, height: 200 } }],
  } }]);
  assert.deepEqual(entries.map(entry => entry.kind), ["sample", "style"]);
  let settings = { ...DEFAULT_BOARD_SETTINGS };
  for (const entry of entries) settings = { ...settings, ...importLibraryTemplate(settings, entry) };
  assert.equal(settings.sampleTemplates![0].width, 600);
  assert.equal(settings.styleTemplates![0].style.fontSize, 24);
  settings.sampleTemplates![0].name = "Local sample";
  assert.equal(entries[0].template.name, "Sample");
});
