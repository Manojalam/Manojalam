import type { Edge, Node } from "@xyflow/react";

import type { ShlokaCardNodeData, ShlokaStudySection } from "../types";
import {
  devanagariToIast,
  shouldRefreshAutomaticIast,
} from "../sanskrit/transliterate";

type DetailSection = Exclude<ShlokaStudySection, "verse">;

const LEGACY_SECTION_LABELS: Record<string, DetailSection> = {
  Padaccheda: "padaccheda",
  Anvaya: "anvaya",
  "Padārtha": "padartha",
  Translation: "translation",
  Grammar: "grammar",
  Chandas: "chandas",
  Notes: "notes",
  Memorization: "memorization",
};

const SECTION_FIELDS: Record<DetailSection, keyof ShlokaCardNodeData> = {
  padaccheda: "padaccheda",
  anvaya: "anvaya",
  padartha: "padartha",
  translation: "translation",
  grammar: "grammar",
  chandas: "chandas",
  notes: "notes",
  memorization: "memorizationNotes",
};

const EMPTY_SECTION_CONTENT: Record<DetailSection, string> = {
  padaccheda: "Add the separated words for this verse.",
  anvaya: "Add the prose word order for this verse.",
  padartha: "Add the word-by-word meanings for this verse.",
  translation: "Add the translation for this verse.",
  grammar: "Add grammar notes for this verse.",
  chandas: "Add the meter and syllable pattern for this verse.",
  notes: "Add study notes for this verse.",
  memorization: "Add a memorization plan for this verse.",
};

const SECTION_ORDER: DetailSection[] = [
  "padaccheda",
  "anvaya",
  "padartha",
  "translation",
  "grammar",
  "chandas",
  "notes",
  "memorization",
];

export interface ShlokaStudyMigrationResult {
  nodes: Node[];
  migrated: boolean;
}

function numericStyleDimension(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Upgrades the original Śloka Study template, whose eight branches were
 * label-only shapes, into independently editable section cards. Requiring the
 * complete named eight-card topology keeps standalone and user-authored Śloka
 * layouts out of the migration.
 */
export function migrateLegacyShlokaStudyTemplate(
  nodes: Node[],
  edges: Edge[]
): ShlokaStudyMigrationResult {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const replacements = new Map<string, Node>();
  const claimedTargets = new Set<string>();

  for (const verseNode of nodes) {
    if (verseNode.type !== "shloka") continue;
    const verseData = verseNode.data as ShlokaCardNodeData;
    if (verseData.studySection) {
      if (verseData.studySection === "verse") {
        const automaticIast = devanagariToIast(verseData.devanagari);
        if (
          automaticIast !== verseData.iast
          && shouldRefreshAutomaticIast(verseData.devanagari, verseData.iast)
        ) {
          replacements.set(verseNode.id, {
            ...verseNode,
            data: { ...verseData, iast: automaticIast },
          });
        }

        const parentEdge = edges.find((edge) => edge.target === verseNode.id);
        const parentNode = parentEdge ? nodesById.get(parentEdge.source) : undefined;
        if (
          parentNode?.type === "shape"
          && String(parentNode.data?.text ?? "").trim() === "Śloka title"
        ) {
          replacements.set(parentNode.id, {
            ...parentNode,
            data: {
              ...parentNode.data,
              text: verseData.sourceText?.trim() || "Śloka Study",
            },
          });
        }
      }
      continue;
    }

    const sectionTargets = new Map<DetailSection, Node>();
    for (const edge of edges) {
      if (edge.source !== verseNode.id) continue;
      const target = nodesById.get(edge.target);
      if (!target || target.type !== "shape" || claimedTargets.has(target.id)) continue;
      const label = String(target.data?.text ?? "").trim();
      const section = LEGACY_SECTION_LABELS[label];
      if (!section || sectionTargets.has(section)) continue;
      sectionTargets.set(section, target);
    }

    if (sectionTargets.size !== SECTION_ORDER.length) continue;

    const firstSectionX = Math.min(
      ...Array.from(sectionTargets.values(), (node) => node.position.x)
    );
    const firstSectionY = Math.min(
      ...Array.from(sectionTargets.values(), (node) => node.position.y)
    );
    const cardWidth = 270;
    const cardHeight = 180;
    const cardGap = 20;
    const rowGap = 40;
    const gridWidth = cardWidth * 4 + cardGap * 3;
    const gridCenterX = firstSectionX + gridWidth / 2;

    const verseOnlyData = { ...verseData };
    delete verseOnlyData.padaccheda;
    delete verseOnlyData.anvaya;
    delete verseOnlyData.padartha;
    delete verseOnlyData.translation;
    delete verseOnlyData.grammar;
    delete verseOnlyData.chandas;
    delete verseOnlyData.notes;
    delete verseOnlyData.memorizationNotes;
    delete verseOnlyData.collapsedSections;
    if (shouldRefreshAutomaticIast(verseData.devanagari, verseData.iast)) {
      verseOnlyData.iast = devanagariToIast(verseData.devanagari);
    }

    replacements.set(verseNode.id, {
      ...verseNode,
      position: { ...verseNode.position, x: gridCenterX - 210 },
      style: { ...verseNode.style, width: 420, height: 230 },
      data: { ...verseOnlyData, studySection: "verse" },
    });

    SECTION_ORDER.forEach((section, index) => {
      const target = sectionTargets.get(section)!;
      const targetData = (target.data ?? {}) as Record<string, unknown>;
      const sharedData = { ...targetData };
      delete sharedData.text;
      delete sharedData.richText;
      delete sharedData.shapeType;
      const field = SECTION_FIELDS[section];
      const sourceValue = String(verseData[field] ?? "").trim();
      const row = Math.floor(index / 4);
      const column = index % 4;

      replacements.set(target.id, {
        ...target,
        type: "shloka",
        position: {
          x: firstSectionX + column * (cardWidth + cardGap),
          y: firstSectionY + row * (cardHeight + rowGap),
        },
        style: { ...target.style, width: cardWidth, height: cardHeight },
        data: {
          ...sharedData,
          title: String(targetData.text ?? ""),
          devanagari: "",
          iast: "",
          tags: [],
          memorizationStatus: section === "memorization"
            ? verseData.memorizationStatus ?? "new"
            : "new",
          studySection: section,
          [field]: sourceValue || EMPTY_SECTION_CONTENT[section],
        },
      });
      claimedTargets.add(target.id);
    });

    const parentEdge = edges.find((edge) => edge.target === verseNode.id);
    const parentNode = parentEdge ? nodesById.get(parentEdge.source) : undefined;
    if (parentNode?.type === "shape") {
      const parentWidth = numericStyleDimension(parentNode.style?.width, 200);
      replacements.set(parentNode.id, {
        ...parentNode,
        position: { ...parentNode.position, x: gridCenterX - parentWidth / 2 },
        data: String(parentNode.data?.text ?? "").trim() === "Śloka title"
          ? {
              ...parentNode.data,
              text: verseData.sourceText?.trim() || "Śloka Study",
            }
          : parentNode.data,
      });
    }
  }

  if (replacements.size === 0) return { nodes, migrated: false };
  return {
    nodes: nodes.map((node) => replacements.get(node.id) ?? node),
    migrated: true,
  };
}
