import { BOARD_CONTENT_VERSION } from "../config";
import {
  DEFAULT_BOARD_SETTINGS,
  type BoardContent,
  type LayoutMode,
  type ShapeType,
  type ShlokaCardNodeData,
  type ShlokaStudySection,
  type TemplateDefinition,
} from "../types";
import { generateId } from "../utils";

export const TEMPLATE_CATEGORIES = [
  { id: "layouts", label: "Layouts" },
  { id: "general", label: "General" },
  { id: "study", label: "Study" },
  { id: "planning", label: "Planning" },
  { id: "sanskrit", label: "Sanskrit" },
] as const satisfies ReadonlyArray<{
  id: TemplateDefinition["category"];
  label: string;
}>;

export function isTemplateCategory(value: string): value is TemplateDefinition["category"] {
  return TEMPLATE_CATEGORIES.some((category) => category.id === value);
}

function makeContent(
  nodes: BoardContent["nodes"],
  edges: BoardContent["edges"] = []
): BoardContent {
  return {
    version: BOARD_CONTENT_VERSION,
    nodes,
    edges,
    relationships: [],
    relationshipFans: [],
    viewport: { x: 0, y: 0, zoom: 0.8 },
    settings: { ...DEFAULT_BOARD_SETTINGS },
  };
}

function shape(
  id: string,
  text: string,
  x: number,
  y: number,
  color = "#818cf8",
  shapeType: ShapeType = "rounded",
  width = 180
) {
  return {
    id,
    type: "shape" as const,
    position: { x, y },
    style: { width, height: shapeType === "diamond" ? 160 : 80 },
    data: {
      shapeType,
      text,
      scriptMode: "plain" as const,
      color,
      tags: [],
    },
  };
}

function shapeAtCenterX(
  id: string,
  text: string,
  centerX: number,
  y: number,
  color = "#818cf8",
  shapeType: ShapeType = "rounded",
  width = 180
) {
  return shape(id, text, centerX - width / 2, y, color, shapeType, width);
}

function center(id: string, text: string, centerX = 500, y = 300) {
  return shapeAtCenterX(id, text, centerX, y, "#6366f1", "rounded", 200);
}

function branch(
  id: string,
  text: string,
  x: number,
  y: number,
  color = "#818cf8"
) {
  return shape(id, text, x, y, color);
}

function sticky(id: string, text: string, x: number, y: number, color: string) {
  return {
    id,
    type: "sticky" as const,
    position: { x, y },
    style: { width: 220, height: 120 },
    data: { text, scriptMode: "plain" as const, color, tags: [] },
  };
}

function shlokaStudyCard(
  id: string,
  studySection: ShlokaStudySection,
  title: string,
  content: Partial<ShlokaCardNodeData>,
  x: number,
  y: number,
  width = 270,
  height = 180
) {
  return {
    id,
    type: "shloka" as const,
    position: { x, y },
    style: { width, height },
    data: {
      title,
      devanagari: "",
      iast: "",
      memorizationStatus: "new" as const,
      tags: [],
      studySection,
      ...content,
    },
  };
}

function edge(source: string, target: string, label?: string) {
  return {
    id: generateId(),
    source,
    target,
    type: "branch",
    data: label
      ? { label, edgeType: "branch" as const, curveStyle: "step" as const }
      : { edgeType: "branch" as const, curveStyle: "step" as const },
  };
}

type LayoutTemplateNode = {
  key: string;
  label: string;
  x: number;
  y: number;
  parentKey?: string;
  color?: string;
  shapeType?: ShapeType;
  width?: number;
  mindMapSide?: "left" | "right";
};

/**
 * Build a persisted hierarchy using the same layout metadata as the editor.
 * The authored positions make the gallery preview useful before hydration;
 * the metadata keeps every example editable by its corresponding layout.
 */
