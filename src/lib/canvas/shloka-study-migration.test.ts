import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";

import { migrateLegacyShlokaStudyTemplate } from "./shloka-study-migration";

function legacyBoard(): { nodes: Node[]; edges: Edge[] } {
  const labels = [
    "Padaccheda",
    "Anvaya",
    "Padārtha",
    "Translation",
    "Grammar",
    "Chandas",
    "Notes",
    "Memorization",
  ];
  const nodes: Node[] = [
    {
      id: "topic",
      type: "shape",
      position: { x: 390, y: 60 },
      style: { width: 200, height: 80 },
      data: { text: "Śloka title", shapeType: "rounded" },
    },
    {
      id: "verse",
      type: "shloka",
      position: { x: 310, y: 210 },
      style: { width: 360, height: 190 },
      data: {
        title: "Verse",
        devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे",
        iast: "dharmakṣetre kurukṣetre",
        padaccheda: "धर्म-क्षेत्रे कुरु-क्षेत्रे",
        anvaya: "धर्मक्षेत्रे कुरुक्षेत्रे च",
        padartha: "धर्मक्षेत्रे — in the field of dharma",
        translation: "In the field of dharma…",
        chandas: "Anuṣṭubh",
        notes: "Opening verse.",
        memorizationStatus: "learning",
        tags: [],
      },
    },
    ...labels.map((label, index) => ({
      id: `section-${index}`,
      type: "shape",
      position: { x: 40 + (index % 4) * 240, y: 500 + Math.floor(index / 4) * 180 },
      style: { width: 180, height: 80 },
      data: { text: label, shapeType: "rounded", color: "#d97706" },
    })),
  ];
  const edges: Edge[] = [
    { id: "topic-verse", source: "topic", target: "verse" },
    ...labels.map((_, index) => ({
      id: `verse-section-${index}`,
      source: "verse",
      target: `section-${index}`,
    })),
  ];
  return { nodes, edges };
}

test("legacy Śloka Study boards move each field into its own card", () => {
  const legacy = legacyBoard();
  const result = migrateLegacyShlokaStudyTemplate(legacy.nodes, legacy.edges);

  assert.equal(result.migrated, true);
  const verse = result.nodes.find((node) => node.id === "verse")!;
  assert.equal(verse.data.studySection, "verse");
  assert.equal(verse.data.padaccheda, undefined);
  assert.equal(verse.style?.width, 420);
  assert.equal(verse.style?.height, 230);

  const padaccheda = result.nodes.find((node) => node.data.studySection === "padaccheda")!;
  assert.equal(padaccheda.type, "shloka");
  assert.equal(padaccheda.data.padaccheda, "धर्म-क्षेत्रे कुरु-क्षेत्रे");
  assert.equal(padaccheda.style?.width, 270);
  assert.equal(padaccheda.style?.height, 180);

  const grammar = result.nodes.find((node) => node.data.studySection === "grammar")!;
  assert.equal(grammar.data.grammar, "Add grammar notes for this verse.");
  const memorization = result.nodes.find((node) => node.data.studySection === "memorization")!;
  assert.equal(memorization.data.memorizationStatus, "learning");
  assert.equal(result.nodes.find((node) => node.id === "topic")!.position.x, 510);
});

test("standalone or incomplete Śloka layouts are not migrated", () => {
  const legacy = legacyBoard();
  const incompleteEdges = legacy.edges.filter((edge) => edge.target !== "section-7");
  const result = migrateLegacyShlokaStudyTemplate(legacy.nodes, incompleteEdges);

  assert.equal(result.migrated, false);
  assert.equal(result.nodes, legacy.nodes);
  assert.equal(result.nodes.find((node) => node.id === "verse")!.data.studySection, undefined);
});
