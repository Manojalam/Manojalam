"use client";

import { useCallback, useRef, useState } from "react";
import type { Node } from "@xyflow/react";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ImageIcon,
  ImagePlus,
  LoaderCircle,
  Music2,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AUDIO_FILE_ACCEPT,
  IMAGE_FILE_ACCEPT,
  MAX_MEDIA_ATTACHMENTS,
  createMediaAttachment,
  formattedMediaSize,
  mediaAttachmentBaseName,
  moveMediaAttachment,
  normalizeMediaAttachments,
  renamedMediaAttachmentName,
} from "@/lib/canvas/node-media";
import type { MediaAttachmentKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { RecordedAudioAttachmentControl } from "./RecordedAudioAttachmentControl";

export function MediaAttachmentMenu({
  node,
  objectLabel = "object",
  triggerClassName,
}: {
  node: Node;
  objectLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<MediaAttachmentKind | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const attachments = normalizeMediaAttachments(
    ((node.data ?? {}) as Record<string, unknown>).mediaAttachments
  );
  const isFull = attachments.length >= MAX_MEDIA_ATTACHMENTS;
  const isDefaultObjectLabel = objectLabel === "object";

  const addFiles = useCallback(async (kind: MediaAttachmentKind, files: File[]) => {
    if (!files.length) return;
    const available = MAX_MEDIA_ATTACHMENTS - attachments.length;
    if (files.length > available) {
      toast.error(
        available > 0
          ? `You can add ${available} more attachment${available === 1 ? "" : "s"} to this ${objectLabel}.`
          : `This ${objectLabel} already has ${MAX_MEDIA_ATTACHMENTS} attachments.`
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
  }, [attachments, node.id, objectLabel]);

  const attachRecording = useCallback(async (file: File) => {
    await addFiles("audio", [file]);
  }, [addFiles]);

  const moveAttachment = (attachmentId: string, direction: -1 | 1) => {
    const store = useCanvasStore.getState();
    const currentNode = store.nodes.find((candidate) => candidate.id === node.id);
    if (!currentNode) return;
    const currentAttachments = normalizeMediaAttachments(
      ((currentNode.data ?? {}) as Record<string, unknown>).mediaAttachments
    );
    const reordered = moveMediaAttachment(currentAttachments, attachmentId, direction);
    if (reordered === currentAttachments) return;
    store.pushHistory();
    store.updateNodeData(node.id, { mediaAttachments: reordered });
  };

  const beginRename = (attachmentId: string, currentName: string) => {
    setEditingAttachmentId(attachmentId);
    setRenameDraft(mediaAttachmentBaseName(currentName));
  };

  const cancelRename = () => {
    setEditingAttachmentId(null);
    setRenameDraft("");
  };

  const saveRename = (attachmentId: string) => {
    const store = useCanvasStore.getState();
    const currentNode = store.nodes.find((candidate) => candidate.id === node.id);
    if (!currentNode) return;
    const currentAttachments = normalizeMediaAttachments(
      ((currentNode.data ?? {}) as Record<string, unknown>).mediaAttachments
    );
    const attachment = currentAttachments.find((candidate) => candidate.id === attachmentId);
    if (!attachment) return;
    const nextName = renamedMediaAttachmentName(attachment.name, renameDraft);
    if (!nextName) {
      toast.error("Enter a name for this attachment.");
      return;
    }
    if (nextName !== attachment.name) {
      store.pushHistory();
      store.updateNodeData(node.id, {
        mediaAttachments: currentAttachments.map((candidate) =>
          candidate.id === attachmentId ? { ...candidate, name: nextName } : candidate
        ),
      });
    }
    cancelRename();
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
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) cancelRename();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={attachments.length
            ? `${isDefaultObjectLabel ? "Media" : `${objectLabel} media`} attachments (${attachments.length})`
            : `Add image or audio${isDefaultObjectLabel ? "" : ` to ${objectLabel}`}`}
          aria-label={attachments.length
            ? `Manage ${attachments.length} media attachments${isDefaultObjectLabel ? "" : ` for ${objectLabel}`}`
            : `Add image or audio${isDefaultObjectLabel ? "" : ` to ${objectLabel}`}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            triggerClassName
          )}
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
              Add images, upload audio, or record it for this {objectLabel}.
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {attachments.length}/{MAX_MEDIA_ATTACHMENTS}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isFull || busyKind !== null || recordingBusy}
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
            disabled={isFull || busyKind !== null || recordingBusy}
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
          <RecordedAudioAttachmentControl
            disabled={isFull || busyKind !== null}
            onBusyChange={setRecordingBusy}
            onRecorded={attachRecording}
          />
        </div>

        {attachments.length > 0 ? (
          <div className="mt-3 max-h-60 space-y-1 overflow-y-auto pr-1">
            {attachments.map((attachment, index) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-md border border-border/70 p-2"
              >
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    disabled={index === 0 || busyKind !== null || recordingBusy}
                    title={`Move ${attachment.name} earlier`}
                    aria-label={`Move ${attachment.name} earlier`}
                    className="flex h-4 w-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-25"
                    onClick={() => moveAttachment(attachment.id, -1)}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === attachments.length - 1 || busyKind !== null || recordingBusy}
                    title={`Move ${attachment.name} later`}
                    aria-label={`Move ${attachment.name} later`}
                    className="flex h-4 w-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-25"
                    onClick={() => moveAttachment(attachment.id, 1)}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
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
                {editingAttachmentId === attachment.id ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      autoFocus
                      value={renameDraft}
                      aria-label={`Rename ${attachment.name}`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRename(attachment.id);
                        if (event.key === "Escape") cancelRename();
                      }}
                    />
                    <button
                      type="button"
                      title="Save name"
                      aria-label="Save attachment name"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-500/10"
                      onClick={() => saveRename(attachment.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Cancel rename"
                      aria-label="Cancel attachment rename"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                      onClick={cancelRename}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium" title={attachment.name}>
                        {attachment.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formattedMediaSize(attachment.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busyKind !== null || recordingBusy}
                      title={`Rename ${attachment.name}`}
                      aria-label={`Rename ${attachment.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"
                      onClick={() => beginRename(attachment.id, attachment.name)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
            No media attached yet.
          </div>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Images up to 15 MB are optimized for the board. Upload or record up to 6 MB of audio;
          recordings can be five minutes long.
        </p>
      </PopoverContent>
    </Popover>
  );
}
