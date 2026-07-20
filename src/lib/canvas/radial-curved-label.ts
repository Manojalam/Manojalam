import { radialLabelGuideGeometry, type RadialSectionGeometry } from "./radial-label-guide";

export interface RadialTextRunStyle {
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: "normal" | "italic";
  fontWeight?: number | "normal" | "bold";
  textDecoration?: string;
}

export interface RadialTextRun {
  text: string;
  style: RadialTextRunStyle;
}

export interface RadialCurvedLine {
  text: string;
  radius: number;
  path: string;
  runs: RadialTextRun[];
}

export interface RadialCurvedLabelLayout {
  reversed: boolean;
  lines: RadialCurvedLine[];
}

export type RadialLabelMeasureText = (value: string, fontSize: number) => number;

export interface RadialCurvedLabelOptions extends RadialSectionGeometry {
  centerX: number;
  centerY: number;
  chartRotation?: number;
  label?: string;
  fittedLines: string[];
  fontSize: number;
  lineHeight: number;
  measureText?: RadialLabelMeasureText;
  richText?: string;
}

type StyledUnit = { character: string; style: RadialTextRunStyle };
type RadialLineBounds = { minimumRadius: number; maximumRadius: number };
type WrappedLinePlan = { lines: string[]; radii: number[] };

const BLOCK_TAGS = new Set(["div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p"]);

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (normalized.startsWith("#")) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[normalized] ?? match;
  });
}

function attributeValue(tag: string, name: string): string | undefined {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  if (quoted) return quoted[2];
  return tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"))?.[1];
}

function cssStyle(value: string | undefined): RadialTextRunStyle {
  if (!value) return {};
  const declarations = new Map(value.split(";").flatMap((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator < 0) return [];
    return [[
      declaration.slice(0, separator).trim().toLowerCase(),
      declaration.slice(separator + 1).trim(),
    ]];
  }));
  const style: RadialTextRunStyle = {};
  const color = declarations.get("color");
  if (color) style.fill = color;
  const family = declarations.get("font-family");
  if (family) style.fontFamily = family;
  const rawSize = declarations.get("font-size")?.trim() ?? "";
  const size = Number.parseFloat(rawSize);
  if (/^\d+(?:\.\d+)?(?:px)?$/i.test(rawSize) && Number.isFinite(size) && size > 0) {
    style.fontSize = size;
  }
  const fontStyle = declarations.get("font-style")?.toLowerCase();
  if (fontStyle === "italic") style.fontStyle = "italic";
  if (fontStyle === "normal") style.fontStyle = "normal";
  const weight = declarations.get("font-weight")?.toLowerCase();
  if (weight === "bold" || weight === "normal") style.fontWeight = weight;
  else if (weight && Number.isFinite(Number(weight))) style.fontWeight = Number(weight);
  const decoration = declarations.get("text-decoration") ?? declarations.get("text-decoration-line");
  if (decoration) style.textDecoration = decoration;
  return style;
}

function tagStyle(tagName: string, rawTag: string): RadialTextRunStyle {
  const style = cssStyle(attributeValue(rawTag, "style"));
  if (tagName === "strong" || tagName === "b") style.fontWeight = "bold";
  if (tagName === "em" || tagName === "i") style.fontStyle = "italic";
  if (tagName === "u") style.textDecoration = "underline";
  if (tagName === "s" || tagName === "strike" || tagName === "del") style.textDecoration = "line-through";
  if (tagName === "font") {
    const color = attributeValue(rawTag, "color");
    const family = attributeValue(rawTag, "face");
    if (color) style.fill = color;
    if (family) style.fontFamily = family;
  }
  return style;
}

function mergedStyle(stack: Array<{ tag: string; style: RadialTextRunStyle }>): RadialTextRunStyle {
  return Object.assign({}, ...stack.map((entry) => entry.style));
}

function stylesEqual(first: RadialTextRunStyle, second: RadialTextRunStyle): boolean {
  return first.fill === second.fill
    && first.fontFamily === second.fontFamily
    && first.fontSize === second.fontSize
    && first.fontStyle === second.fontStyle
    && first.fontWeight === second.fontWeight
    && first.textDecoration === second.textDecoration;
}

