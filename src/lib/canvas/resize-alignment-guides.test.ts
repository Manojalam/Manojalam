import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRect } from "../layout/geometry";
import { boardNodeRect, resizeAlignmentGuides } from "./resize-alignment-guides";
test("fixed edges do not mask moving edge and center matches", () => {
  const guides = resizeAlignmentGuides(createNodeRect("a", 10, 20, 200, 100), [createNodeRect("b", 10, 300, 200, 100)], 1);
  assert.deepEqual(guides.v, [10,110,210]); assert.deepEqual(guides.h, []);
});
test("guides disappear beyond tolerance and match touching edges", () => {
  const other = createNodeRect("b", 300, 300, 100, 100);
  assert.deepEqual(resizeAlignmentGuides(createNodeRect("a", 0, 0, 290, 290), [other], 4), {h:[],v:[]});
  assert.deepEqual(resizeAlignmentGuides(createNodeRect("a", 0, 0, 298, 298), [other], 4), {h:[300],v:[300]});
});
test("nested objects use parent board position", () => {
  const parent={id:"p",position:{x:500,y:200},data:{},style:{width:100,height:100}};
  const child={id:"c",parentId:"p",position:{x:20,y:30},data:{},style:{width:40,height:50}};
  assert.deepEqual(boardNodeRect(child,[parent,child]), createNodeRect("c",520,230,40,50));
});
