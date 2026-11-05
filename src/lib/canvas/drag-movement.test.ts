import { closeDeletedImageNoteGaps, imageNoteInsertion, reflowImageNoteRows } from "./image-note-pairs";
import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { planNodeDragMovement } from "./drag-movement";

function node(id: string, data: Record<string, unknown> = {}): Node {
  return { id, type: "shape", position: { x: 0, y: 0 }, data };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: {} };
}

function positionedNode(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {}
): Node {
  return { id, type, position: { x, y }, style: { width, height }, data };
}

test("a normal parent drag moves its branch and attached notes", () => {
  const nodes = [
    node("parent"),
    node("child"),
    node("grandchild"),
    node("note", { externalNote: true, noteForNodeId: "parent" }),
    node("other"),
  ];
  const edges = [
    edge("parent-child", "parent", "child"),
    edge("child-grandchild", "child", "grandchild"),
  ];

  const plan = planNodeDragMovement(nodes, edges, "parent", ["parent"]);

  assert.deepEqual(new Set(plan.movingIds), new Set(["parent", "child", "grandchild", "note"]));
  assert.equal(plan.moveAsGroup, true);
});

test("move-only keeps descendants and attached notes in place", () => {
  const nodes = [
    node("parent"),
    node("child"),
    node("note", { externalNote: true, noteForNodeId: "parent" }),
  ];
  const edges = [edge("parent-child", "parent", "child")];

  const plan = planNodeDragMovement(nodes, edges, "parent", ["parent"], true);

  assert.deepEqual(plan.movingIds, ["parent"]);
  assert.equal(plan.moveAsGroup, false);
});

test("a normal List root drag moves only the root", () => {
  const nodes = [
    node("root", { layoutMode: "list" }),
    node("child", { parentId: "root" }),
    node("grandchild", { parentId: "child" }),
  ];
  const edges = [
    edge("root-child", "root", "child"),
    edge("child-grandchild", "child", "grandchild"),
  ];

  const plan = planNodeDragMovement(nodes, edges, "root", ["root"]);

  assert.deepEqual(plan.movingIds, ["root"]);
  assert.equal(plan.moveAsGroup, false);
});

test("multi-selection still moves selected List nodes together", () => {
  const nodes = [
    node("root", { layoutMode: "list" }),
    node("child", { parentId: "root" }),
    node("grandchild", { parentId: "child" }),
  ];
  const edges = [
    edge("root-child", "root", "child"),
    edge("child-grandchild", "child", "grandchild"),
  ];

  const plan = planNodeDragMovement(nodes, edges, "root", ["root", "child"]);

  assert.deepEqual(plan.movingIds, ["root", "child"]);
});

test("matrix frames stay together even when move-only is requested", () => {
  const nodes = [
    node("matrix", { matrixCellRole: "header", matrixRootId: "matrix" }),
    node("cell", { matrixRootId: "matrix" }),
    node("frame", { matrixFrameFor: "matrix" }),
  ];

  const plan = planNodeDragMovement(nodes, [], "matrix", ["matrix"], true);

  assert.deepEqual(new Set(plan.movingIds), new Set(["matrix", "cell", "frame"]));
  assert.equal(plan.matrixRootId, "matrix");
  assert.equal(plan.moveAsGroup, true);
});

test("a matrix cell can move its branch without dragging the generated frame", () => {
  const nodes = [
    node("matrix", { matrixCellRole: "header", matrixRootId: "matrix" }),
    node("cell", { matrixRootId: "matrix", parentId: "matrix" }),
    node("leaf", { matrixRootId: "matrix", parentId: "cell" }),
    node("frame", { matrixFrameFor: "matrix" }),
  ];
  const edges = [edge("matrix-cell", "matrix", "cell"), edge("cell-leaf", "cell", "leaf")];

  const plan = planNodeDragMovement(nodes, edges, "cell", ["cell"]);

  assert.deepEqual(new Set(plan.movingIds), new Set(["cell", "leaf"]));
  assert.equal(plan.matrixRootId, "matrix");
  assert.equal(plan.moveAsGroup, true);
});

test("dragging a standalone frame carries the cards owned by that frame", () => {
  const nodes = [
    positionedNode("lane", "frame", 0, 0, 400, 600),
    positionedNode("card", "sticky", 100, 100, 180, 120),
    positionedNode("outside", "sticky", 500, 100, 180, 120),
  ];

  const plan = planNodeDragMovement(nodes, [], "lane", ["lane"]);

  assert.deepEqual(new Set(plan.movingIds), new Set(["lane", "card"]));
  assert.equal(plan.moveAsGroup, true);
});


test("image-note pairs move together from either member without changing selection", () => {
  const image = { ...node("image"), type: "image", selected: true, data: { image: { name: "page.png" } } };
  const noteBox = node("notes", { imageNotesFor: "page.png", noteForNodeId: "image" });
  const nodes = [image, noteBox, node("other")];
  for (const id of ["image", "notes"]) assert.deepEqual(new Set(planNodeDragMovement(nodes, [], id, [id]).movingIds), new Set(["image", "notes"]));
  assert.equal(noteBox.selected, undefined);
  assert.deepEqual(planNodeDragMovement(nodes, [], "image", ["image"], true).movingIds, ["image"]);
  noteBox.data.locked = true;
  assert.deepEqual(planNodeDragMovement(nodes, [], "image", ["image"]).movingIds, ["image"]);
});

test("older folder imports pair by filename and aligned row", () => {
  const image = { ...node("image"), type: "image", data: { image: { name: "page.png" } } };
  const noteBox = { ...node("notes", { imageNotesFor: "page.png" }), position: { x: 688, y: 0 } };
  assert.deepEqual(new Set(planNodeDragMovement([image, noteBox], [], "notes", ["notes"]).movingIds), new Set(["image", "notes"]));
});


