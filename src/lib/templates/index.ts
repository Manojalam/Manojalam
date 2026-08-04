import { BOARD_CONTENT_VERSION } from "../config";
import { DEFAULT_BOARD_SETTINGS, type BoardContent, type ShapeType, type TemplateDefinition } from "../types";
import { generateId } from "../utils";

export const TEMPLATE_CATEGORIES = [
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

function center(id: string, text: string, x = 400, y = 300) {
  return shape(id, text, x, y, "#6366f1", "rounded", 200);
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

function edge(source: string, target: string, label?: string) {
  return {
    id: generateId(),
    source,
    target,
    type: "branch",
    data: label
      ? { label, edgeType: "branch" as const }
      : { edgeType: "branch" as const },
  };
}

function groupedTreeContent(
  rootLabel: string,
  groups: Array<{ label: string; children: string[]; color?: string }>
): BoardContent {
  const rootId = generateId();
  const rootNode = center(rootId, rootLabel, 420, 80);
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

const templates: TemplateDefinition[] = [
  {
    id: "basic-mindmap",
    name: "Mind Map",
    description: "Grow two-sided branches outward from one central idea.",
    category: "general",
    content: (() => {
      const root = generateId();
      const branches = [
        { id: generateId(), label: "What", x: 116, y: 243, side: "left" as const },
        { id: generateId(), label: "Why", x: 704, y: 243, side: "right" as const },
        { id: generateId(), label: "How", x: 116, y: 357, side: "left" as const },
        { id: generateId(), label: "Next steps", x: 704, y: 357, side: "right" as const },
      ];
      const rootNode = center(root, "Main idea");
      return makeContent(
        [
          { ...rootNode, data: { ...rootNode.data, layoutMode: "mindMap" as const } },
          ...branches.map((item) => {
            const node = branch(item.id, item.label, item.x, item.y);
            return { ...node, data: { ...node.data, mindMapSide: item.side } };
          }),
        ],
        branches.map((item) => edge(root, item.id))
      );
    })(),
  },
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
          shape(start, "Start", 400, 60, "#6366f1", "capsule"),
          shape(process, "Process", 400, 210, "#0284c7", "rectangle"),
          shape(decision, "Decision?", 400, 360, "#d97706", "diamond", 200),
          shape(yes, "Continue", 150, 540, "#059669", "rectangle"),
          shape(no, "Revise", 650, 540, "#dc2626", "rectangle"),
          shape(end, "Complete", 400, 720, "#6366f1", "capsule"),
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
          center(topic, "Topic", 400, 80),
          branch(cues, "Cues / questions", 100, 280, "#d97706"),
          branch(notes, "Notes", 400, 280, "#6366f1"),
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
          branch(examples, "Examples", 400, 540, "#d97706"),
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
    id: "timeline",
    name: "Timeline",
    description: "Lay out four sequential events or milestones.",
    category: "planning",
    content: (() => {
      const events = ["Event 1", "Event 2", "Event 3", "Event 4"].map((label, index) => ({
        id: generateId(),
        label,
        x: 80 + index * 240,
      }));
      return makeContent(
        events.map((event) => shape(event.id, event.label, event.x, 300, "#6366f1", "capsule")),
        events.slice(0, -1).map((event, index) => edge(event.id, events[index + 1].id))
      );
    })(),
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
      const shloka = generateId();
      const sections = [
        { label: "Padaccheda", x: 40, y: 500 },
        { label: "Anvaya", x: 280, y: 500 },
        { label: "Padārtha", x: 520, y: 500 },
        { label: "Translation", x: 760, y: 500 },
        { label: "Grammar", x: 40, y: 680 },
        { label: "Chandas", x: 280, y: 680 },
        { label: "Notes", x: 520, y: 680 },
        { label: "Memorization", x: 760, y: 680 },
      ].map((section) => ({ ...section, id: generateId() }));
      return makeContent(
        [
          center(topic, "Śloka title", 390, 60),
          {
            id: shloka,
            type: "shloka",
            position: { x: 310, y: 210 },
            style: { width: 360, height: 190 },
            data: {
              title: "Verse",
              devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे",
              iast: "dharmakṣetre kurukṣetre",
              memorizationStatus: "new",
              tags: ["स्मरणम्"],
            },
          },
          ...sections.map((section) => branch(section.id, section.label, section.x, section.y, "#d97706")),
        ],
        [edge(topic, shloka), ...sections.map((section) => edge(shloka, section.id))]
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
          center(topic, "Grammar topic", 400, 60),
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
