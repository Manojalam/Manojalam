import { generateId } from "@/lib/utils";
import {
  BOARD_CONTENT_VERSION,
} from "@/lib/config";
import { DEFAULT_BOARD_SETTINGS, type BoardContent, type TemplateDefinition } from "@/lib/types";

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

function center(id: string, text: string, x = 400, y = 300) {
  return {
    id,
    type: "mindmap" as const,
    position: { x, y },
    data: { text, scriptMode: "plain" as const, color: "#6366f1", tags: [] },
  };
}

function branch(
  id: string,
  text: string,
  x: number,
  y: number,
  color = "#818cf8"
) {
  return {
    id,
    type: "mindmap" as const,
    position: { x, y },
    data: { text, scriptMode: "plain" as const, color, tags: [] },
  };
}

function edge(source: string, target: string, label?: string) {
  return {
    id: generateId(),
    source,
    target,
    type: "branch",
    data: label ? { label, edgeType: "branch" as const } : { edgeType: "branch" as const },
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
    const x = 80 + groupIndex * 300;
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
    id: "blank",
    name: "Blank Board",
    description: "Start with an empty canvas and one central topic.",
    category: "general",
    content: makeContent([center(generateId(), "Central Topic")]),
  },
  {
    id: "basic-mindmap",
    name: "Basic Mind Map",
    description: "Central idea with four branches.",
    category: "general",
    content: (() => {
      const c = generateId();
      const b1 = generateId();
      const b2 = generateId();
      const b3 = generateId();
      const b4 = generateId();
      return makeContent(
        [
          center(c, "Main Idea", 400, 300),
          branch(b1, "Branch 1", 150, 150),
          branch(b2, "Branch 2", 650, 150),
          branch(b3, "Branch 3", 150, 450),
          branch(b4, "Branch 4", 650, 450),
        ],
        [edge(c, b1), edge(c, b2), edge(c, b3), edge(c, b4)]
      );
    })(),
  },
  {
    id: "cornell-notes",
    name: "Cornell Notes Map",
    description: "Cue, notes, and summary columns.",
    category: "study",
    content: (() => {
      const c = generateId();
      const cues = generateId();
      const notes = generateId();
      const summary = generateId();
      return makeContent(
        [
          center(c, "Topic", 400, 80),
          branch(cues, "Cues / Questions", 100, 250, "#f59e0b"),
          branch(notes, "Notes", 400, 250, "#6366f1"),
          branch(summary, "Summary", 700, 500, "#14b8a6"),
        ],
        [edge(c, cues), edge(c, notes), edge(notes, summary)]
      );
    })(),
  },
  {
    id: "study-chapter",
    name: "Study Chapter Map",
    description: "Key concepts, definitions, examples, review.",
    category: "study",
    content: (() => {
      const c = generateId();
      const k = generateId();
      const d = generateId();
      const e = generateId();
      const r = generateId();
      return makeContent(
        [
          center(c, "Chapter Title", 400, 200),
          branch(k, "Key Concepts", 150, 400),
          branch(d, "Definitions", 350, 400),
          branch(e, "Examples", 550, 400),
          branch(r, "Review Questions", 750, 400),
        ],
        [edge(c, k), edge(c, d), edge(c, e), edge(c, r)]
      );
    })(),
  },
  {
    id: "essay-planning",
    name: "Essay Planning Map",
    description: "Thesis, arguments, evidence, conclusion.",
    category: "planning",
    content: (() => {
      const c = generateId();
      const t = generateId();
      const a1 = generateId();
      const a2 = generateId();
      const con = generateId();
      return makeContent(
        [
          center(c, "Essay Topic", 400, 150),
          branch(t, "Thesis", 400, 300, "#6366f1"),
          branch(a1, "Argument 1", 200, 450),
          branch(a2, "Argument 2", 600, 450),
          branch(con, "Conclusion", 400, 600, "#14b8a6"),
        ],
        [edge(c, t), edge(t, a1), edge(t, a2), edge(a1, con), edge(a2, con)]
      );
    })(),
  },
  {
    id: "project-planning",
    name: "Project Planning Map",
    description: "Goals, tasks, timeline, resources.",
    category: "planning",
    content: (() => {
      const c = generateId();
      const g = generateId();
      const t = generateId();
      const tl = generateId();
      const res = generateId();
      return makeContent(
        [
          center(c, "Project Name", 400, 200),
          branch(g, "Goals", 150, 400),
          branch(t, "Tasks", 350, 400),
          branch(tl, "Timeline", 550, 400),
          branch(res, "Resources", 750, 400),
        ],
        [edge(c, g), edge(c, t), edge(c, tl), edge(c, res)]
      );
    })(),
  },
  {
    id: "cause-effect",
    name: "Cause & Effect Map",
    description: "Root causes and resulting effects.",
    category: "study",
    content: (() => {
      const effect = generateId();
      const c1 = generateId();
      const c2 = generateId();
      const c3 = generateId();
      return makeContent(
        [
          center(effect, "Effect / Outcome", 400, 300),
          branch(c1, "Cause 1", 150, 150),
          branch(c2, "Cause 2", 400, 100),
          branch(c3, "Cause 3", 650, 150),
        ],
        [edge(c1, effect), edge(c2, effect), edge(c3, effect)]
      );
    })(),
  },
  {
    id: "compare-contrast",
    name: "Compare & Contrast Map",
    description: "Two topics with similarities and differences.",
    category: "study",
    content: (() => {
      const topic = generateId();
      const a = generateId();
      const b = generateId();
      const sim = generateId();
      const diff = generateId();
      return makeContent(
        [
          center(topic, "Comparison Topic", 400, 100),
          branch(a, "Topic A", 200, 280),
          branch(b, "Topic B", 600, 280),
          branch(sim, "Similarities", 400, 450, "#14b8a6"),
          branch(diff, "Differences", 400, 600, "#f59e0b"),
        ],
        [edge(topic, a), edge(topic, b), edge(a, sim), edge(b, sim), edge(a, diff), edge(b, diff)]
      );
    })(),
  },
  {
    id: "timeline",
    name: "Timeline Map",
    description: "Sequential events on a timeline.",
    category: "planning",
    content: (() => {
      const e1 = generateId();
      const e2 = generateId();
      const e3 = generateId();
      const e4 = generateId();
      return makeContent(
        [
          branch(e1, "Event 1", 100, 300),
          branch(e2, "Event 2", 300, 300),
          branch(e3, "Event 3", 500, 300),
          branch(e4, "Event 4", 700, 300),
        ],
        [edge(e1, e2), edge(e2, e3), edge(e3, e4)]
      );
    })(),
  },
  {
    id: "concept-map",
    name: "Concept Map",
    description: "Interconnected concepts with cross-links.",
    category: "study",
    content: (() => {
      const main = generateId();
      const c1 = generateId();
      const c2 = generateId();
      const c3 = generateId();
      return makeContent(
        [
          center(main, "Core Concept", 400, 300),
          branch(c1, "Related Concept 1", 200, 150),
          branch(c2, "Related Concept 2", 600, 150),
          branch(c3, "Related Concept 3", 400, 500),
        ],
        [edge(main, c1), edge(main, c2), edge(main, c3), edge(c1, c3, "relates to")]
      );
    })(),
  },
  {
    id: "flowchart",
    name: "Flowchart",
    description: "Decision flow with yes/no branches.",
    category: "planning",
    content: (() => {
      const start = generateId();
      const decision = generateId();
      const yes = generateId();
      const no = generateId();
      const end = generateId();
      return makeContent(
        [
          {
            id: start,
            type: "shape",
            position: { x: 400, y: 100 },
            data: { shapeType: "capsule", text: "Start", color: "#6366f1", tags: [] },
          },
          {
            id: decision,
            type: "shape",
            position: { x: 380, y: 250 },
            data: { shapeType: "diamond", text: "Decision?", color: "#f59e0b", tags: [] },
          },
          branch(yes, "Yes path", 200, 400, "#14b8a6"),
          branch(no, "No path", 600, 400, "#ef4444"),
          {
            id: end,
            type: "shape",
            position: { x: 400, y: 550 },
            data: { shapeType: "capsule", text: "End", color: "#6366f1", tags: [] },
          },
        ],
        [edge(start, decision), edge(decision, yes, "Yes"), edge(decision, no, "No"), edge(yes, end), edge(no, end)]
      );
    })(),
  },
  {
    id: "kanban-lite",
    name: "Kanban-lite Board",
    description: "To Do, In Progress, Done columns as frames.",
    category: "planning",
    content: (() => {
      const todo = generateId();
      const doing = generateId();
      const done = generateId();
      return makeContent([
        {
          id: todo,
          type: "frame",
          position: { x: 50, y: 100 },
          style: { width: 280, height: 500 },
          data: { title: "To Do", color: "#6366f1", background: "#eef2ff", tags: [] },
        },
        {
          id: doing,
          type: "frame",
          position: { x: 380, y: 100 },
          style: { width: 280, height: 500 },
          data: { title: "In Progress", color: "#f59e0b", background: "#fffbeb", tags: [] },
        },
        {
          id: done,
          type: "frame",
          position: { x: 710, y: 100 },
          style: { width: 280, height: 500 },
          data: { title: "Done", color: "#14b8a6", background: "#f0fdfa", tags: [] },
        },
      ]);
    })(),
  },
  // Sanskrit templates
  {
    id: "shloka-study",
    name: "Śloka Study Map",
    description: "Verse study with padaccheda, anvaya, padārtha, and more.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const shloka = generateId();
      const branches = ["Text", "Padaccheda", "Anvaya", "Padārtha", "Translation", "Chandas", "Notes", "Memorization"].map(
        (label, i) => {
          const id = generateId();
          return { id, label, node: branch(id, label, 150 + i * 120, 450, "#d97706") };
        }
      );
      return makeContent(
        [
          center(c, "Śloka Title", 400, 150),
          {
            id: shloka,
            type: "shloka",
            position: { x: 300, y: 280 },
            data: {
              title: "Verse",
              devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे",
              iast: "dharmakṣetre kurukṣetre",
              memorizationStatus: "new",
              tags: ["स्मरणम्"],
            },
          },
          ...branches.map((b) => b.node),
        ],
        [edge(c, shloka), ...branches.map((b) => edge(shloka, b.id))]
      );
    })(),
  },
  {
    id: "vyakarana-rule",
    name: "Vyākaraṇa Rule Map",
    description: "Grammar rule with examples and exceptions.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const rule = generateId();
      const ex = generateId();
      const exc = generateId();
      const sutra = generateId();
      const practice = generateId();
      return makeContent(
        [
          center(c, "Grammar Topic", 400, 100),
          {
            id: rule,
            type: "grammar",
            position: { x: 300, y: 250 },
            data: {
              topic: "Rule Name",
              category: "sandhi",
              rule: "Enter the sūtra or rule here",
              examples: ["Example 1", "Example 2"],
              tags: ["सन्धिः"],
            },
          },
          branch(ex, "Examples", 150, 450),
          branch(exc, "Exceptions", 400, 450),
          branch(sutra, "Related Sūtras", 650, 350),
          branch(practice, "Practice Sentences", 650, 500),
        ],
        [edge(c, rule), edge(rule, ex), edge(rule, exc), edge(rule, sutra), edge(rule, practice)]
      );
    })(),
  },
  {
    id: "chandas-comparison",
    name: "Chandas Comparison Map",
    description: "Compare meters with lakṣaṇa and gaṇa patterns.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const name = generateId();
      const lak = generateId();
      const gana = generateId();
      const yati = generateId();
      const ex = generateId();
      return makeContent(
        [
          center(c, "Meter Comparison", 400, 100),
          branch(name, "Meter Name", 200, 280),
          branch(lak, "Lakṣaṇa", 400, 280),
          branch(gana, "Gaṇa Pattern", 600, 280),
          branch(yati, "Yati", 300, 450),
          branch(ex, "Examples", 500, 450),
        ],
        [edge(c, name), edge(c, lak), edge(c, gana), edge(name, yati), edge(lak, ex)]
      );
    })(),
  },
  {
    id: "gita-verse-study",
    name: "Bhagavad Gītā Verse Study",
    description: "Verse, word meaning, grammar, commentary, memorization.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const verse = generateId();
      const word = generateId();
      const gram = generateId();
      const comm = generateId();
      const mem = generateId();
      return makeContent(
        [
          center(c, "Gītā Chapter.Verse", 400, 80),
          {
            id: verse,
            type: "shloka",
            position: { x: 280, y: 200 },
            data: {
              title: "Verse",
              devanagari: "",
              iast: "",
              memorizationStatus: "new",
              tags: ["गीता"],
            },
          },
          branch(word, "Word-by-word", 150, 420),
          branch(gram, "Grammar", 350, 420),
          branch(comm, "Commentary Notes", 550, 420),
          branch(mem, "Memorization", 750, 420, "#d97706"),
        ],
        [edge(c, verse), edge(verse, word), edge(verse, gram), edge(verse, comm), edge(verse, mem)]
      );
    })(),
  },
  {
    id: "sanskrit-class-notes",
    name: "Sanskrit Class Notes",
    description: "Lesson topic, vocabulary, grammar, homework.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const vocab = generateId();
      const gram = generateId();
      const ex = generateId();
      const hw = generateId();
      const q = generateId();
      return makeContent(
        [
          center(c, "Lesson Topic", 400, 150),
          branch(vocab, "Vocabulary", 150, 380),
          branch(gram, "Grammar", 350, 380),
          branch(ex, "Examples", 550, 380),
          branch(hw, "Homework", 250, 550),
          branch(q, "Questions", 550, 550),
        ],
        [edge(c, vocab), edge(c, gram), edge(c, ex), edge(gram, hw), edge(ex, q)]
      );
    })(),
  },
  {
    id: "samasa-breakdown",
    name: "Samāsa Breakdown",
    description: "Compound analysis with vigraha and type.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const compound = generateId();
      const vigraha = generateId();
      const type = generateId();
      const components = generateId();
      const meaning = generateId();
      return makeContent(
        [
          center(c, "Samāsa Study", 400, 100),
          branch(compound, "Compound", 400, 250, "#d97706"),
          branch(vigraha, "Vigraha", 200, 420),
          branch(type, "Samāsa Type", 400, 420),
          branch(components, "Components", 600, 420),
          branch(meaning, "Meaning", 400, 580),
        ],
        [edge(c, compound), edge(compound, vigraha), edge(compound, type), edge(compound, components), edge(compound, meaning)]
      );
    })(),
  },
  {
    id: "vibhakti-table",
    name: "Vibhakti Table Map",
    description: "Declension table with singular/dual/plural.",
    category: "sanskrit",
    content: (() => {
      const c = generateId();
      const stem = generateId();
      const sg = generateId();
      const du = generateId();
      const pl = generateId();
      const ex = generateId();
      return makeContent(
        [
          center(c, "Prātipadika", 400, 100),
          branch(stem, "Stem & Gender", 400, 250),
          branch(sg, "Singular", 200, 420),
          branch(du, "Dual", 400, 420),
          branch(pl, "Plural", 600, 420),
          branch(ex, "Examples", 400, 580),
        ],
        [edge(c, stem), edge(stem, sg), edge(stem, du), edge(stem, pl), edge(stem, ex)]
      );
    })(),
  },
  {
    id: "sanskrit-grammar-chart",
    name: "Sanskrit Grammar Chart",
    description: "A hierarchy-ready chart for grammar topics, rules, and examples.",
    category: "sanskrit",
    content: groupedTreeContent("संस्कृतव्याकरणम्", [
      { label: "सन्धिः", children: ["स्वरसन्धिः", "व्यञ्जनसन्धिः", "विसर्गसन्धिः"], color: "#b45309" },
      { label: "समासः", children: ["तत्पुरुषः", "बहुव्रीहिः", "द्वन्द्वः"], color: "#0f766e" },
      { label: "प्रत्ययः", children: ["कृत्", "तद्धितः", "स्त्रीप्रत्ययः"], color: "#7c3aed" },
    ]),
  },
  {
    id: "nyaya-categories",
    name: "Nyāya Categories",
    description: "Organize padārthas, definitions, examples, and relationships.",
    category: "sanskrit",
    content: groupedTreeContent("न्यायशास्त्रम्", [
      { label: "प्रमाणम्", children: ["प्रत्यक्षम्", "अनुमानम्", "उपमानम्", "शब्दः"], color: "#0369a1" },
      { label: "प्रमेयम्", children: ["आत्मा", "शरीरम्", "इन्द्रियम्", "अर्थः"], color: "#047857" },
      { label: "तर्कः", children: ["संशयः", "दृष्टान्तः", "सिद्धान्तः"], color: "#a21caf" },
    ]),
  },
  {
    id: "sandhi-map",
    name: "Sandhi Map",
    description: "A ready-made map for Sandhi types, rules, and examples.",
    category: "sanskrit",
    content: groupedTreeContent("सन्धिः", [
      { label: "स्वरसन्धिः", children: ["सवर्णदीर्घः", "गुणः", "वृद्धिः", "यण्"], color: "#be123c" },
      { label: "व्यञ्जनसन्धिः", children: ["श्चुत्वम्", "ष्टुत्वम्", "जश्त्वम्"], color: "#1d4ed8" },
      { label: "विसर्गसन्धिः", children: ["सत्वम्", "रुत्वम्", "लोपः"], color: "#15803d" },
    ]),
  },
  {
    id: "study-plan",
    name: "Study Plan",
    description: "Plan goals, weekly topics, practice, and review milestones.",
    category: "study",
    content: groupedTreeContent("Study Plan", [
      { label: "Learn", children: ["Topic 1", "Topic 2", "Topic 3"], color: "#2563eb" },
      { label: "Practice", children: ["Exercises", "Recall", "Teach back"], color: "#7c3aed" },
      { label: "Review", children: ["Weekly check", "Mock test", "Reflection"], color: "#059669" },
    ]),
  },
  {
    id: "flowchart-starter",
    name: "Flowchart",
    description: "Start with a clear process, decision, and outcome structure.",
    category: "general",
    content: groupedTreeContent("Start", [
      { label: "Process", children: ["Action", "Decision"], color: "#2563eb" },
      { label: "Yes", children: ["Complete"], color: "#059669" },
      { label: "No", children: ["Revise", "Try again"], color: "#dc2626" },
    ]),
  },
  {
    id: "concept-map-starter",
    name: "Concept Map",
    description: "Connect a central concept to definitions, evidence, and examples.",
    category: "study",
    content: groupedTreeContent("Central Concept", [
      { label: "Definition", children: ["Key term", "Essential idea"], color: "#4f46e5" },
      { label: "Evidence", children: ["Source", "Observation"], color: "#0284c7" },
      { label: "Examples", children: ["Example 1", "Example 2"], color: "#d97706" },
    ]),
  },
];

export function getAllTemplates(): TemplateDefinition[] {
  return templates;
}

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return templates.find((t) => t.id === id);
}

export function getTemplatesByCategory(
  category: TemplateDefinition["category"]
): TemplateDefinition[] {
  return templates.filter((t) => t.category === category);
}
