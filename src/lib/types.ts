import type { Node, Edge, Viewport } from "@xyflow/react";

export type ScriptMode = "plain" | "devanagari" | "iast" | "mixed";
export type BoardStorageMode = "local" | "supabase";
export type SanskritDisplayMode = "devanagari" | "iast" | "both-stacked" | "both-side";
export type GrammarCategory =
  | "sandhi"
  | "samasa"
  | "vibhakti"
  | "tinganta"
  | "krdanta"
  | "taddhita"
  | "avyaya"
  | "chandas"
  | "alankara"
  | "other";
export type MemorizationStatus = "new" | "learning" | "memorized";
export type ShapeType =
  | "rectangle"
  | "rounded"
  | "circle"
  | "ellipse"
  | "diamond"
  | "capsule"
  | "callout"
  | "triangle"
  | "hexagon"
  | "star"
  | "arrow"
  | "parallelogram"
  | "trapezoid"
  | "document"
  | "database"
  | "predefinedProcess"
  | "delay"
  | "cloud"
  | "offPageConnector"
  | "flower"
  | "leaf";
export type CanvasTool =
  | "select"
  | "pan"
  | "mindmap"
  | "sticky"
  | "text"
  | "shape"
  | "connector"
  | "frame"
  | "pen"
  | "image"
  | "sanskrit"
  | "shloka"
  | "grammar";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
export type EdgeCurveStyle = "smooth" | "straight" | "step";
export type ConnectorPathStyle = "solid" | "dashed" | "dotted" | "double";
export type MatrixDensity = "compact" | "comfortable" | "presentation";
export type MatrixOrientation = "horizontal" | "vertical";
export type AutoSizeMode = "smart" | "height-only" | "fixed";

export type RadialColorScheme =
  | "spectrum"
  | "sanskrit"
  | "lotus"
  | "ocean"
  | "forest"
  | "scholar";

export interface LayoutVisualStyle {
  rootId: string;
  mode: LayoutMode;
  scheme: RadialColorScheme;
  depth: number;
  branchIndex: number;
  fillColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  borderWidth: number;
  borderStyle: "solid";
  fontSize: number;
}

export interface ActiveTextSelection {
  nodeId: string;
  hasSelection: boolean;
  bold: boolean;
  italic: boolean;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  highlightColor?: string;
  textAlign?: "left" | "center" | "right" | "justify";
}

export type InlineTextFormatKey =
  | "fontWeight"
  | "fontStyle"
  | "fontSize"
  | "fontFamily"
  | "textColor"
  | "textHighlightColor"
  | "textAlign";

export interface InlineTextFormatDetail {
  nodeId: string;
  key: InlineTextFormatKey;
  value: unknown;
}

export type LayoutMode =
  | "freeForm"
  | "fromParentFreeForm"
  | "horizontal"
  | "vertical"
  | "list"
  | "topDown"
  | "linear"
  | "radial"
  | "matrix";

export interface BoardSettings {
  background: "dots" | "grid" | "plain";
  theme: "light" | "dark" | "system";
  snapToGrid: boolean;
  defaultScriptMode: ScriptMode;
  defaultNodeColor: string;
  defaultFont: string;
  /** Board-wide default applied to shapes, notes, text blocks, and mind-map nodes. */
  defaultFontSize: number;
  canvasBackgroundColor?: string;
  gridColor?: string;
  gridSpacing?: number;
  /** Reusable connector-label shortcuts saved with this board. */
  connectorLabelPresets?: string[];
  /** @deprecated Legacy alias retained while old boards migrate. */
  gridSize?: number;
}

export interface NodeRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
}

export interface RelationshipFanState {
  sourceNodeId: string;
  relationType: string;
  visible: boolean;
  targetBranchNodeId?: string;
}

export interface RelationshipSelectionSession {
  sourceNodeId: string;
  relationType: string;
  chartRootNodeId: string;
  targetBranchNodeId?: string;
  draftTargetIds: string[];
}

export type RelationshipDiagramLayout =
  | "flower"
  | "matrix"
  | "card-grid"
  | "radial-hub"
  | "arc-fan";