function layoutTemplateContent(
  mode: LayoutMode,
  rootKey: string,
  specs: LayoutTemplateNode[]
): BoardContent {
  const ids = new Map(specs.map((spec) => [spec.key, generateId()]));
  const childrenByKey = new Map<string, string[]>();
  for (const spec of specs) {
    if (!spec.parentKey) continue;
    childrenByKey.set(spec.parentKey, [
      ...(childrenByKey.get(spec.parentKey) ?? []),
      spec.key,
    ]);
  }

  const rootId = ids.get(rootKey);
  const rootSpec = specs.find((spec) => spec.key === rootKey);
  if (!rootId || !rootSpec) throw new Error(`Missing layout template root: ${rootKey}`);

  const sunburstEnabled = mode === "radial";
  const nodes = specs.map((spec) => {
    const id = ids.get(spec.key)!;
    const parentId = spec.parentKey ? ids.get(spec.parentKey) ?? null : null;
    const node = shape(
      id,
      spec.label,
      spec.x,
      spec.y,
      spec.color ?? (spec.key === rootKey ? "#4f46e5" : "#818cf8"),
      spec.shapeType ?? "rounded",
      spec.width ?? (spec.key === rootKey ? 200 : 180)
    );
    return {
      ...node,
      hidden: sunburstEnabled,
      data: {
        ...node.data,
        parentId,
        childOrder: (childrenByKey.get(spec.key) ?? []).map((key) => ids.get(key)!),
        ...(spec.key === rootKey ? { layoutMode: mode } : {}),
        ...(spec.mindMapSide ? { mindMapSide: spec.mindMapSide } : {}),
        ...(sunburstEnabled ? { sunburstHiddenFor: rootId } : {}),
      },
    };
  });

  const edges = specs.flatMap((spec) => {
    if (!spec.parentKey) return [];
    const parentId = ids.get(spec.parentKey);
    const id = ids.get(spec.key);
    if (!parentId || !id) return [];
    const item = edge(parentId, id);
    const hiddenInMatrix = mode === "matrix";
    const hiddenInSunburst = sunburstEnabled;
    return [{
      ...item,
      hidden: hiddenInMatrix || hiddenInSunburst,
      data: {
        ...item.data,
        layoutMode: mode,
        curveStyle: mode === "radial" || mode === "fromParentFreeForm" ? "smooth" as const : "step" as const,
        hiddenInMatrix,
        hiddenInMatrixFor: hiddenInMatrix ? rootId : undefined,
        hiddenInSunburst,
        hiddenInSunburstFor: hiddenInSunburst ? rootId : undefined,
      },
    }];
  });

  if (!sunburstEnabled) return makeContent(nodes, edges);

  const chartSize = 800;
  const rootNode = nodes.find((node) => node.id === rootId)!;
  const rootCenter = {
    x: rootNode.position.x + Number(rootNode.style?.width) / 2,
    y: rootNode.position.y + Number(rootNode.style?.height) / 2,
  };
  return makeContent([
    ...nodes,
    {
      id: `sunburst-${rootId}`,
      type: "sunburst",
      position: {
        x: rootCenter.x - chartSize / 2,
        y: rootCenter.y - chartSize / 2,
      },
      style: { width: chartSize, height: chartSize },
      data: {
        rootId,
        sunburstFor: rootId,
        chartSize,
        title: rootSpec.label,
        locked: false,
        tags: [],
      },
    },
  ], edges);
}

function groupedTreeContent(
  rootLabel: string,
  groups: Array<{ label: string; children: string[]; color?: string }>
): BoardContent {
  const rootId = generateId();
  const firstGroupCenterX = 80 + 180 / 2;
  const lastGroupCenterX = firstGroupCenterX + Math.max(0, groups.length - 1) * 320;
  const rootNode = center(rootId, rootLabel, (firstGroupCenterX + lastGroupCenterX) / 2, 80);
  const nodes: BoardContent["nodes"] = [{
    ...rootNode,
    data: { ...rootNode.data, layoutMode: "vertical" as const },
  }];
  const edges: BoardContent["edges"] = [];

  groups.forEach((group, groupIndex) => {
    const groupId = generateId();
    const x = 80 + groupIndex * 320;
    nodes.push(branch(groupId, group.label, x, 260, group.color ?? "#6366f1"));
    edges.push(edge(rootId, groupId));
    group.children.forEach((label, childIndex) => {
      const childId = generateId();
      nodes.push(branch(childId, label, x, 440 + childIndex * 110, group.color ?? "#818cf8"));
      edges.push(edge(groupId, childId));
    });
  });

  return makeContent(nodes, edges);
}

