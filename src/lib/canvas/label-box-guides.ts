/** A board-wide guide switch augments, rather than replaces, local chart overrides. */
export function resolveLabelBoxGuideVisibility(
  boardEnabled: boolean | undefined,
  localEnabled?: boolean
): boolean {
  return boardEnabled === true || localEnabled === true;
}
