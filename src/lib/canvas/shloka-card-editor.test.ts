import assert from "node:assert/strict";
import test from "node:test";

import type { ShlokaCardNodeData } from "../types";
import { shlokaCardEditorDraft, shlokaCardEditorPatch } from "./shloka-card-editor";

test("the Śloka editor exposes every verse-study field", () => {
  const data: ShlokaCardNodeData = {
    title: "Bhagavad Gītā 1.1",
    sourceText: "Mahābhārata",
    devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे",
    iast: "dharmakṣetre kurukṣetre",
    padaccheda: "धर्म-क्षेत्रे कुरु-क्षेत्रे",
    anvaya: "धर्मक्षेत्रे कुरुक्षेत्रे च",
    padartha: "धर्मक्षेत्रे — in the field of dharma",
    translation: "In the field of dharma…",
    chandas: "Anuṣṭubh",
    notes: "Review the compound.",
    memorizationStatus: "learning",
    tags: ["गीता", "स्मरणम्"],
  };

  assert.deepEqual(shlokaCardEditorDraft(data), {
    title: "Bhagavad Gītā 1.1",
    sourceText: "Mahābhārata",
    devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे",
    iast: "dharmakṣetre kurukṣetre",
    padaccheda: "धर्म-क्षेत्रे कुरु-क्षेत्रे",
    anvaya: "धर्मक्षेत्रे कुरुक्षेत्रे च",
    padartha: "धर्मक्षेत्रे — in the field of dharma",
    translation: "In the field of dharma…",
    chandas: "Anuṣṭubh",
    notes: "Review the compound.",
    memorizationStatus: "learning",
    tagsText: "गीता, स्मरणम्",
  });
});

test("saving a Śloka edit clears empty optional fields and normalizes tags", () => {
  const draft = shlokaCardEditorDraft({
    title: "Verse",
    devanagari: "धर्मक्षेत्रे",
    iast: "dharmakṣetre",
    memorizationStatus: "new",
    tags: [],
  });

  draft.sourceText = "   ";
  draft.padaccheda = "धर्म-क्षेत्रे";
  draft.memorizationStatus = "memorized";
  draft.tagsText = "गीता, स्मरणम्, गीता";

  assert.deepEqual(shlokaCardEditorPatch(draft), {
    title: "Verse",
    sourceText: undefined,
    devanagari: "धर्मक्षेत्रे",
    iast: "dharmakṣetre",
    padaccheda: "धर्म-क्षेत्रे",
    anvaya: undefined,
    padartha: undefined,
    translation: undefined,
    chandas: undefined,
    notes: undefined,
    memorizationStatus: "memorized",
    tags: ["गीता", "स्मरणम्"],
  });
});
