export const OUTLINE_PDF_METADATA_PREFIX = "MANOJALAM_OUTLINE_V1:";
export const OUTLINE_PDF_METADATA_NAMESPACE = "https://manojalam.app/ns/outline/";

export interface PortableOutlineDetail {
  label: string;
  value: string;
}

export interface PortableOutlineNode {
  title: string;
  details: PortableOutlineDetail[];
  children: PortableOutlineNode[];
}

export interface PortableOutlineDocument {
  version: 1;
  title: string;
  roots: PortableOutlineNode[];
}

interface EncodableOutlineNode {
  title: string;
  details: readonly PortableOutlineDetail[];
  children: readonly EncodableOutlineNode[];
}

interface EncodableOutlineDocument {
  title: string;
  roots: readonly EncodableOutlineNode[];
}

const MAX_METADATA_LENGTH = 10 * 1024 * 1024;
const MAX_OUTLINE_NODES = 10_000;
const MAX_OUTLINE_DEPTH = 100;

function encodedNode(node: EncodableOutlineNode): PortableOutlineNode {
  return {
    title: node.title,
    details: node.details.map((detail) => ({
      label: detail.label,
      value: detail.value,
    })),
    children: node.children.map(encodedNode),
  };
}

export function encodeOutlinePdfMetadata(
  outline: EncodableOutlineDocument
): string {
  const payload: PortableOutlineDocument = {
    version: 1,
    title: outline.title,
    roots: outline.roots.map(encodedNode),
  };
  return `${OUTLINE_PDF_METADATA_PREFIX}${JSON.stringify(payload)}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decodedNode(
  value: unknown,
  state: { count: number },
  depth: number
): PortableOutlineNode | null {
  if (depth > MAX_OUTLINE_DEPTH || state.count >= MAX_OUTLINE_NODES) return null;
  const record = recordValue(value);
  if (!record || typeof record.title !== "string") return null;
  if (!Array.isArray(record.details) || !Array.isArray(record.children)) return null;
  state.count += 1;

  const details: PortableOutlineDetail[] = [];
  for (const detailValue of record.details) {
    const detail = recordValue(detailValue);
    if (
      !detail
      || typeof detail.label !== "string"
      || typeof detail.value !== "string"
    ) {
      return null;
    }
    details.push({ label: detail.label, value: detail.value });
  }

  const children: PortableOutlineNode[] = [];
  for (const childValue of record.children) {
    const child = decodedNode(childValue, state, depth + 1);
    if (!child) return null;
    children.push(child);
  }
  return { title: record.title, details, children };
}

export function decodeOutlinePdfMetadata(
  value: unknown
): PortableOutlineDocument | null {
  if (
    typeof value !== "string"
    || value.length > MAX_METADATA_LENGTH
    || !value.startsWith(OUTLINE_PDF_METADATA_PREFIX)
  ) {
    return null;
  }
  try {
    const parsed = recordValue(
      JSON.parse(value.slice(OUTLINE_PDF_METADATA_PREFIX.length))
    );
    if (
      !parsed
      || parsed.version !== 1
      || typeof parsed.title !== "string"
      || !Array.isArray(parsed.roots)
    ) {
      return null;
    }
    const state = { count: 0 };
    const roots: PortableOutlineNode[] = [];
    for (const rootValue of parsed.roots) {
      const root = decodedNode(rootValue, state, 1);
      if (!root) return null;
      roots.push(root);
    }
    if (!roots.length) return null;
    return {
      version: 1,
      title: parsed.title,
      roots,
    };
  } catch {
    return null;
  }
}