function normalizedStyledUnits(richText: string): StyledUnit[] {
  const stack: Array<{ tag: string; style: RadialTextRunStyle }> = [];
  const rawUnits: StyledUnit[] = [];
  const appendBreak = () => {
    if (rawUnits.length && rawUnits[rawUnits.length - 1].character !== "\n") {
      rawUnits.push({ character: "\n", style: {} });
    }
  };
  const tokens = richText.match(/<!--[^]*?-->|<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<!--")) continue;
    if (!token.startsWith("<")) {
      const style = mergedStyle(stack);
      const decoded = decodeHtmlEntities(token);
      for (let index = 0; index < decoded.length; index++) {
        rawUnits.push({ character: decoded[index], style });
      }
      continue;
    }
    const closing = /^<\s*\//.test(token);
    const tagName = token.match(/^<\s*\/?\s*([\w-]+)/)?.[1]?.toLowerCase();
    if (!tagName) continue;
    if (tagName === "br") {
      appendBreak();
      continue;
    }
    if (closing) {
      const matchingIndex = stack.map((entry) => entry.tag).lastIndexOf(tagName);
      if (matchingIndex >= 0) stack.splice(matchingIndex);
      if (BLOCK_TAGS.has(tagName)) appendBreak();
      continue;
    }
    if (BLOCK_TAGS.has(tagName)) appendBreak();
    if (!/\/\s*>$/.test(token)) stack.push({ tag: tagName, style: tagStyle(tagName, token) });
  }

  const normalized: StyledUnit[] = [];
  for (const unit of rawUnits) {
    const whitespace = /\s/.test(unit.character);
    if (!whitespace) {
      normalized.push(unit);
      continue;
    }
    const character = unit.character === "\n" ? "\n" : " ";
    const previous = normalized[normalized.length - 1]?.character;
    if (!previous || previous === character || (previous === "\n" && character === " ")) continue;
    normalized.push({ character, style: unit.style });
  }
  while (normalized[0]?.character === " " || normalized[0]?.character === "\n") normalized.shift();
  while (normalized.at(-1)?.character === " " || normalized.at(-1)?.character === "\n") normalized.pop();
  return normalized;
}

function groupedRuns(units: StyledUnit[]): RadialTextRun[] {
  const runs: RadialTextRun[] = [];
  for (const unit of units) {
    const previous = runs[runs.length - 1];
    if (previous && stylesEqual(previous.style, unit.style)) previous.text += unit.character;
    else runs.push({ text: unit.character, style: { ...unit.style } });
  }
  return runs;
}

/** Map already-fitted plain lines back to their authored inline styles. */
export function radialRichTextRuns(richText: string | undefined, fittedLines: string[]): RadialTextRun[][] {
  if (!richText?.trim()) return fittedLines.map((line) => [{ text: line, style: {} }]);
  const units = normalizedStyledUnits(richText);
  const plain = units.map((unit) => unit.character).join("").replace(/\n/g, " ");
  let cursor = 0;
  return fittedLines.map((line) => {
    const normalizedLine = line.replace(/\s+/g, " ").trim();
    const index = plain.indexOf(normalizedLine, cursor);
    if (index < 0) return [{ text: line, style: {} }];
    cursor = index + normalizedLine.length;
    return groupedRuns(units.slice(index, cursor).map((unit) => (
      unit.character === "\n" ? { ...unit, character: " " } : unit
    )));
  });
}

export function radialLabelUsesCurvedText(section: RadialSectionGeometry): boolean {
  const radius = Math.max(0.5, (section.innerRadius + section.outerRadius) / 2);
  const arcLength = Math.max(0.5, ((section.endAngle - section.startAngle) * Math.PI * radius) / 180);
  const radialBand = Math.max(0.5, section.outerRadius - section.innerRadius);
  return arcLength >= radialBand;
}