const layoutTemplates: TemplateDefinition[] = [
  {
    id: "layout-free-form",
    name: "Free Form Canvas",
    description: "Arrange connected ideas freely without automatic alignment.",
    category: "layouts",
    content: layoutTemplateContent("freeForm", "root", [
      { key: "root", label: "Research question", x: 430, y: 270 },
      { key: "notes", label: "Source notes", parentKey: "root", x: 60, y: 80, color: "#0ea5e9" },
      { key: "insights", label: "Key insight", parentKey: "root", x: 720, y: 70, color: "#8b5cf6" },
      { key: "quotes", label: "Useful quotes", parentKey: "root", x: 100, y: 500, color: "#d97706" },
      { key: "questions", label: "Open questions", parentKey: "root", x: 760, y: 480, color: "#059669" },
      { key: "follow-up", label: "Follow-up", parentKey: "questions", x: 480, y: 680, color: "#14b8a6" },
    ]),
  },
  {
    id: "basic-mindmap",
    name: "Mind Map",
    description: "Grow two-sided branches outward from one central idea.",
    category: "layouts",
    content: layoutTemplateContent("mindMap", "root", [
      { key: "root", label: "Main idea", x: 400, y: 300 },
      { key: "what", label: "What", parentKey: "root", x: 116, y: 243, mindMapSide: "left" },
      { key: "why", label: "Why", parentKey: "root", x: 704, y: 243, mindMapSide: "right" },
      { key: "how", label: "How", parentKey: "root", x: 116, y: 357, mindMapSide: "left" },
      { key: "next", label: "Next steps", parentKey: "root", x: 704, y: 357, mindMapSide: "right" },
    ]),
  },
  {
    id: "layout-radial-branches",
    name: "Radial Branches",
    description: "Spread a connected hierarchy around one central topic.",
    category: "layouts",
    content: layoutTemplateContent("fromParentFreeForm", "root", [
      { key: "root", label: "Brainstorm", x: 410, y: 310 },
      { key: "audience", label: "Audience", parentKey: "root", x: 420, y: 40, color: "#0ea5e9" },
      { key: "needs", label: "Needs", parentKey: "root", x: 730, y: 130, color: "#8b5cf6" },
      { key: "ideas", label: "Ideas", parentKey: "root", x: 800, y: 310, color: "#ec4899" },
      { key: "risks", label: "Risks", parentKey: "root", x: 730, y: 490, color: "#d97706" },
      { key: "actions", label: "Actions", parentKey: "root", x: 420, y: 600, color: "#059669" },
      { key: "evidence", label: "Evidence", parentKey: "root", x: 40, y: 310, color: "#14b8a6" },
      { key: "interviews", label: "Interviews", parentKey: "needs", x: 920, y: 20, color: "#a78bfa" },
      { key: "prototype", label: "Prototype", parentKey: "actions", x: 650, y: 730, color: "#34d399" },
    ]),
  },
  {
    id: "layout-horizontal-tree",
    name: "Horizontal Tree",
    description: "Show levels of a hierarchy growing from left to right.",
    category: "layouts",
    content: layoutTemplateContent("horizontal", "root", [
      { key: "root", label: "Organization", x: 40, y: 300 },
      { key: "product", label: "Product", parentKey: "root", x: 360, y: 80, color: "#2563eb" },
      { key: "operations", label: "Operations", parentKey: "root", x: 360, y: 300, color: "#7c3aed" },
      { key: "growth", label: "Growth", parentKey: "root", x: 360, y: 520, color: "#059669" },
      { key: "design", label: "Design", parentKey: "product", x: 680, y: 20, color: "#60a5fa" },
      { key: "engineering", label: "Engineering", parentKey: "product", x: 680, y: 150, color: "#60a5fa" },
      { key: "finance", label: "Finance", parentKey: "operations", x: 680, y: 300, color: "#a78bfa" },
      { key: "people", label: "People", parentKey: "operations", x: 680, y: 390, color: "#a78bfa" },
      { key: "marketing", label: "Marketing", parentKey: "growth", x: 680, y: 520, color: "#34d399" },
      { key: "sales", label: "Sales", parentKey: "growth", x: 680, y: 630, color: "#34d399" },
    ]),
  },
  {
    id: "layout-vertical-tree",
    name: "Vertical Tree",
    description: "Fan a balanced hierarchy downward from a single root.",
    category: "layouts",
    content: layoutTemplateContent("vertical", "root", [
      { key: "root", label: "Course", x: 430, y: 40 },
      { key: "foundation", label: "Foundations", parentKey: "root", x: 90, y: 250, color: "#2563eb" },
      { key: "practice", label: "Practice", parentKey: "root", x: 440, y: 250, color: "#7c3aed" },
      { key: "mastery", label: "Mastery", parentKey: "root", x: 790, y: 250, color: "#059669" },
      { key: "read", label: "Read", parentKey: "foundation", x: 20, y: 450, color: "#60a5fa" },
      { key: "review", label: "Review", parentKey: "foundation", x: 200, y: 450, color: "#60a5fa" },
      { key: "exercise", label: "Exercises", parentKey: "practice", x: 370, y: 450, color: "#a78bfa" },
      { key: "project", label: "Project", parentKey: "practice", x: 550, y: 450, color: "#a78bfa" },
      { key: "assess", label: "Assessment", parentKey: "mastery", x: 720, y: 450, color: "#34d399" },
      { key: "reflect", label: "Reflection", parentKey: "mastery", x: 900, y: 450, color: "#34d399" },
    ]),
  },
  {
    id: "layout-list",
    name: "Outline List",
    description: "Turn a hierarchy into a compact, indented outline.",
    category: "layouts",
    content: layoutTemplateContent("list", "root", [
      { key: "root", label: "Meeting notes", x: 100, y: 40, width: 240 },
      { key: "context", label: "1. Context", parentKey: "root", x: 210, y: 180, color: "#2563eb", width: 220 },
      { key: "goal", label: "Goal and background", parentKey: "context", x: 320, y: 290, color: "#60a5fa", width: 240 },
      { key: "discussion", label: "2. Discussion", parentKey: "root", x: 210, y: 420, color: "#7c3aed", width: 220 },
      { key: "option-a", label: "Option A", parentKey: "discussion", x: 320, y: 530, color: "#a78bfa" },
      { key: "option-b", label: "Option B", parentKey: "discussion", x: 320, y: 640, color: "#a78bfa" },
      { key: "actions", label: "3. Actions", parentKey: "root", x: 210, y: 770, color: "#059669", width: 220 },
      { key: "owner", label: "Owner and due date", parentKey: "actions", x: 320, y: 880, color: "#34d399", width: 240 },
    ]),
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Place sequential events on one connected line.",
    category: "layouts",
    content: layoutTemplateContent("linear", "start", [
      { key: "start", label: "Discover", x: 60, y: 300, shapeType: "capsule" },
      { key: "define", label: "Define", parentKey: "start", x: 310, y: 300, color: "#2563eb", shapeType: "capsule" },
      { key: "build", label: "Build", parentKey: "define", x: 560, y: 300, color: "#7c3aed", shapeType: "capsule" },
      { key: "launch", label: "Launch", parentKey: "build", x: 810, y: 300, color: "#059669", shapeType: "capsule" },
    ]),
  },
  {
    id: "layout-sunburst",
    name: "Topic Sunburst",
    description: "Explore a hierarchy as concentric, color-coded sectors.",
    category: "layouts",
    content: layoutTemplateContent("radial", "root", [
      { key: "root", label: "Knowledge map", x: 400, y: 460 },
      { key: "people", label: "People", parentKey: "root", x: 150, y: 250, color: "#2563eb" },
      { key: "process", label: "Process", parentKey: "root", x: 650, y: 250, color: "#7c3aed" },
      { key: "tools", label: "Tools", parentKey: "root", x: 150, y: 650, color: "#d97706" },
      { key: "outcomes", label: "Outcomes", parentKey: "root", x: 650, y: 650, color: "#059669" },
      { key: "roles", label: "Roles", parentKey: "people", x: 40, y: 100, color: "#60a5fa" },
      { key: "skills", label: "Skills", parentKey: "people", x: 250, y: 100, color: "#93c5fd" },
      { key: "inputs", label: "Inputs", parentKey: "process", x: 570, y: 100, color: "#a78bfa" },
      { key: "steps", label: "Steps", parentKey: "process", x: 780, y: 100, color: "#c4b5fd" },
      { key: "systems", label: "Systems", parentKey: "tools", x: 40, y: 800, color: "#fbbf24" },
      { key: "methods", label: "Methods", parentKey: "tools", x: 250, y: 800, color: "#fcd34d" },
      { key: "metrics", label: "Metrics", parentKey: "outcomes", x: 570, y: 800, color: "#34d399" },
      { key: "impact", label: "Impact", parentKey: "outcomes", x: 780, y: 800, color: "#6ee7b7" },
    ]),
  },
  {
    id: "layout-matrix",
    name: "Comparison Matrix",
    description: "Compare grouped topics in a structured table layout.",
    category: "layouts",
    content: layoutTemplateContent("matrix", "root", [
      { key: "root", label: "Options comparison", x: 120, y: 60, width: 720, shapeType: "rectangle" },
      { key: "option-a", label: "Option A", parentKey: "root", x: 120, y: 190, color: "#2563eb", width: 210, shapeType: "rectangle" },
      { key: "a-strength", label: "Strength", parentKey: "option-a", x: 360, y: 190, color: "#60a5fa", width: 220, shapeType: "rectangle" },
      { key: "a-tradeoff", label: "Trade-off", parentKey: "option-a", x: 600, y: 190, color: "#93c5fd", width: 220, shapeType: "rectangle" },
      { key: "option-b", label: "Option B", parentKey: "root", x: 120, y: 310, color: "#7c3aed", width: 210, shapeType: "rectangle" },
      { key: "b-strength", label: "Strength", parentKey: "option-b", x: 360, y: 310, color: "#a78bfa", width: 220, shapeType: "rectangle" },
      { key: "b-tradeoff", label: "Trade-off", parentKey: "option-b", x: 600, y: 310, color: "#c4b5fd", width: 220, shapeType: "rectangle" },
      { key: "option-c", label: "Option C", parentKey: "root", x: 120, y: 430, color: "#059669", width: 210, shapeType: "rectangle" },
      { key: "c-strength", label: "Strength", parentKey: "option-c", x: 360, y: 430, color: "#34d399", width: 220, shapeType: "rectangle" },
      { key: "c-tradeoff", label: "Trade-off", parentKey: "option-c", x: 600, y: 430, color: "#6ee7b7", width: 220, shapeType: "rectangle" },
    ]),
  },
];

