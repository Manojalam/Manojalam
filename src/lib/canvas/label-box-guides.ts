/** The canvas-wide switch is the single authoritative guide setting. */
export function resolveLabelBoxGuideVisibility(
  boardEnabled: boolean | undefined
): boolean {
  return boardEnabled === true;
}
