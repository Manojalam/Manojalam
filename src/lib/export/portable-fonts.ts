export function firstFontFamily(stack: string): string {
  return stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

/** A PDF must never silently replace the authored face. */
export function portableFontStack(stack: string, available: Set<string>): string {
  const family = firstFontFamily(stack);
  if (!family || !available.has(family.toLowerCase())) {
    throw new Error(`The font “${family || stack}” cannot be embedded. Allow access to local fonts, or use image PDF to preserve its appearance.`);
  }
  return stack;
}
