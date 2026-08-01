import { normalizeMediaAttachments } from "./canvas/node-media";
import type {
  MediaAttachment,
  RelationshipDiagramItemStyle,
} from "./types";

export function relationshipDiagramItemMediaAttachments(
  itemStyles: Record<string, RelationshipDiagramItemStyle> | undefined,
  itemId: string
): MediaAttachment[] {
  return normalizeMediaAttachments(itemStyles?.[itemId]?.mediaAttachments);
}

export function relationshipDiagramItemStylesWithMedia(
  itemStyles: Record<string, RelationshipDiagramItemStyle> | undefined,
  itemId: string,
  attachments: readonly MediaAttachment[]
): Record<string, RelationshipDiagramItemStyle> | undefined {
  const nextStyles = { ...(itemStyles ?? {}) };
  const current = nextStyles[itemId] ?? {};
  const normalizedAttachments = normalizeMediaAttachments(attachments);
  const nextItem: RelationshipDiagramItemStyle = {
    ...current,
    mediaAttachments: normalizedAttachments.length ? normalizedAttachments : undefined,
  };

  if (Object.values(nextItem).every((value) => value === undefined)) {
    delete nextStyles[itemId];
  } else {
    nextStyles[itemId] = nextItem;
  }
  return Object.keys(nextStyles).length ? nextStyles : undefined;
}