test("deleting complete image-note rows closes gaps and retains adjusted note offsets", () => {
  const rows = [0, 268, 536].flatMap((y, i) => [
    positionedNode(`i${i}`, "image", 0, y, 300, 180, { imageNotesBatchId: "batch" }),
    positionedNode(`n${i}`, "shape", 500, y + 12, 400, 220, { imageNotesFor: `${i}.png`, noteForNodeId: `i${i}` }),
  ]);
  const after = closeDeletedImageNoteGaps(rows, rows.filter(node => !["i1", "n1"].includes(node.id)));
  assert.equal(after.find(node => node.id === "i2")!.position.y, 268);
  assert.deepEqual(after.find(node => node.id === "n2")!.position, { x: 500, y: 280 });
  assert.deepEqual(closeDeletedImageNoteGaps(rows, rows.filter(node => node.id !== "n1")), rows.filter(node => node.id !== "n1"), "partial deletion leaves row space");
  assert.deepEqual(closeDeletedImageNoteGaps(rows, rows), rows);
});


test("image insertion resolves first, middle and last slots without targeting notes or other columns", () => {
  const rows = [0, 268, 536].flatMap((y, i) => [
    positionedNode(`i${i}`, "image", 0, y, 300, 180, { imageNotesBatchId: "batch" }),
    positionedNode(`n${i}`, "shape", 500, y + 12, 400, 220, { imageNotesFor: `${i}.png`, noteForNodeId: `i${i}` }),
  ]);
  const middle = imageNoteInsertion(rows, { x: 100, y: 250 })!;
  assert.deepEqual(middle.following.map(pair => pair.image.id), ["i1", "i2"]);
  assert.equal(middle.y, 280, "reserves the adjusted preceding note height and gap");
  assert.equal(middle.x, 0);
  assert.equal(imageNoteInsertion(rows, { x: 100, y: -20 })!.following.length, 3);
  assert.equal(imageNoteInsertion(rows, { x: 100, y: 780 })!.following.length, 0);
  assert.equal(imageNoteInsertion(rows, { x: 550, y: 250 }), null, "notes are not insertion columns");
  assert.equal(imageNoteInsertion(rows, { x: 100, y: 1100 }), null);
  assert.equal(imageNoteInsertion(rows.map(node => ({ ...node, hidden: true })), { x: 100, y: 250 }), null);
});


test("image rows grow for tall notes, close on shrink, and retain every column's offset", () => {
  const rows = [0,268,536].flatMap((y,i) => [
    positionedNode(`i${i}`, "image", 0,y,300,180,{ imageNotesBatchId: "batch" }),
    positionedNode(`n${i}`, "shape", 350,y,400,220,{ imageNotesFor: `${i}.png`,noteForNodeId:`i${i}` }),
    positionedNode(`extra${i}`, "shape", 782,y+8,250,200,{ imageNotesFor: `${i}.png`,noteForNodeId:`i${i}` }),
  ]);
  const tall = rows.map(node => node.id === "n0" ? {...node,style:{width:400,height:500}} : node);
  const flowed = reflowImageNoteRows(rows,tall);
  assert.equal(flowed.find(node=>node.id==="i1")!.position.y,548);
  assert.equal(flowed.find(node=>node.id==="extra1")!.position.y,556);
  assert.equal(flowed.find(node=>node.id==="i2")!.position.y,816);
  assert.deepEqual(flowed[0],rows[0],"image itself is not resized");
  const shrunk = flowed.map(node => node.id==="n0" ? rows[1] : node);
  assert.deepEqual(reflowImageNoteRows(flowed,shrunk),rows);
  const wider = rows.map(node => node.id==="n0" ? {...node,style:{width:600,height:220}} : node);
  assert.equal(reflowImageNoteRows(rows,wider).find(node=>node.id==="extra0")!.position.x,982);
  assert.deepEqual(new Set(planNodeDragMovement(rows,[],"extra0",["extra0"]).movingIds),new Set(["i0","n0","extra0"]));
  const partial = rows.filter(node => node.id!=="n0");
  assert.deepEqual(closeDeletedImageNoteGaps(rows,partial),partial);
  const removed = closeDeletedImageNoteGaps(rows,rows.filter(node=>!["i0","n0","extra0"].includes(node.id)));
  assert.equal(removed.find(node=>node.id==="i1")!.position.y,0);
  const inserted = imageNoteInsertion(flowed,{x:100,y:520})!;
  assert.equal(inserted.reference.image.id,"i1");
  assert.equal(inserted.y,548);
  assert.equal(inserted.following[0].notes.length,2);
});

test("row resizing respects locked rows and leaves ordinary movement alone",()=>{
  const rows = [0,268,536].flatMap((y,i)=>[
    positionedNode(`i${i}`,"image",0,y,300,180,{imageNotesBatchId:"batch",...(i===1?{layerId:"locked"}:{})}),
    positionedNode(`n${i}`,"shape",350,y,400,220,{imageNotesFor:`${i}.png`,noteForNodeId:`i${i}`}),
  ]);
  const changed=rows.map(node=>node.id==="n0"?{...node,style:{width:400,height:500}}:node);
  assert.equal(reflowImageNoteRows(rows,changed,new Set(["locked"]))[2].position.y,268);
  assert.equal(reflowImageNoteRows(rows,changed,new Set(["locked"]))[4].position.y,536);
  const moved=rows.map(node=>node.id==="n0"?{...node,position:{x:700,y:22}}:node);
  assert.deepEqual(reflowImageNoteRows(rows,moved),moved);
});
