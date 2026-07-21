const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const EXPLICIT_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;
const RELATIVE_LINK = /^(?:\/|#|\?)/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Keep link labels on one visible line even when they are pasted from rich text. */
export function normalizeLinkDisplayText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

/** Normalize a user-entered destination while rejecting executable protocols. */
export function normalizeLinkHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || CONTROL_CHARACTER.test(trimmed)) return null;
  if (RELATIVE_LINK.test(trimmed)) return trimmed;

  const candidate = EXPLICIT_PROTOCOL.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) return null;
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Validate an href that already came from HTML without rewriting relative links. */
export function isSafeLinkHref(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || CONTROL_CHARACTER.test(trimmed)) return false;
  if (RELATIVE_LINK.test(trimmed)) return true;
  return normalizeLinkHref(trimmed) !== null;
}
