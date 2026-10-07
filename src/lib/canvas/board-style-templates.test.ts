import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import type { BoardStyleTemplate } from "../types";
import { applyStyleTemplate, captureTemplateStyle, detachTemplateData, normalizeBoardStyleTemplates, supportsStyleTemplate } from "./board-style-templates";

const template: BoardStyleTemplate = {
  id: "lesson", name: "Lesson", style: { fillColor: "#123456", textColor: "#d5ad5e", fontSize: 20 },
  roles: [{ id: "question", name: "Question", color: "#d5ad5e" }],
  sample: { type: "shape", text: "Sample", richText: "<p>Sample</p>", width: 400, height: 200 },
};
const node: Node = { id: "box", type: "shape", position: { x: 120, y: 80 }, style: { width: 550 }, data: { text: "My own text", parentId: "parent", fillColor: "#ffffff" } };

test("template style capture excludes content, identity, and layout ownership", () => {
  const style = captureTemplateStyle({ ...node.data, id: "wrong", styleTemplateId: "old", surfaceEffect: "glow", layoutMode: "matrix", fontSize: 24 });
  assert.equal(style.surfaceEffect, "glow");assert.equal(style.fontSize, 24);
  for (const key of ["text", "richText", "id", "parentId", "layoutMode", "styleTemplateId"]) assert.ok(!(key in style));
  assert.equal(JSON.parse(JSON.stringify(style)).textColor, null);
});

test("applying a template preserves text and geometry while changing shared style", () => {
  const result = applyStyleTemplate(node, template);
  assert.equal(result.data.text, "My own text");assert.equal(result.id, node.id);
  assert.deepEqual(result.position, node.position);assert.deepEqual(result.style, node.style);
  assert.equal(result.data.parentId, "parent");assert.equal(result.data.fillColor, "#123456");
  assert.equal(result.data.styleTemplateId, "lesson");assert.equal(result.data.layoutAutoFill, false);
  assert.equal(node.data.fillColor, "#ffffff", "source node stays immutable");
});

test("template deltas keep unrelated local overrides and detaching keeps appearance", () => {
  const local = { ...node, data: { ...node.data, fontSize: 48 } };
  const result = applyStyleTemplate(local, template, false, ["fillColor"]);
  assert.equal(result.data.fontSize, 48);assert.equal(result.data.fillColor, "#123456");
  const detached = detachTemplateData(result.data);
  assert.equal(detached.styleTemplateId, undefined);assert.equal(detached.fontSize, 48);assert.equal(detached.fillColor, "#123456");
});

test("saved templates normalize roles and ignore malformed data or unsupported styles", () => {
  const normalized = normalizeBoardStyleTemplates([null, {}, { ...template, style: { ...template.style, text: "must not replace content" }, roles: [null, ...template.roles, ...template.roles, { id: "bad", name: "Bad", color: "invalid" }], sample: { ...template.sample, width: -1 } }, template]);
  assert.equal(normalized.length, 1);assert.equal(normalized[0].roles.length, 1);
  assert.equal(normalized[0].style.text, undefined);assert.equal(normalized[0].sample.width, 300);
  assert.deepEqual(normalizeBoardStyleTemplates(JSON.parse(JSON.stringify([template]))), [template]);
});

test("ordinary boxes support templates while generated charts do not", () => {
  assert.equal(supportsStyleTemplate(node), true);
  assert.equal(supportsStyleTemplate({ ...node, data: { radialChart: { enabled: false } } }), true);
  assert.equal(supportsStyleTemplate({ ...node, data: { radialChart: { enabled: true } } }), false);
  assert.equal(supportsStyleTemplate({ ...node, type: "relationshipDiagram" }), false);
});


test("template style capture retains independent effect layers without sharing references", () => {
  const layers = [{ preset: "metallic", depth: 6, strength: 72, angle: 20 }, { preset: "glow", depth: 12, strength: 58, angle: 45 }];
  const style = captureTemplateStyle({ surfaceEffects: layers });
  assert.deepEqual(style.surfaceEffects, layers);
  assert.notEqual(style.surfaceEffects, layers);
});
