import { MindMapNode } from "./MindMapNode";
import { StickyNoteNode } from "./StickyNoteNode";
import { TextBlockNode } from "./TextBlockNode";
import { ShapeNode } from "./ShapeNode";
import { SanskritCardNode } from "./SanskritCardNode";
import { ShlokaCardNode } from "./ShlokaCardNode";
import { GrammarCardNode } from "./GrammarCardNode";
import { FrameNode } from "./FrameNode";

export const nodeTypes = {
  mindmap: MindMapNode,
  sticky: StickyNoteNode,
  text: TextBlockNode,
  shape: ShapeNode,
  sanskrit: SanskritCardNode,
  shloka: ShlokaCardNode,
  grammar: GrammarCardNode,
  frame: FrameNode,
};

export {
  MindMapNode,
  StickyNoteNode,
  TextBlockNode,
  ShapeNode,
  SanskritCardNode,
  ShlokaCardNode,
  GrammarCardNode,
  FrameNode,
};
