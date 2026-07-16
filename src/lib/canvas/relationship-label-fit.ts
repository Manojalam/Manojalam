export type RelationshipLabelMeasureText = (value: string, fontSize: number) => number;

export interface RelationshipLabelFitInput {
  value: string;
  maximumWidth: number;
  preferredFontSize: number;
  maximumLines?: number;
  minimumFontSize?: number;
  lineHeight?: number;
  /** Required for safe upward fitting; ignored by the legacy preferred-size mode. */
  maximumHeight?: number;
  maximize?: boolean;
  maximumFontSize?: number;
  measureText: RelationshipLabelMeasureText;
}

export interface RelationshipLabelFitResult {
  lines: string[];
  fontSize: number;
  overflowed: boolean;
}

const EPSILON = 0.001;

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function wrapLabel(
  value: string,
  maximumWidth: number,
  fontSize: number,
  measureText: RelationshipLabelMeasureText
): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  if (measureText(normalized, fontSize) <= maximumWidth + EPSILON) return [normalized];
  const words = normalized.split(" ");
  if (words.length === 1) return [normalized];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureText(candidate, fontSize) > maximumWidth + EPSILON) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fits(
  lines: readonly string[],
  fontSize: number,
  input: RelationshipLabelFitInput
): boolean {
  const maximumLines = Math.max(1, input.maximumLines ?? 5);
  const maximumWidth = Math.max(1, input.maximumWidth);
  if (lines.length > maximumLines) return false;
  if (lines.some((line) => input.measureText(line, fontSize) > maximumWidth + EPSILON)) {
    return false;
  }
  if (!input.maximize || input.maximumHeight === undefined) return true;
  const maximumHeight = Math.max(1, input.maximumHeight);
  const lineHeight = Math.max(1, input.lineHeight ?? 1.35);
  return Math.max(1, lines.length) * fontSize * lineHeight <= maximumHeight + EPSILON;
}

/**
 * Fit a relationship label without clipping. In maximize mode the search
 * starts at the global text ceiling and stops at the largest size that fits
 * both axes; otherwise it preserves the historical preferred-size behavior.
 */
export function fitRelationshipLabel(input: RelationshipLabelFitInput): RelationshipLabelFitResult {
  const minimumFontSize = Math.max(1, input.minimumFontSize ?? 9);
  const preferredFontSize = Math.max(minimumFontSize, input.preferredFontSize);
  const maximumFontSize = Math.max(
    minimumFontSize,
    input.maximumFontSize ?? 72
  );
  const maximumWidth = Math.max(1, input.maximumWidth);
  if (input.maximize && input.maximumHeight !== undefined) {
    const minimumLines = wrapLabel(input.value, maximumWidth, minimumFontSize, input.measureText);
    if (!fits(minimumLines, minimumFontSize, input)) {
      return { lines: minimumLines, fontSize: minimumFontSize, overflowed: true };
    }

    let lower = minimumFontSize;
    let upper = maximumFontSize;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const candidate = (lower + upper) / 2;
      const candidateLines = wrapLabel(input.value, maximumWidth, candidate, input.measureText);
      if (fits(candidateLines, candidate, input)) lower = candidate;
      else upper = candidate;
    }
    const fontSize = Math.max(minimumFontSize, Math.floor(lower * 2) / 2);
    const lines = wrapLabel(input.value, maximumWidth, fontSize, input.measureText);
    return { lines, fontSize, overflowed: !fits(lines, fontSize, input) };
  }

  let fontSize = preferredFontSize;
  let lines = wrapLabel(input.value, maximumWidth, fontSize, input.measureText);
  while (fontSize > minimumFontSize + EPSILON && !fits(lines, fontSize, input)) {
    fontSize = Math.max(minimumFontSize, fontSize - 1);
    lines = wrapLabel(input.value, maximumWidth, fontSize, input.measureText);
  }
  return { lines, fontSize, overflowed: !fits(lines, fontSize, input) };
}
