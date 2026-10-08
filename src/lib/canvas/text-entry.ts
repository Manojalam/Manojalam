/** Distinguish a double-click on letters from the surrounding object surface. */
export function textEntryPoint(event: { clientX: number; clientY: number }) {
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  let hit = false;
  let textOffset: number | undefined;
  if (range?.startContainer.nodeType === Node.TEXT_NODE) {
    const node = range.startContainer;
    const editor = node.parentElement?.closest(".ProseMirror");
    if (editor) { const prefix = range.cloneRange(); prefix.selectNodeContents(editor); prefix.setEnd(node, range.startOffset); textOffset = prefix.toString().length; }
    for (const offset of [range.startOffset - 1, range.startOffset]) {
      if (offset < 0 || offset >= (node.textContent?.length ?? 0)) continue;
      const glyph = document.createRange(); glyph.setStart(node, offset); glyph.setEnd(node, offset + 1);
      const bounds = glyph.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom && /\S/u.test(glyph.toString())) hit = true;
    }
  }
  return { textOffset, clientX: event.clientX, clientY: event.clientY, selection: hit ? "word" as const : "all" as const };
}
