"use client";

import { MediaAttachmentMenu } from "@/components/canvas/MediaAttachmentMenu";
import {
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import {
  relationshipDiagramItemMediaAttachments,
  relationshipDiagramItemStylesWithMedia,
} from "@/lib/relationship-diagram-item-media";
import { useCanvasStore } from "@/store/canvas-store";

export function RelationshipDiagramItemMediaMenu({
  diagramNodeId,
  itemId,
  itemLabel,
}: {
  diagramNodeId: string;
  itemId: string;
  itemLabel: string;
}) {
  const storedSpec = useCanvasStore((state) => {
    const node = state.nodes.find((candidate) => candidate.id === diagramNodeId);
    return node?.type === "relationshipDiagram"
      ? (node.data as Record<string, unknown> | undefined)?.relationshipDiagramSpec
      : undefined;
  });
  const spec = normalizeRelationshipDiagramSpec(storedSpec);
  const attachments = relationshipDiagramItemMediaAttachments(spec.itemStyles, itemId);

  const getAttachments = () => {
    const node = useCanvasStore.getState().nodes.find(
      (candidate) => candidate.id === diagramNodeId && candidate.type === "relationshipDiagram"
    );
    const latestSpec = normalizeRelationshipDiagramSpec(
      (node?.data as Record<string, unknown> | undefined)?.relationshipDiagramSpec
    );
    return relationshipDiagramItemMediaAttachments(latestSpec.itemStyles, itemId);
  };

  return (
    <MediaAttachmentMenu
      attachments={attachments}
      targetLabel={itemLabel}
      getAttachments={getAttachments}
      onAttachmentsChange={(nextAttachments) => {
        const store = useCanvasStore.getState();
        const node = store.nodes.find(
          (candidate) => candidate.id === diagramNodeId && candidate.type === "relationshipDiagram"
        );
        if (!node) return;
        const latestSpec = normalizeRelationshipDiagramSpec(
          (node.data as Record<string, unknown> | undefined)?.relationshipDiagramSpec
        );
        store.updateRelationshipDiagramSpec(diagramNodeId, {
          itemStyles: relationshipDiagramItemStylesWithMedia(
            latestSpec.itemStyles,
            itemId,
            nextAttachments
          ),
        });
      }}
    />
  );
}