export type RelationshipDiagramScopeMode =
  | "selected-node"
  | "selected-nodes"
  | "selected-branch";

export type RelationshipDiagramPalette =
  | "source"
  | "spectrum"
  | "warm"
  | "cool"
  | "pastel"
  | "monochrome";

export type RelationshipDiagramDensity = "compact" | "comfortable" | "spacious";

export type RelationshipDiagramSort = "natural" | "label-asc" | "label-desc";
export type RelationshipDiagramSourceSort = RelationshipDiagramSort | "count-asc" | "count-desc";
export type RelationshipDiagramTargetSort = RelationshipDiagramSort;

export type RelationshipDiagramDecorativeLevel = "minimal" | "balanced" | "ornate";

export interface RelationshipDiagramItemStyle {
  fillColor?: string;
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
  rotation?: number;
  /** Optional one-based manual petal layer used by the flower layout. */
  flowerLayer?: number;
}

export interface RelationshipDiagramScope {
  mode: RelationshipDiagramScopeMode;
  sourceNodeIds: string[];
  /** Hierarchy roots expanded when mode is `selected-branch`. */
  branchRootNodeIds?: string[];
  /** @deprecated Legacy single-root branch scope. */
  branchRootNodeId?: string;
  /** Optional originating chart, retained so the generation dialog can reopen in context. */
  chartRootNodeId?: string;
}

export interface RelationshipDiagramSpec {
  version: 1;
  layout: RelationshipDiagramLayout;
  scope: RelationshipDiagramScope;
  /** Empty or omitted by legacy data means all saved relationship types. */
  relationTypes: string[];
  title: string;
  subtitle: string;
  showCounts: boolean;
  showIcons: boolean;
  palette: RelationshipDiagramPalette;
  textSize: number;
  /** Grow relationship labels to the largest size that fits each layout region. */
  maximizeLabelText: boolean;
  density: RelationshipDiagramDensity;
  /** Legacy automatic-layer capacity retained for diagrams saved before layer-only controls. */
  flowerPetalsPerLayer: number;
  /** Global flower layer count. Legacy zero values are migrated when the flower is edited. */
  flowerLayerCount: number;
  decorativeLevel: RelationshipDiagramDecorativeLevel;
  /** CSS color for the diagram canvas; `transparent` preserves the board beneath it. */
  background: string;
  sortSources: RelationshipDiagramSourceSort;
  sortTargets: RelationshipDiagramTargetSort;
  /** Stable user-authored item order shared by every relationship layout. */
  itemOrder?: string[];
  /** Per-item presentation overrides shared by petals, cards, rows, and sectors. */
  itemStyles?: Record<string, RelationshipDiagramItemStyle>;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  fillOpacity?: number;
  /** Optional styling for the central hub used by flower and radial layouts. */
  centerFillColor?: string;
  centerBorderColor?: string;
  centerTextColor?: string;
  centerBorderWidth?: number;
}

export interface BoardContent {
  version: number;
  nodes: VidyaNode[];
  edges: VidyaEdge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
  viewport?: Viewport;
  settings: BoardSettings;
}

export interface VidyaBoard {
  id: string;
  userId?: string | null;
  title: string;
  description?: string | null;
  content: BoardContent;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  storageMode: BoardStorageMode;
}

export interface BorderLayer {
  id: string;
  color: string;
  width: number;
  /** Gap (px) between this layer and the previous one */
  offset?: number;
  style: "solid" | "dashed" | "dotted";
}

export type InternalFillKind = "free" | "rect" | "circle" | "ellipse" | "diamond" | "triangle";

export interface InternalFillRegion {
  id: string;
  /** Shape kind — defaults to "free" for legacy freeform regions */
  kind?: InternalFillKind;
  /** Freeform path points as 0–100 percentage values of the node's width/height */
  points?: Array<{ x: number; y: number }>;
  /** Bounding box (0–100 percentage) for predefined resizable shapes */
  rect?: { x: number; y: number; w: number; h: number };
  fillColor: string;
  opacity: number;
  createdAt?: string;
}