const templates: TemplateDefinition[] = [
  ...layoutTemplates,
  {
    id: "flowchart",
    name: "Flowchart",
    description: "Map a process with a decision, two paths, and an outcome.",
    category: "general",
    content: (() => {
      const start = generateId();
      const process = generateId();
      const decision = generateId();
      const yes = generateId();
      const no = generateId();
      const end = generateId();
      return makeContent(
        [
          shapeAtCenterX(start, "Start", 490, 60, "#6366f1", "capsule"),
          shapeAtCenterX(process, "Process", 490, 210, "#0284c7", "rectangle"),
          shapeAtCenterX(decision, "Decision?", 490, 360, "#d97706", "diamond", 200),
          shape(yes, "Continue", 150, 540, "#059669", "rectangle"),
          shape(no, "Revise", 650, 540, "#dc2626", "rectangle"),
          shapeAtCenterX(end, "Complete", 490, 720, "#6366f1", "capsule"),
        ],
        [
          edge(start, process),
          edge(process, decision),
          edge(decision, yes, "Yes"),
          edge(decision, no, "No"),
          edge(yes, end),
          edge(no, end),
        ]
      );
    })(),
  },
  {
    id: "cornell-notes",
    name: "Cornell Notes",
    description: "Capture cues, detailed notes, and a concise summary.",
    category: "study",
    content: (() => {
      const topic = generateId();
      const cues = generateId();
      const notes = generateId();
      const summary = generateId();
      return makeContent(
        [
          center(topic, "Topic", 500, 80),
          branch(cues, "Cues / questions", 100, 280, "#d97706"),
          shapeAtCenterX(notes, "Notes", 500, 280, "#6366f1"),
          branch(summary, "Summary", 700, 500, "#059669"),
        ],
        [edge(topic, cues), edge(topic, notes), edge(notes, summary)]
      );
    })(),
  },
  {
    id: "concept-map",
    name: "Concept Map",
    description: "Connect a core concept to evidence, examples, and a cross-link.",
    category: "study",
    content: (() => {
      const core = generateId();
      const definition = generateId();
      const evidence = generateId();
      const examples = generateId();
      return makeContent(
        [
          center(core, "Core concept"),
          branch(definition, "Definition", 100, 120, "#4f46e5"),
          branch(evidence, "Evidence", 700, 120, "#0284c7"),
          shapeAtCenterX(examples, "Examples", 500, 540, "#d97706"),
        ],
        [
          edge(core, definition),
          edge(core, evidence),
          edge(core, examples),
          edge(evidence, examples, "supports"),
        ]
      );
    })(),
  },
  {
    id: "study-plan",
    name: "Study Plan",
    description: "Organize learning, practice, and review milestones.",
    category: "study",
    content: groupedTreeContent("Study plan", [
      { label: "Learn", children: ["Topic 1", "Topic 2", "Topic 3"], color: "#2563eb" },
      { label: "Practice", children: ["Exercises", "Recall", "Teach back"], color: "#7c3aed" },
      { label: "Review", children: ["Weekly check", "Mock test", "Reflection"], color: "#059669" },
    ]),
  },
  {
    id: "project-planning",
    name: "Project Plan",
    description: "Turn goals into deliverables, owners, risks, and milestones.",
    category: "planning",
    content: groupedTreeContent("Project", [
      { label: "Outcome", children: ["Goal", "Success metric", "Scope"], color: "#2563eb" },
      { label: "Delivery", children: ["Milestones", "Owners", "Resources"], color: "#7c3aed" },
      { label: "Readiness", children: ["Risks", "Dependencies", "Next action"], color: "#d97706" },
    ]),
  },
  {
    id: "kanban-lite",
    name: "Kanban Board",
    description: "Start with To do, In progress, and Done columns plus example cards.",
    category: "planning",
    content: (() => {
      const todo = generateId();
      const doing = generateId();
      const done = generateId();
      return makeContent([
        {
          id: todo,
          type: "frame",
          position: { x: 40, y: 80 },
          style: { width: 280, height: 540 },
          data: { title: "To do", color: "#6366f1", background: "#eef2ff", tags: [] },
        },
        {
          id: doing,
          type: "frame",
          position: { x: 360, y: 80 },
          style: { width: 280, height: 540 },
          data: { title: "In progress", color: "#d97706", background: "#fffbeb", tags: [] },
        },
        {
          id: done,
          type: "frame",
          position: { x: 680, y: 80 },
          style: { width: 280, height: 540 },
          data: { title: "Done", color: "#059669", background: "#ecfdf5", tags: [] },
        },
        sticky(generateId(), "Define the next task", 70, 170, "#c7d2fe"),
        sticky(generateId(), "Move active work here", 390, 170, "#fde68a"),
        sticky(generateId(), "Keep completed work visible", 710, 170, "#a7f3d0"),
      ]);
    })(),
  },
  {
    id: "shloka-study",
    name: "Śloka Study",
    description: "Study a verse through padaccheda, anvaya, meaning, meter, and recall.",
    category: "sanskrit",
    content: (() => {
      const topic = generateId();
      const verse = generateId();
      const sections = [
        {
          section: "padaccheda" as const,
          title: "Padaccheda",
          content: { padaccheda: "धर्म-क्षेत्रे, कुरु-क्षेत्रे, समवेताः, युयुत्सवः, मामकाः, पाण्डवाः, च, एव, किम्, अकुर्वत, सञ्जय" },
          x: 20,
          y: 500,
        },
        {
          section: "anvaya" as const,
          title: "Anvaya",
          content: { anvaya: "सञ्जय! धर्मक्षेत्रे कुरुक्षेत्रे समवेताः युयुत्सवः मामकाः पाण्डवाः च एव किम् अकुर्वत?" },
          x: 310,
          y: 500,
        },
        {
          section: "padartha" as const,
          title: "Padārtha",
          content: { padartha: "समवेताः — assembled; युयुत्सवः — wishing to fight; मामकाः — my sons; पाण्डवाः — the sons of Pāṇḍu" },
          x: 600,
          y: 500,
        },
        {
          section: "translation" as const,
          title: "Translation",
          content: { translation: "Dhṛtarāṣṭra asked: O Sañjaya, what did my sons and the sons of Pāṇḍu do when they assembled at sacred Kurukṣetra, eager to fight?" },
          x: 890,
          y: 500,
        },
        {
          section: "grammar" as const,
          title: "Grammar",
          content: { grammar: "धर्मक्षेत्रे / कुरुक्षेत्रे: locative singular. समवेताः / युयुत्सवः: nominative plural. अकुर्वत: imperfect, 3rd-person plural." },
          x: 20,
          y: 720,
        },
        {
          section: "chandas" as const,
          title: "Chandas",
          content: { chandas: "Anuṣṭubh (śloka): four pādas of eight syllables each." },
          x: 310,
          y: 720,
        },
        {
          section: "notes" as const,
          title: "Notes",
          content: { notes: "Opening verse of the Bhagavad Gītā. Dhṛtarāṣṭra addresses Sañjaya and contrasts ‘my sons’ with the Pāṇḍavas." },
          x: 600,
          y: 720,
        },
        {
          section: "memorization" as const,
          title: "Memorization",
          content: { memorizationStatus: "new" as const, memorizationNotes: "Recite one pāda at a time, then join all four without looking." },
          x: 890,
          y: 720,
        },
      ].map((section) => ({ ...section, id: generateId() }));
      return makeContent(
        [
          center(topic, "Bhagavad Gītā 1.1", 600, 50),
          shlokaStudyCard(
            verse,
            "verse",
            "Verse",
            {
              sourceText: "Bhagavad Gītā 1.1",
              devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥",
              iast: "dharmakṣetre kurukṣetre samavetā yuyutsavaḥ |\nmāmakāḥ pāṇḍavāścaiva kimakurvata sañjaya ||",
              tags: ["भगवद्गीता"],
            },
            390,
            190,
            420,
            230
          ),
          ...sections.map((section) => shlokaStudyCard(
            section.id,
            section.section,
            section.title,
            section.content,
            section.x,
            section.y
          )),
        ],
        [edge(topic, verse), ...sections.map((section) => edge(verse, section.id))]
      );
    })(),
  },
  {
    id: "vyakarana-rule",
    name: "Vyākaraṇa Rule",
    description: "Capture a grammar rule with examples, exceptions, and practice.",
    category: "sanskrit",
    content: (() => {
      const topic = generateId();
      const rule = generateId();
      const examples = generateId();
      const exceptions = generateId();
      const related = generateId();
      const practice = generateId();
      return makeContent(
        [
          center(topic, "Grammar topic", 500, 60),
          {
            id: rule,
            type: "grammar",
            position: { x: 350, y: 220 },
            style: { width: 300, height: 190 },
            data: {
              topic: "Rule name",
              category: "sandhi",
              rule: "Enter the sūtra or rule here",
              examples: ["Example 1", "Example 2"],
              tags: ["सन्धिः"],
            },
          },
          branch(examples, "Examples", 80, 500),
          branch(exceptions, "Exceptions", 320, 500),
          branch(related, "Related sūtras", 560, 500),
          branch(practice, "Practice", 800, 500),
        ],
        [
          edge(topic, rule),
          edge(rule, examples),
          edge(rule, exceptions),
          edge(rule, related),
          edge(rule, practice),
        ]
      );
    })(),
  },
  {
    id: "sanskrit-grammar-chart",
    name: "Sanskrit Grammar Chart",
    description: "A ready hierarchy for grammar topics, rules, and examples.",
    category: "sanskrit",
    content: groupedTreeContent("संस्कृतव्याकरणम्", [
      { label: "सन्धिः", children: ["स्वरसन्धिः", "व्यञ्जनसन्धिः", "विसर्गसन्धिः"], color: "#b45309" },
      { label: "समासः", children: ["तत्पुरुषः", "बहुव्रीहिः", "द्वन्द्वः"], color: "#0f766e" },
      { label: "प्रत्ययः", children: ["कृत्", "तद्धितः", "स्त्रीप्रत्ययः"], color: "#7c3aed" },
    ]),
  },
];

export function getAllTemplates(): TemplateDefinition[] {
  return templates;
}

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return templates.find((template) => template.id === id);
}

export function getTemplatesByCategory(
  category: TemplateDefinition["category"]
): TemplateDefinition[] {
  return templates.filter((template) => template.category === category);
}

export function instantiateTemplate(id: string): { title: string; content: BoardContent } | undefined {
  const template = getTemplateById(id);
  if (!template) return undefined;
  return {
    title: template.name,
    content: structuredClone(template.content),
  };
}
