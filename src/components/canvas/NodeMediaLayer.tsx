"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ViewportPortal, type Node } from "@xyflow/react";
import { Download, Music2, Pause } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formattedMediaSize,
  normalizeMediaAttachments,
} from "@/lib/canvas/node-media";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { getNodeRect } from "@/lib/layout";
import type { MediaAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

function stopCanvasInteraction(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function ImageAttachmentButton({
  attachment,
  compact,
}: {
  attachment: MediaAttachment;
  compact: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative shrink-0 overflow-hidden rounded-md border-2 border-background bg-muted shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            compact ? "h-7 w-7" : "h-11 w-11"
          )}
          title={`Open image: ${attachment.name}`}
          aria-label={`Open image ${attachment.name}`}
          onPointerDown={stopCanvasInteraction}
          onClick={stopCanvasInteraction}
        >
          <Image
            src={attachment.dataUrl}
            alt=""
            fill
            unoptimized
            sizes={compact ? "28px" : "44px"}
            draggable={false}
            className="object-cover"
          />
          <span className="sr-only">{attachment.name}</span>
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[92vh] w-[min(92vw,72rem)] max-w-none overflow-hidden p-4"
        onPointerDown={stopCanvasInteraction}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate">{attachment.name}</DialogTitle>
          <DialogDescription>
            {formattedMediaSize(attachment.size)}
            {attachment.width && attachment.height
              ? ` · ${attachment.width} × ${attachment.height}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-[min(72vh,52rem)] w-full overflow-hidden rounded-lg bg-black/5">
          <Image
            src={attachment.dataUrl}
            alt={attachment.name}
            fill
            unoptimized
            sizes="92vw"
            className="object-contain"
          />
        </div>
        <a
          href={attachment.dataUrl}
          download={attachment.name}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          Download image
        </a>
      </DialogContent>
    </Dialog>
  );
}

function AudioAttachmentButton({
  attachment,
  compact,
}: {
  attachment: MediaAttachment;
  compact: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const togglePlayback = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(attachment.dataUrl);
      audio.preload = "metadata";
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("play", () => setPlaying(true));
      audioRef.current = audio;
    }
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        compact ? "h-7 w-7" : "h-9 w-9"
      )}
      title={`${playing ? "Pause" : "Play"} audio: ${attachment.name}`}
      aria-label={`${playing ? "Pause" : "Play"} audio ${attachment.name}`}
      aria-pressed={playing}
      onPointerDown={stopCanvasInteraction}
      onClick={togglePlayback}
    >
      {playing
        ? <Pause className={compact ? "h-3 w-3" : "h-4 w-4"} fill="currentColor" />
        : <Music2 className={compact ? "h-3 w-3" : "h-4 w-4"} />}
    </button>
  );
}

function NodeMediaStrip({ node }: { node: Node }) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const attachments = normalizeMediaAttachments(data.mediaAttachments);
  if (!attachments.length) return null;

  const rect = getNodeRect(node);
  const compact = rect.width < 130 || rect.height < 90;
  const visible = attachments.slice(-3);
  const hiddenCount = attachments.length - visible.length;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: Math.max(40, (node.zIndex ?? 0) + 40),
        ...objectRotationStyle(node.type, data),
      }}
      data-node-media-layer={node.id}
    >
      <div
        className={cn(
          "nodrag nopan nowheel pointer-events-auto absolute bottom-1.5 right-1.5 flex max-w-[calc(100%-0.75rem)] items-end justify-end gap-1",
          compact && "bottom-1 right-1 gap-0.5"
        )}
        onPointerDown={stopCanvasInteraction}
        onDoubleClick={stopCanvasInteraction}
      >
        {hiddenCount > 0 && (
          <span
            className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-background bg-background/95 px-1 text-[10px] font-semibold text-foreground shadow-md"
            title={`${hiddenCount} more attachment${hiddenCount === 1 ? "" : "s"}`}
          >
            +{hiddenCount}
          </span>
        )}
        {visible.map((attachment) => attachment.kind === "image"
          ? (
              <ImageAttachmentButton
                key={attachment.id}
                attachment={attachment}
                compact={compact}
              />
            )
          : (
              <AudioAttachmentButton
                key={attachment.id}
                attachment={attachment}
                compact={compact}
              />
            ))}
      </div>
    </div>
  );
}

export function NodeMediaLayer({ nodes }: { nodes: Node[] }) {
  const mediaNodes = nodes.filter((node) =>
    !node.hidden
    && normalizeMediaAttachments(
      ((node.data ?? {}) as Record<string, unknown>).mediaAttachments
    ).length > 0
  );
  if (!mediaNodes.length) return null;

  return (
    <ViewportPortal>
      {mediaNodes.map((node) => <NodeMediaStrip key={node.id} node={node} />)}
    </ViewportPortal>
  );
}
