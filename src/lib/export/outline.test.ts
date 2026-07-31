import assert from "node:assert/strict";
import test from "node:test";

import type { VidyaBoard, VidyaNode } from "../types";
import {
  decodeOutlinePdfMetadata,
  encodeOutlinePdfMetadata,
} from "../outline-payload";
import {
  buildOutlineDocument,
  outlineFilename,
  outlinePlainText,
  serializeOutlineHtml,
  serializeOutlineMarkdown,
  serializeOutlineText,
} from "./outline";

function node(
  id: string,
  type: VidyaNode["type"],
  data: Record<string, unknown>,
  x: number,
  y: number
): VidyaNode {
  return {
    id,
    type,
    position: { x, y },
    data,
  } as VidyaNode;
}

function fixtureBoard(): VidyaBoard {
  return {
    id: "board-1",
    userId: "user-1",
    accessRole: "owner",
    title: "Sanskrit & Logic",
    description: "A complete <study> outline.",
    content: {
      version: 1,
      nodes: [
        node("child-b", "grammar", {
          topic: "Sandhi",
          category: "sandhi",
          rule: "a + i = e",
          examples: ["deva + indra = devendra"],
          parentId: "root",
        }, 500, 200),
        node("standalone", "sticky", {
          text: "Loose note",
          notes: "Still exported",
        }, 20, 20),
        node("root", "mindmap", {
          text: "Root",
          richText: "<p>Root</p><p>Second line &amp; context</p>",
          childOrder: ["child-a", "child-b"],
          tags: ["core", "study"],
        }, 100, 100),
        node("child-a", "sanskrit", {
          title: "Agni",
          source: "Rigveda",
          devanagari: "अग्नि",
          iast: "agni",
          translation: "fire",
          displayMode: "both-stacked",
          parentId: "root",
        }, 200, 200),
        node("junction", "connectorJunction", {
          connectorJunction: true,
        }, 0, 0),
        node("matrix-frame", "frame", {
          title: "Generated frame",
          matrixFrameFor: "root",
        }, 0, 0),
      ],
      edges: [
        { id: "root-b", source: "root", target: "child-b", data: {} },
        { id: "root-a", source: "root", target: "child-a", data: {} },
        {
          id: "cross-link",
          source: "child-a",
          target: "standalone",
          data: { label: "explains" },
        },
      ],
      relationships: [{
        id: "relationship-1",
        sourceNodeId: "root",
        targetNodeId: "child-a",
        relationType: "invokes",
      }],
      relationshipFans: [],
      settings: {
        background: "dots",
        theme: "system",
        snapToGrid: false,
        defaultScriptMode: "plain",
        defaultNodeColor: "#000000",
        defaultFont: "Inter",
        defaultFontSize: 14,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    storageMode: "local",
  };
}

test("builds the complete authored hierarchy in stored child order", () => {
  const outline = buildOutlineDocument(fixtureBoard());

  assert.deepEqual(outline.roots.map((root) => root.title), ["Loose note", "Root"]);
  assert.deepEqual(outline.roots[1].children.map((child) => child.title), ["Agni", "Sandhi"]);
  assert.equal(outline.roots[1].details[0].label, "Text");
  assert.match(outline.roots[1].details[0].value, /Second line & context/);
  assert.deepEqual(
    outline.roots[1].children[0].details.map((detail) => detail.label),
    ["Source", "Devanagari", "IAST", "Translation"]
  );
  assert.equal(outline.connections.length, 1);
  assert.deepEqual(outline.connections[0], {
    source: "Agni",
    target: "Loose note",
    label: "explains",
  });
  assert.deepEqual(outline.relationships[0], {
    source: "Root",
    target: "Agni",
    label: "invokes",
  });
});

test("encodes a lossless Unicode hierarchy payload for PDF re-import", () => {
  const outline = buildOutlineDocument(fixtureBoard());
  const decoded = decodeOutlinePdfMetadata(encodeOutlinePdfMetadata(outline));

  assert.ok(decoded);
  assert.equal(decoded.title, "Sanskrit & Logic");
  assert.deepEqual(decoded.roots.map((root) => root.title), ["Loose note", "Root"]);
  assert.equal(decoded.roots[1].children[0].title, "Agni");
  assert.equal(
    decoded.roots[1].children[0].details.find(
      (detail) => detail.label === "Devanagari"
    )?.value,
    "अग्नि"
  );
});

test("serializes TXT and Markdown as nested outlines with all node details", () => {
  const outline = buildOutlineDocument(fixtureBoard());
  const text = serializeOutlineText(outline);
  const markdown = serializeOutlineMarkdown(outline);

  assert.match(text, /^Sanskrit & Logic\n/m);
  assert.match(text, /^2\. Root \[Mind map\]$/m);
  assert.match(text, /^  2\.1\. Agni \[Sanskrit card\]$/m);
  assert.match(text, /^    Devanagari: अग्नि$/m);
  assert.match(text, /^Connections\n-+/m);
  assert.match(text, /Agni -> Loose note: explains/);
  assert.match(text, /Root -> Agni: invokes/);

  assert.match(markdown, /^1\. \*\*Loose note\*\*/m);
  assert.match(markdown, /^1\. \*\*Root\*\*/m);
  assert.match(markdown, /^    1\. \*\*Agni\*\*/m);
  assert.match(markdown, /\*\*Devanagari:\*\* अग्नि/);
});

test("serializes a standalone semantic HTML document and escapes authored content", () => {
  const html = serializeOutlineHtml(buildOutlineDocument(fixtureBoard()));

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /A complete &lt;study&gt; outline\./);
  assert.match(html, /class="outline-number">2\.1\.<\/span>/);
  assert.match(html, /<span class="outline-title" dir="auto">Agni<\/span>/);
  assert.match(html, /<dt>Devanagari<\/dt><dd dir="auto">अग्नि<\/dd>/);
  assert.doesNotMatch(html, /Generated frame|Connector junction/);
});

test("normalizes rich text and produces filesystem-safe outline filenames", () => {
  assert.equal(
    outlinePlainText("<p>Hello&nbsp;<strong>world</strong></p><p>Next</p>"),
    "Hello world\nNext"
  );
  assert.equal(outlineFilename("  My / Board: 2026  ", "pdf"), "My-Board-2026.pdf");
});
