export const PORTABLE_DEVANAGARI_FONT = "Board Export Devanagari";

/** OS fonts cannot travel with browser HTML. Preserve embedded faces, then use
 * an embedded Indic fallback before any generic platform font. */
export function portableFontStack(stack: string, available: Set<string>): string {
  const families = stack.split(",").map(value => value.trim().replace(/^['"]|['"]$/g, ""));
  const embedded = families.filter(family => available.has(family.toLowerCase()));
  return [...embedded, PORTABLE_DEVANAGARI_FONT].map(family => JSON.stringify(family)).join(", ");
}