/** Text runs clockwise on the upper half and counter-clockwise below the center. */
export function radialLabelPathIsReversed(
  startAngle: number,
  endAngle: number,
  chartRotation = 0
): boolean {
  const worldMidpoint = normalizeAngle((startAngle + endAngle) / 2 + chartRotation);
  return worldMidpoint > 0 && worldMidpoint < 180;
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function arcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  reversed: boolean
): string {
  const span = Math.max(0.01, endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const start = pointOnCircle(centerX, centerY, radius, reversed ? endAngle : startAngle);
  const end = pointOnCircle(centerX, centerY, radius, reversed ? startAngle : endAngle);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${reversed ? 0 : 1} ${end.x} ${end.y}`;
}

function estimatedTextWidth(value: string, fontSize: number): number {
  const devanagari = /[\u0900-\u097f]/.test(value);
  return Array.from(value).length * fontSize * (devanagari ? 0.62 : 0.54);
}

function normalizedParagraphs(value: string): string[] {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function radialLineBounds(
  guide: RadialSectionGeometry,
  fontSize: number
): RadialLineBounds {
  const halfInk = fontSize * 0.56;
  const minimumRadius = Math.min(
    (guide.innerRadius + guide.outerRadius) / 2,
    guide.innerRadius + halfInk
  );
  return {
    minimumRadius,
    maximumRadius: Math.max(minimumRadius, guide.outerRadius - halfInk),
  };
}

function distributedLineRadii(
  lineCount: number,
  bounds: RadialLineBounds,
  fontSize: number,
  lineHeight: number,
  reversed: boolean
): number[] {
  if (lineCount <= 1) return [(bounds.minimumRadius + bounds.maximumRadius) / 2];
  const lineStep = Math.min(
    fontSize * lineHeight,
    (bounds.maximumRadius - bounds.minimumRadius) / (lineCount - 1)
  );
  const usedBand = lineStep * (lineCount - 1);
  const firstAscendingRadius = (bounds.minimumRadius + bounds.maximumRadius - usedBand) / 2;
  const ascendingRadii = Array.from(
    { length: lineCount },
    (_, index) => firstAscendingRadius + lineStep * index
  );
  return reversed ? ascendingRadii : [...ascendingRadii].reverse();
}

function wrapWordsForArcCapacities(
  paragraphs: string[],
  capacities: number[],
  fontSize: number,
  measureText: RadialLabelMeasureText
): string[] | null {
  const words = paragraphs.flatMap((paragraph, paragraphIndex) =>
    paragraph.split(/\s+/).filter(Boolean).map((text) => ({ text, paragraphIndex }))
  );
  if (!words.length || words.length < capacities.length) return null;

  const suffixParagraphCounts = new Array<number>(words.length + 1).fill(0);
  let paragraphCount = 0;
  let nextParagraphIndex: number | undefined;
  for (let index = words.length - 1; index >= 0; index -= 1) {
    if (words[index].paragraphIndex !== nextParagraphIndex) {
      paragraphCount += 1;
      nextParagraphIndex = words[index].paragraphIndex;
    }
    suffixParagraphCounts[index] = paragraphCount;
  }

  type Result = { cost: number; lines: string[] };
  const memo = new Map<string, Result | null>();
  const solve = (lineIndex: number, wordIndex: number): Result | null => {
    const key = `${lineIndex}:${wordIndex}`;
    if (memo.has(key)) return memo.get(key) ?? null;
    if (lineIndex === capacities.length) {
      const result = wordIndex === words.length ? { cost: 0, lines: [] } : null;
      memo.set(key, result);
      return result;
    }

    const remainingLines = capacities.length - lineIndex;
    if (words.length - wordIndex < remainingLines) {
      memo.set(key, null);
      return null;
    }

    const paragraphIndex = words[wordIndex]?.paragraphIndex;
    if (paragraphIndex === undefined) {
      memo.set(key, null);
      return null;
    }

    let best: Result | null = null;
    let line = "";
    for (let end = wordIndex; end < words.length; end += 1) {
      if (words[end].paragraphIndex !== paragraphIndex) break;
      line = line ? `${line} ${words[end].text}` : words[end].text;
      const width = measureText(line, fontSize);
      const capacity = capacities[lineIndex];
      if (width > capacity + 0.01) break;

      const nextWord = end + 1;
      const linesAfter = capacities.length - lineIndex - 1;
      const wordsAfter = words.length - nextWord;
      if (wordsAfter < linesAfter) continue;
      const paragraphsAfter = suffixParagraphCounts[nextWord];
      if (paragraphsAfter > linesAfter) continue;

      const tail = solve(lineIndex + 1, nextWord);
      if (!tail) continue;
      const fill = Math.min(1, width / Math.max(1, capacity));
      const wordCount = end - wordIndex + 1;
      const paragraphContinues = words[nextWord]?.paragraphIndex === paragraphIndex;
      const orphanPenalty = wordCount === 1 && paragraphContinues && fill < 0.34 ? 0.45 : 0;
      const result = {
        cost: (1 - fill) ** 2 + orphanPenalty + tail.cost,
        lines: [line, ...tail.lines],
      };
      if (!best || result.cost < best.cost) best = result;
    }

    memo.set(key, best);
    return best;
  };

  return solve(0, 0)?.lines ?? null;
}

/**
 * Wrap a label against the real length of each concentric text path. This is
 * intentionally separate from the rectangular editor fit: a word sequence
 * that does not fit at the section's middle radius may still fit cleanly on a
 * slightly larger arc.
 */
function radialCurveAwareLinePlan(
  options: RadialCurvedLabelOptions,
  guide: RadialSectionGeometry,
  bounds: RadialLineBounds,
  reversed: boolean
): WrappedLinePlan {
  const fallbackLines = options.fittedLines;
  const fallbackRadii = distributedLineRadii(
    fallbackLines.length,
    bounds,
    options.fontSize,
    options.lineHeight,
    reversed
  );
  const paragraphs = normalizedParagraphs(options.label ?? "");
  if (!paragraphs.length) return { lines: fallbackLines, radii: fallbackRadii };

  const rawMeasureText = options.measureText ?? estimatedTextWidth;
  const measurementCache = new Map<string, number>();
  const measureText: RadialLabelMeasureText = (value, fontSize) => {
    const key = `${fontSize}\u0000${value}`;
    const cached = measurementCache.get(key);
    if (cached !== undefined) return cached;
    const measurement = rawMeasureText(value, fontSize);
    measurementCache.set(key, measurement);
    return measurement;
  };
  const angleSpan = Math.max(0.01, ((guide.endAngle - guide.startAngle) * Math.PI) / 180);
  const maximumLineCount = Math.max(paragraphs.length, fallbackLines.length);

  for (let lineCount = paragraphs.length; lineCount <= maximumLineCount; lineCount += 1) {
    if (lineCount === 1) {
      const text = paragraphs[0];
      const width = measureText(text, options.fontSize);
      const safetyPadding = options.fontSize * 0.24;
      const requiredRadius = (width + safetyPadding) / angleSpan;
      if (requiredRadius <= bounds.maximumRadius + 0.01) {
        return {
          lines: [text],
          radii: [Math.max((bounds.minimumRadius + bounds.maximumRadius) / 2, requiredRadius)],
        };
      }
      continue;
    }

    const radii = distributedLineRadii(
      lineCount,
      bounds,
      options.fontSize,
      options.lineHeight,
      reversed
    );
    const capacities = radii.map((radius) => Math.max(1, radius * angleSpan - options.fontSize * 0.24));
    const lines = wrapWordsForArcCapacities(
      paragraphs,
      capacities,
      options.fontSize,
      measureText
    );
    if (lines) return { lines, radii };
  }

  return { lines: fallbackLines, radii: fallbackRadii };
}

export function radialCurvedLabelLayout(options: RadialCurvedLabelOptions): RadialCurvedLabelLayout {
  const reversed = radialLabelPathIsReversed(
    options.startAngle,
    options.endAngle,
    options.chartRotation
  );
  if (!options.fittedLines.length) return { reversed, lines: [] };

  const inset = Math.max(5, options.fontSize * 0.38);
  const guide = radialLabelGuideGeometry(options, inset);
  const bounds = radialLineBounds(guide, options.fontSize);
  const plan = radialCurveAwareLinePlan(options, guide, bounds, reversed);
  const runs = radialRichTextRuns(options.richText, plan.lines);

  return {
    reversed,
    lines: plan.lines.map((text, index) => ({
      text,
      radius: plan.radii[index],
      path: arcPath(
        options.centerX,
        options.centerY,
        plan.radii[index],
        guide.startAngle,
        guide.endAngle,
        reversed
      ),
      runs: runs[index],
    })),
  };
}
