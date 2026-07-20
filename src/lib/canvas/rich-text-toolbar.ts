export interface InlineTextToolbarContext {
  nodeId?: string;
  selectedNodeIds: string[];
  editorEditable: boolean;
  editorFocused: boolean;
  hasTextSelection: boolean;
}

/** Only a deliberate text selection in the single focused node owns an inline toolbar. */
export function canShowInlineTextToolbar({
  nodeId,
  selectedNodeIds,
  editorEditable,
  editorFocused,
  hasTextSelection,
}: InlineTextToolbarContext): boolean {
  if (!editorEditable || !editorFocused || !hasTextSelection) return false;
  if (!nodeId) return true;
  return selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId;
}