export interface ConcentricShapeLayer {
  id: string;
  shapeType?: ShapeType;
  /** Percentage inset from the outer node box. */
  inset?: number;
  fillColor?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  text?: string;
  textColor?: string;
  fontSize?: number;
}

export interface RadialChartSegment {
  id: string;
  text?: string;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
  textRotation?: number;
  /** Number of sections in the next ring. Zero merges this section through that ring. */
  childCount?: number;
  /** Allocation preserved while childCount is zero for a visual-only merge. */
  mergedChildCount?: number;
}

export interface RadialChartRing {
  id: string;
  segmentCount: number;
  rotation?: number;
  /** Relative radial width compared with the other rings. */
  thickness?: number;
  segments?: RadialChartSegment[];
}

export interface RadialChartData {
  enabled?: boolean;
  rotation?: number;
  segmentBorderColor?: string;
  segmentBorderWidth?: number;
  centerText?: string;
  centerColor?: string;
  centerTextColor?: string;
  centerFontSize?: number;
  centerRadius?: number;
  debugLabelBoxes?: boolean;
  rings?: RadialChartRing[];
}

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  color?: string;
  fillColor?: string;
  /** 0–1 opacity applied to fillColor (defaults to a soft ~0.18) */
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  /** Normalized 0-100 corner softness. */
  cornerRadiusPercent?: number;
  /** @deprecated Legacy pixel radius retained for old board compatibility. */
  borderRadius?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  /** Whole-object visual rotation. Kept separate from chart and item-level rotations. */
  objectRotation?: number;
  /** @deprecated Legacy whole-object rotation retained for old boards. */
  rotation?: number;
  borderLayers?: BorderLayer[];
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
  /** Grow rendered text to the largest size that fits the node's safe interior. */
  maximizeText?: boolean;
  textColor?: string;
  textHighlightColor?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  internalFillRegions?: InternalFillRegion[];
  tags?: string[];
  notes?: string;
  locked?: boolean;
  // ── Hierarchy / layout metadata ──
  /** Structural parent (source of the parent→child edge). null/undefined = root. */
  parentId?: string | null;
  /** Explicit sibling order (child node ids) for stable layouts. */
  childOrder?: string[];
  /** Layout mode last applied to this node's branch (set on the branch root). */
  layoutMode?: LayoutMode;
  /** Palette selected for non-radial hierarchy layouts. */
  layoutColorScheme?: RadialColorScheme;
  /** Generated presentation layer. Original node styling remains untouched underneath it. */
  layoutVisualStyle?: LayoutVisualStyle;
  /** Per-surface opt-outs set when a user explicitly changes a generated style. */
  layoutAutoFill?: boolean;
  layoutAutoBorder?: boolean;
  layoutAutoText?: boolean;
  layoutAutoTypography?: boolean;
  /** Keeps a manually dragged List node off generated rows until List is reapplied. */
  listManualOverride?: boolean;
  /** Spacing profile for the compact branch-column List layout. */
  listDensity?: "compact" | "comfortable";
  matrixDensity?: MatrixDensity;
  matrixDensityUserSet?: boolean;
  /** Direction in which this Matrix cell's descendants grow. Inherits from its parent. */
  matrixOrientation?: MatrixOrientation;
  /** Normal editable size retained while a structured layout owns the rendered cell size. */
  userSize?: { width: number; height: number };
  /** Controls how authored text and manually chosen node dimensions interact. */
  autoSizeMode?: AutoSizeMode;
  /** Render-only dimensions for the active structured layout. */
  layoutSizeOverride?: { mode: LayoutMode; width: number; height: number };
  /** Last DOM content measurement used for Matrix text wrapping and row reflow. */
  matrixIntrinsicSize?: { width: number; height: number; naturalWidth?: number; naturalHeight?: number; lineCount?: number; lineHeight?: number };
  /** Last rendered rich-text measurement used by editing and shape conversion. */
  intrinsicContentSize?: { width: number; height: number; naturalWidth?: number; naturalHeight?: number; lineCount?: number; lineHeight?: number };
  matrixCell?: boolean;
  matrixCellRole?: "header" | "category" | "cell";
  matrixRootId?: string;
  matrixColumn?: number;
  matrixRowStart?: number;
  matrixRowSpan?: number;
  matrixGridVisible?: boolean;
  groupId?: string;
  /** Radial-layout-only presentation overrides. */
  radialFillColor?: string;
  radialTextColor?: string;
  /** Relative rotation applied after the hierarchy radial label's automatic orientation. */
  radialTextRotation?: number;
  radialBorderColor?: string;
  radialBorderWidth?: number;
  radialBorderStyle?: "solid" | "dashed" | "dotted";
  /** Relative sibling allocation in hierarchy-driven radial layout. */
  radialWeight?: number;
  /** Radius of the hierarchy root as a percentage of the chart radius. */
  radialCenterRatio?: number;
  /** Relative radial thickness for each hierarchy depth, stored on the root. */
  radialRingWidths?: number[];
  /** Draw the computed long-axis label rectangles for visual verification. */
  radialDebugLabelBoxes?: boolean;
  /** Root-level palette inherited by every radial sector without a color override. */
  radialColorScheme?: RadialColorScheme;
}

