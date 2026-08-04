import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CONTENT_VERSION } from "../config";
import {
  getAllTemplates,
  getTemplateById,
  getTemplatesByCategory,
  instantiateTemplate,
  isTemplateCategory,
  TEMPLATE_CATEGORIES,
} from "./index";
import { ensureTemplateBoardContent } from "./persistence";
import type { BoardContent } from "../types";

const EXPECTED_TEMPLATE_IDS = [
  "basic-mindmap",
  "flowchart",
  "cornell-notes",
  "concept-map",
  "study-plan",
  "project-planning",
  "timeline",
  "kanban-lite",
  "shloka-study",
  "vyakarana-rule",
  "sanskrit-grammar-chart",
];

const SUPPORTED_TEMPLATE_NODE_TYPES = new Set([
  "shape",
  "sticky",
  "frame",
  "shloka",
  "grammar",
]);

test("the gallery exposes only the curated templates", () => {
  const templates = getAllTemplates();

  assert.deepEqual(templates.map((template) => template.id), EXPECTED_TEMPLATE_IDS);
  assert.equal(new Set(templates.map((template) => template.id)).size, templates.length);
  assert.equal(new Set(templates.map((template) => template.name)).size, templates.length);

  assert.deepEqual(
    TEMPLATE_CATEGORIES.map((category) => category.id),
    ["general", "study", "planning", "sanskrit"]
  );
  assert.equal(isTemplateCategory("study"), true);
  assert.equal(isTemplateCategory("unknown"), false);

  for (const category of TEMPLATE_CATEGORIES) {
    const matching = getTemplatesByCategory(category.id);
    assert.ok(matching.length > 0, `${category.label} should not be an empty filter`);
    assert.ok(matching.every((template) => template.category === category.id));
  }
});

test("every template is a current, renderable board payload", () => {
  for (const template of getAllTemplates()) {
    const { content } = template;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    assert.equal(content.version, BOARD_CONTENT_VERSION, `${template.id} has a stale version`);
    assert.ok(content.nodes.length > 0, `${template.id} has no nodes`);
    assert.ok(content.settings, `${template.id} has no board settings`);
    assert.ok(Array.isArray(content.relationships));
    assert.ok(Array.isArray(content.relationshipFans));

    for (const node of content.nodes) {
      assert.ok(node.id, `${template.id} has a node without an id`);
      assert.equal(nodeIds.has(node.id), false, `${template.id} repeats node id ${node.id}`);
      nodeIds.add(node.id);

      assert.ok(Number.isFinite(node.position.x), `${template.id}/${node.id} has an invalid x position`);
      assert.ok(Number.isFinite(node.position.y), `${template.id}/${node.id} has an invalid y position`);
      assert.ok(Number.parseFloat(String(node.style?.width)) > 0, `${template.id}/${node.id} has no initial width`);
      assert.ok(Number.parseFloat(String(node.style?.height)) > 0, `${template.id}/${node.id} has no initial height`);
      assert.notEqual(node.type, "mindmap", `${template.id}/${node.id} uses the legacy mindmap type`);
      assert.ok(
        node.type && SUPPORTED_TEMPLATE_NODE_TYPES.has(node.type),
        `${template.id}/${node.id} uses unsupported node type ${node.type}`
      );

      const data = (node.data ?? {}) as Record<string, unknown>;
      if (node.type === "shape") {
        assert.equal(typeof data.text, "string", `${template.id}/${node.id} has no shape text`);
        assert.equal(typeof data.shapeType, "string", `${template.id}/${node.id} has no shape type`);
      }
      if (node.type === "sticky") {
        assert.equal(typeof data.text, "string", `${template.id}/${node.id} has no sticky text`);
      }
      if (node.type === "frame") {
        assert.equal(typeof data.title, "string", `${template.id}/${node.id} has no frame title`);
      }
      if (node.type === "shloka") {
        assert.equal(typeof data.devanagari, "string", `${template.id}/${node.id} has no Devanagari text`);
        assert.equal(typeof data.iast, "string", `${template.id}/${node.id} has no IAST text`);
      }
      if (node.type === "grammar") {
        assert.equal(typeof data.rule, "string", `${template.id}/${node.id} has no grammar rule`);
        assert.ok(Array.isArray(data.examples), `${template.id}/${node.id} has no grammar examples`);
      }
    }

    for (const edge of content.edges) {
      assert.ok(edge.id, `${template.id} has an edge without an id`);
      assert.equal(edgeIds.has(edge.id), false, `${template.id} repeats edge id ${edge.id}`);
      edgeIds.add(edge.id);
      assert.ok(nodeIds.has(edge.source), `${template.id} has dangling edge source ${edge.source}`);
      assert.ok(nodeIds.has(edge.target), `${template.id} has dangling edge target ${edge.target}`);
      assert.notEqual(edge.source, edge.target, `${template.id} has a self-referencing edge`);
    }
  }
});

test("template instantiation returns an isolated board payload", () => {
  const first = instantiateTemplate("basic-mindmap");
  const second = instantiateTemplate("basic-mindmap");

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.content, second.content);
  assert.notEqual(first.content.nodes, second.content.nodes);
  assert.deepEqual(first, second);

  first.content.nodes[0].position.x = -999;
  assert.notEqual(second.content.nodes[0].position.x, -999);
  assert.notEqual(getTemplateById("basic-mindmap")?.content.nodes[0].position.x, -999);
  assert.equal(instantiateTemplate("removed-template"), undefined);
});

test("the Mind Map template declares a stable two-sided layout", () => {
  const template = getTemplateById("basic-mindmap");
  assert.ok(template);
  const root = template.content.nodes.find((node) =>
    ((node.data ?? {}) as Record<string, unknown>).layoutMode === "mindMap"
  );
  assert.ok(root);

  const sides = template.content.nodes
    .filter((node) => node.id !== root.id)
    .map((node) => ((node.data ?? {}) as Record<string, unknown>).mindMapSide);
  assert.deepEqual(sides, ["left", "right", "left", "right"]);
  assert.ok(template.content.edges.every((edge) => edge.data?.curveStyle === "step"));
});

test("an empty persisted template is repaired before navigation", async () => {
  const template = instantiateTemplate("basic-mindmap");
  assert.ok(template);
  const emptyContent: BoardContent = {
    ...structuredClone(template.content),
    nodes: [],
    edges: [],
  };
  const emptyBoard = { id: "board-1", content: emptyContent };
  const repairedBoard = { id: "board-1", content: structuredClone(template.content) };
  let repairCount = 0;

  const result = await ensureTemplateBoardContent(
    "basic-mindmap",
    template.content,
    emptyBoard,
    async () => {
      repairCount += 1;
      return repairedBoard;
    }
  );

  assert.equal(result.content.nodes.length, template.content.nodes.length);
  assert.equal(repairCount, 1);

  await assert.rejects(
    ensureTemplateBoardContent(
      "basic-mindmap",
      template.content,
      emptyBoard,
      async () => emptyBoard
    ),
    /could not be saved/
  );
});
