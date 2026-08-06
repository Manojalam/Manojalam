import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type {
  BoardContent,
  BoardSettings,
  RelationshipDiagramSpec,
} from "../types";
import {
  createCrossBoardDiagramPayload,
  insertCrossBoardDiagram,
} from "./cross-board-copy";

function content(
  partial: {
    nodes: Node[];
    edges?: Edge[];
    relationships?: BoardContent["relationships"];
    relationshipFans?: BoardContent["relationshipFans"];
    settings?: BoardSettings;
  }
): BoardContent {
  return {
    version: 1,
    nodes: partial.nodes,
    edges: partial.edges ?? [],
    relationships: partial.relationships ?? [],
    relationshipFans: partial.relationshipFans ?? [],
    settings: partial.settings ?? {
      background: "dots",
      theme: "system",
      snapToGrid: false,
      hierarchicalNumbering: false,
      hierarchicalNumberingFormat: "outline",
      showLabelBoxGuides: false,
      defaultScriptMode: "plain",
      defaultNodeColor: "#6366f1",
      defaultFont: "Inter",
      defaultFontSize: 14,
      canvasBackgroundMode: "auto",
      canvasTexture: "none",
      gridColorMode: "auto",
      gridSpacing: 32,
      gridSize: 32,
      connectorLabelPresets: [],
      customTextColors: [],
      customHighlightColors: [],
      customColors: [],
      symbolAppearance: {
        enclosure: "none",
        fillColor: "#3b82f6",
        borderColor: "#60a5fa",
        scale: 1,
        font: "inherit",
      },
    },
  } as BoardContent;
}

test("copies a selected hierarchy with its descendants and attached notes", () => {
  const source = content({
    nodes: [
      {
        id: "root",
        type: "shape",
        position: { x: 100, y: 100 },
        data: {
          text: "Root",
          layerId: "source-layer",
          childOrder: ["child"],
          mediaAttachments: [{
            id: "image-1",
            kind: "image",
            name: "diagram.png",
            mimeType: "image/png",
            size: 1,
            dataUrl: "data:image/png;base64,AA==",
            createdAt: "2026-07-29T12:00:00.000Z",
          }],
        },
        style: { width: 180, height: 80 },
      },
      {
        id: "child",
        type: "shape",
        position: { x: 360, y: 100 },
        data: { text: "Child", parentId: "root" },
        style: { width: 160, height: 70 },
      },
      {
        id: "note",
        type: "text",
        position: { x: 360, y: 220 },
        data: { text: "Note", noteForNodeId: "child" },
        style: { width: 120, height: 60 },
      },
      {
        id: "outside",
        type: "shape",
        position: { x: 800, y: 100 },
        data: { text: "Outside" },
      },
    ],
    edges: [
      {
        id: "edge",
        source: "root",
        target: "child",
        type: "branch",
        data: { layerId: "source-layer" },
      },
    ],
  });

  const payload = createCrossBoardDiagramPayload(source, ["root"]);
  assert.deepEqual(payload.nodes.map((node) => node.id), ["root", "child", "note"]);
  assert.deepEqual(payload.edges.map((edge) => edge.id), ["edge"]);

  const destination = content({
    nodes: [{
      id: "existing",
      type: "shape",
      position: { x: 0, y: 40 },
      data: { text: "Existing" },
      style: { width: 200, height: 80 },
    }],
  });
  const inserted = insertCrossBoardDiagram(destination, payload);
  assert.equal(inserted.nodes.length, 4);
  assert.equal(inserted.edges.length, 1);

  const copiedRoot = inserted.nodes.find((node) => node.data.text === "Root")!;
  const copiedChild = inserted.nodes.find((node) => node.data.text === "Child")!;
  const copiedNote = inserted.nodes.find((node) => node.data.text === "Note")!;
  assert.notEqual(copiedRoot.id, "root");
  assert.deepEqual(copiedRoot.data.childOrder, [copiedChild.id]);
  assert.deepEqual(
    copiedRoot.data.mediaAttachments,
    source.nodes[0].data.mediaAttachments
  );
  assert.notEqual(
    copiedRoot.data.mediaAttachments,
    source.nodes[0].data.mediaAttachments
  );
  assert.equal(copiedChild.data.parentId, copiedRoot.id);
  assert.equal(copiedNote.data.noteForNodeId, copiedChild.id);
  assert.equal(inserted.edges[0].source, copiedRoot.id);
  assert.equal(inserted.edges[0].target, copiedChild.id);
  assert.equal(copiedRoot.data.layerId, undefined);
  assert.equal(inserted.edges[0].data?.layerId, undefined);
  assert.ok(copiedRoot.position.x >= 296);
});

test("copies generated relationship diagrams with remapped source data", () => {
  const relationshipItemId = "relationship:source:target";
  const source = content({
    nodes: [
      {
        id: "source",
        type: "shape",
        position: { x: 0, y: 0 },
        data: { text: "Source" },
      },
      {
        id: "target",
        type: "shape",
        position: { x: 240, y: 0 },
        data: { text: "Target" },
      },
      {
        id: "diagram",
        type: "relationshipDiagram",
        position: { x: 0, y: 200 },
        data: {
          relationshipDiagramSpec: {
            version: 1,
            layout: "flower",
            scope: { mode: "selected-node", sourceNodeIds: ["source"] },
            relationTypes: ["supports"],
            title: "Connections",
            subtitle: "",
            showCounts: true,
            showIcons: false,
            palette: "indigo",
            textSize: 14,
            maximizeLabelText: false,
            density: "comfortable",
            flowerPetalsPerLayer: 8,
            flowerLayerCount: 1,
            decorativeLevel: "balanced",
            background: "transparent",
            sortSources: "manual",
            sortTargets: "manual",
            itemOrder: [relationshipItemId],
            itemStyles: {
              [relationshipItemId]: { fillColor: "#123456" },
            },
          },
        },
        style: { width: 500, height: 360 },
      },
    ],
    relationships: [{
      id: "relationship",
      sourceNodeId: "source",
      targetNodeId: "target",
      relationType: "supports",
    }],
    relationshipFans: [{
      sourceNodeId: "source",
      relationType: "supports",
      visible: true,
    }],
  });

  const payload = createCrossBoardDiagramPayload(source, ["diagram"]);
  assert.deepEqual(
    payload.nodes.map((node) => node.id),
    ["source", "target", "diagram"]
  );
  assert.equal(payload.relationships.length, 1);

  const inserted = insertCrossBoardDiagram(content({ nodes: [] }), payload);
  const copiedSource = inserted.nodes.find((node) => node.data.text === "Source")!;
  const copiedTarget = inserted.nodes.find((node) => node.data.text === "Target")!;
  const copiedDiagram = inserted.nodes.find(
    (node) => node.type === "relationshipDiagram"
  )!;
  const spec = copiedDiagram.data.relationshipDiagramSpec as RelationshipDiagramSpec;
  const remappedItemId = `relationship:${encodeURIComponent(copiedSource.id)}:${encodeURIComponent(copiedTarget.id)}`;

  assert.deepEqual(spec.scope.sourceNodeIds, [copiedSource.id]);
  assert.deepEqual(spec.itemOrder, [remappedItemId]);
  assert.deepEqual(spec.itemStyles?.[remappedItemId], { fillColor: "#123456" });
  assert.equal(inserted.relationships[0].sourceNodeId, copiedSource.id);
  assert.equal(inserted.relationships[0].targetNodeId, copiedTarget.id);
  assert.equal(inserted.relationshipFans[0].sourceNodeId, copiedSource.id);
});
