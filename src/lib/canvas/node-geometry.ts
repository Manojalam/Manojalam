/**
 * Canvas-facing geometry API. Layout, routing, conversion, and collision code
 * share the implementation in layout/geometry so dimensions have one priority.
 */
export {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  createNodeRect,
  getNodeDimensions as getNodeSize,
  getNodeDimensions,
  getNodeRect,
  inflateRect,
  nodePositionFromTopLeft,
  rectsOverlap,
  resizeAroundAnchor,
  segmentIntersectsRect,
  sizeOf,
  type NodeDimensions as Size,
  type NodeRect as Rect,
  type Point,
  type ResizeAnchor,
} from "../layout/geometry";