export interface MindMapNodeData extends BaseNodeData {
  text: string;
  richText?: string;
  scriptMode: ScriptMode;
  collapsed?: boolean;
  parentId?: string;
}

export interface StickyNoteNodeData extends BaseNodeData {
  text: string;
  richText?: string;
}

export interface TextBlockNodeData extends BaseNodeData {
  text?: string;
  richText?: string;
  scriptMode: ScriptMode;
}

export interface ShapeNodeData extends BaseNodeData {
  shapeType: ShapeType;
  text?: string;
  petalCount?: number;
  concentricLayers?: ConcentricShapeLayer[];
  radialChart?: RadialChartData;
}

export interface SanskritCardNodeData extends BaseNodeData {
  title: string;
  source?: string;
  devanagari: string;
  iast: string;
  translation?: string;
  grammarNotes?: string;
  displayMode: SanskritDisplayMode;
}

export interface ShlokaCardNodeData extends BaseNodeData {
  title: string;
  sourceText?: string;
  devanagari: string;
  iast: string;
  padaccheda?: string;
  anvaya?: string;
  padartha?: string;
  translation?: string;
  chandas?: string;
  memorizationStatus: MemorizationStatus;
  collapsedSections?: string[];
}

export interface GrammarCardNodeData extends BaseNodeData {
  topic: string;
  category: GrammarCategory;
  rule: string;
  examples: string[];
  exceptions?: string;
}

export interface FrameNodeData extends BaseNodeData {
  title: string;
  background?: string;
  presentationOrder?: number;
  matrixFrameFor?: string;
}

export interface SunburstNodeData extends BaseNodeData {
  rootId: string;
  sunburstFor: string;
  chartSize?: number;
  title?: string;
  /** Gives every terminal sector the same angle, regardless of hierarchy depth. */
  radialEqualOutermostSegments?: boolean;
  /** Uses one intelligently fitted font size for all terminal sector labels. */
  radialEqualOutermostLabelSizes?: boolean;
}

export interface RelationshipDiagramNodeData extends BaseNodeData {
  relationshipDiagramSpec: RelationshipDiagramSpec;
}

export interface ConnectorJunctionNodeData extends BaseNodeData {
  connectorJunction: true;
  color?: string;
}

