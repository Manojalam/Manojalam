"use client";

import { useRef, useState } from "react";
import type { Node } from "@xyflow/react";
import {
  AudioLines,
  Download,
  ImageIcon,
  ImagePlus,
  LoaderCircle,
  Music2,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AUDIO_FILE_ACCEPT,
  IMAGE_FILE_ACCEPT,
  MAX_MEDIA_ATTACHMENTS,
  createMediaAttachment,
  formattedMediaSize,
  normalizeMediaAttachments,
} from "@/lib/canvas/node-media";
import type { MediaAttachmentKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

export function MediaAttachmentMenu({ node }: { node: Node }) {
  const [open, setOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<MediaAttachmentKind | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const attachments = normalizeMediaAttachments(
    ((node.data ?? {}) as Record<string, unknown>).mediaAttachments
  );
  const isFull = attachments.length >= MAX_MEDIA_ATTACHMENTS;

  const addFiles = async (kind: MediaAttachmentKind, files: File[]) => {
    if (!files.length) return;
    const available = MAX_MEDIA_ATTACHMENTS - attachments.length;
    if (files.length > available) {
      toast.error(
        available > 0
          ? `You can add ${available} more attachment${available === 1 ? "" : "s"} to this object.`
          : `This object already has ${MAX_MEDIA_ATTACHMENTS} attachments.`
      );
      return;
    }

    setBusyKind(kind);
    try {
      const created = [];
      // Process sequentially so several large phone photos do not compete for
      // browser memory while they are being decoded and resized.
      for (const file of files) {
        created.push(await createMediaAttachment(file, kind));
      }

      const store = useCanvasStore.getState();
      const currentNode = store.nodes.find((candidate) => candidate.id === node.id);
      if (!currentNode) throw new Error("The selected object no longer exists.");
      const currentAttachments = normalizeMediaAttachments(
        ((currentNode.data ?? {}) as Record<string, unknown>).mediaAttachments
      );
      if (currentAttachments.length + created.length > MAX_MEDIA_ATTACHMENTS) {
        throw new Error(`An object can have up to ${MAX_MEDIA_ATTACHMENTS} attachments.`);
      }

      store.pushHistory();
      store.updateNodeData(node.id, {
        mediaAttachments: [...currentAttachments, ...created],
      });
      toast.success(
        created.length === 1
          ? `${kind === "image" ? "Image" : "Audio"} attached`
          : `${created.length} ${kind === "image" ? "images" : "audio files"} attached`,
        { action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() } }
      );
    } catch (error) {
      toast.error(`Could not attach ${kind}`, {
        description: error instanceof Error ? error.message : "Please choose another file.",
      });
    } finally {
      setBusyKind(null);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    const store = useCanvasStore.getState();
    const currentNode = store.nodes.find((candidate) => candidate.id === node.id);
    if (!currentNode) return;
    const currentAttachments = normalizeMediaAttachments(
      ((currentNode.data ?? {}) as Record<string, unknown>).mediaAttachments
    );
    const nextAttachments = currentAttachments.filter(
      (attachment) => attachment.id !== attachmentId
    );
    if (nextAttachments.length === currentAttachments.length) return;

    store.pushHistory();
    store.updateNodeData(node.id, { mediaAttachments: nextAttachments });
    toast.success("Attachment removed", {
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={attachments.length
            ? `Media attachments (${attachments.length})`
            : "Add image or audio"}
          aria-label={attachments.length
            ? `Manage ${attachments.length} media attachments`
            : "Add image or audio"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Paperclip className="h-4 w-4" />
          {attachments.length > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground">
              {attachments.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-80"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Media attachments</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add images or playable audio to this object.
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {attachments.length}/{MAX_MEDIA_ATTACHMENTS}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isFull || busyKind !== null}
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => imageInputRef.current?.click()}
          >
            {busyKind === "image"
              ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : <ImagePlus className="h-4 w-4" />}
            Add image
          </button>
          <button
            type="button"
            disabled={isFull || busyKind !== null}
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => audioInputRef.current?.click()}
          >
            {busyKind === "audio"
              ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : <AudioLines className="h-4 w-4" />}
            Add audio
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void addFiles("image", files);
            }}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept={AUDIO_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void addFiles("audio", files);
            }}
          />
        </div>

        {attachments.length > 0 ? (
          <div className="mt-3 max-h-60 space-y-1 overflow-y-auto pr-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-md border border-border/70 p-2"
              >
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  attachment.kind === "image"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                )}>
                  {attachment.kind === "image"
                    ? <ImageIcon className="h-4 w-4" />
                    : <Music2 className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" title={attachment.name}>
                    {attachment.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {formattedMediaSize(attachment.size)}
                  </span>
                </span>
                <a
                  href={attachment.dataUrl}
                  download={attachment.name}
                  title={`Download ${attachment.name}`}
                  aria-label={`Download ${attachment.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  title={`Remove ${attachment.name}`}
                  aria-label={`Remove ${attachment.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
            No media attached yet.
          </div>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Images up to 15 MB are optimized for the board. Audio files can be up to 6 MB.
        </p>
      </PopoverContent>
    </Popover>
  );
}