export interface VidyaEdgeData extends Record<string, unknown> {
  label?: string;
  color?: string;
  /** Generated hierarchy color. Explicit `color` continues to take precedence. */
  layoutColor?: string;
  layoutColorRootId?: string;
  layoutOriginalMarkerColor?: string | null;
  width?: number;
  /** Visual treatment for the connector path. `dashed` remains as a legacy fallback. */
  pathStyle?: ConnectorPathStyle;
  dashed?: boolean;
  hiddenInMatrix?: boolean;
  /** Matrix root that temporarily owns the hidden hierarchy edge. */
  hiddenInMatrixFor?: string;
  hiddenInSunburst?: boolean;
  hiddenInSunburstFor?: string;
  layoutMode?: LayoutMode;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  curveStyle?: EdgeCurveStyle;
  /** Render this as an individual flowchart connector instead of a shared layout bus. */
  manualRoute?: boolean;
  /** Keep the exact user-selected source and target handles when nodes move. */
  preserveHandles?: boolean;
  /** User-positioned anchors that turn the automatic route into an editable path. */
  waypoints?: Array<{ x: number; y: number }>;
  /** Distinguishes explicit bend controls from internal anchors created by segment dragging. */
  waypointOrigin?: "bend" | "segment-drag";
  /** Normalized distance along the rendered connector where its label is anchored. */
  labelPosition?: number;
  /** Segment that carries a logical junction connector's label. */
  labelPathEdgeId?: string;
  /** @deprecated Legacy free offset projected onto the connector when loaded. */
  labelOffset?: { x: number; y: number };
  /** Independent text color for the connector label. */
  labelColor?: string;
  /** Keep label and logical connector colors matched. */
  labelColorSynced?: boolean;
  labelFontFamily?: string;
  labelFontSize?: number;
  labelFontWeight?: "normal" | "bold";
  labelFontStyle?: "normal" | "italic";
  /** User-positioned offset for the selected connector's editing toolbar. */
  toolbarOffset?: { x: number; y: number };
  /** Internal route anchors retained only until a newly inserted junction moves. */
  junctionPreservedWaypoints?: boolean;
  /** User-authored bends to restore when temporary junction route anchors are released. */
  junctionUserWaypoints?: Array<{ x: number; y: number }>;
  edgeType?: "normal" | "arrow" | "labeled" | "branch" | "dashed" | "sanskrit";
}

export type VidyaNode = Node<
  | MindMapNodeData
  | StickyNoteNodeData
  | TextBlockNodeData
  | ShapeNodeData
  | SanskritCardNodeData
  | ShlokaCardNodeData
  | GrammarCardNodeData
  | FrameNodeData
  | SunburstNodeData
  | RelationshipDiagramNodeData
  | ConnectorJunctionNodeData
>;
export type VidyaEdge = Edge<VidyaEdgeData>;

export interface AppSettings {
  theme: "light" | "dark" | "system";
  defaultScriptMode: ScriptMode;
  defaultDevanagariFont: string;
  defaultIastFont: string;
  autosaveEnabled: boolean;
  defaultGrid: boolean;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: "general" | "sanskrit" | "study" | "planning";
  content: BoardContent;
}

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  background: "dots",
  theme: "system",
  snapToGrid: false,
  defaultScriptMode: "plain",
  defaultNodeColor: "#6366f1",
  defaultFont: "Inter",
  defaultFontSize: 14,
  canvasBackgroundColor: "#f0eeea",
  gridColor: "#d5d2cb",
  gridSpacing: 32,
  gridSize: 32,
  connectorLabelPresets: ["Yes", "No"],
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  defaultScriptMode: "plain",
  defaultDevanagariFont: "Noto Sans Devanagari",
  defaultIastFont: "Georgia",
  autosaveEnabled: true,
  defaultGrid: true,
};

export const SANSKRIT_TAG_SUGGESTIONS = [
  "सन्धिः",
  "समासः",
  "विभक्तिः",
  "धातुः",
  "तिङन्तम्",
  "कृदन्तम्",
  "तद्धितम्",
  "छन्दः",
  "अलङ्कारः",
  "अन्वयः",
  "पदार्थः",
  "भाष्यम्",
  "काव्यम्",
  "गीता",
  "रामायणम्",
  "भागवतम्",
  "स्मरणम्",
];

export const SANSKRIT_EDGE_LABELS = [
  "कारणम्",
  "उदाहरणम्",
  "विपरीतम्",
  "सम्बन्धः",
  "अन्वयः",
  "विभक्तिः",
  "सन्धिः",
  "समासः",
];
