"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import {
  AudioLines,
  Download,
  Mic,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AudioNodeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import {
  AUDIO_RECORDING_BITS_PER_SECOND,
  audioFileExtension,
  blobToDataUrl,
  formatRecordingDuration,
  MAX_AUDIO_RECORDING_BYTES,
  MAX_AUDIO_RECORDING_MS,
  microphoneErrorMessage,
  preferredAudioMimeType,
} from "@/lib/canvas/audio-recording";
import { NodeHandles } from "./NodeHandles";
import { NodeQuickActions } from "./NodeQuickActions";
import { useNodeManualResize } from "./useNodeManualResize";

type RecorderStatus = "idle" | "requesting" | "recording" | "processing";

function AudioNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as AudioNodeData;
  const color = d.color ?? "#7c3aed";
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const resizeControls = useNodeManualResize(id);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const maximumTimerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);
  const disposedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (maximumTimerRef.current !== null) window.clearTimeout(maximumTimerRef.current);
    intervalRef.current = null;
    maximumTimerRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const finalizeRecording = useCallback(async (recorder: MediaRecorder) => {
    clearTimers();
    stopStream();
    recorderRef.current = null;
    const durationMs = Math.min(
      MAX_AUDIO_RECORDING_MS,
      Math.max(0, Date.now() - startedAtRef.current)
    );
    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (cancelRequestedRef.current || disposedRef.current) {
      if (!disposedRef.current) {
        setStatus("idle");
        setElapsedMs(0);
      }
      return;
    }

    setStatus("processing");
    const mimeType = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      toast.error("No audio was captured. Please try recording again.");
      setStatus("idle");
      return;
    }
    if (blob.size > MAX_AUDIO_RECORDING_BYTES) {
      toast.error("That recording is too large to save. Try a shorter recording.");
      setStatus("idle");
      return;
    }

    try {
      const audioDataUrl = await blobToDataUrl(blob);
      if (disposedRef.current) return;
      pushHistory();
      updateNodeData(id, {
        audioDataUrl,
        audioMimeType: mimeType,
        audioDurationMs: durationMs,
        audioRecordedAt: new Date().toISOString(),
        audioSizeBytes: blob.size,
      });
      setElapsedMs(durationMs);
      setStatus("idle");
      toast.success("Audio recording saved to the board.");
    } catch {
      if (disposedRef.current) return;
      setStatus("idle");
      toast.error("The recording could not be saved. Please try again.");
    }
  }, [clearTimers, id, pushHistory, stopStream, updateNodeData]);

  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    if (
      typeof navigator === "undefined"
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === "undefined"
    ) {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    setStatus("requesting");
    cancelRequestedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = preferredAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: AUDIO_RECORDING_BITS_PER_SECOND,
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cancelRequestedRef.current = true;
        clearTimers();
        stopStream();
        recorderRef.current = null;
        if (!disposedRef.current) {
          setStatus("idle");
          toast.error("The browser stopped the audio recording unexpectedly.");
        }
      };
      recorder.onstop = () => {
        void finalizeRecording(recorder);
      };

      recorder.start(1000);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus("recording");
      intervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      maximumTimerRef.current = window.setTimeout(() => {
        const activeRecorder = recorderRef.current;
        if (activeRecorder?.state === "recording") {
          setStatus("processing");
          activeRecorder.stop();
          toast.info("The five-minute recording limit was reached.");
        }
      }, MAX_AUDIO_RECORDING_MS);
    } catch (error) {
      clearTimers();
      stopStream();
      recorderRef.current = null;
      if (!disposedRef.current) {
        setStatus("idle");
        toast.error(microphoneErrorMessage(error));
      }
    }
  }, [clearTimers, finalizeRecording, status, stopStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("processing");
    recorder.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    cancelRequestedRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setStatus("processing");
      recorder.stop();
    } else {
      clearTimers();
      stopStream();
      setStatus("idle");
      setElapsedMs(0);
    }
  }, [clearTimers, stopStream]);

  const discardRecording = useCallback(() => {
    pushHistory();
    updateNodeData(id, {
      audioDataUrl: undefined,
      audioMimeType: undefined,
      audioDurationMs: undefined,
      audioRecordedAt: undefined,
      audioSizeBytes: undefined,
    });
    setElapsedMs(0);
  }, [id, pushHistory, updateNodeData]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      cancelRequestedRef.current = true;
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopStream();
    };
  }, [clearTimers, stopStream]);

  const savedDuration = typeof d.audioDurationMs === "number" ? d.audioDurationMs : 0;
  const hasRecording = typeof d.audioDataUrl === "string" && d.audioDataUrl.length > 0;
  const busy = status !== "idle";

  return (
    <>
      <NodeResizer
        minWidth={280}
        minHeight={170}
        isVisible={selected && !busy}
        lineStyle={{ borderColor: color }}
        handleStyle={{ borderColor: color, backgroundColor: "white" }}
        onResizeStart={resizeControls.onResizeStart}
        onResizeEnd={resizeControls.onResizeEnd}
      />
      <div className="group relative h-full w-full">
        <NodeHandles nodeId={id} color={color} selected={selected} />
        <NodeQuickActions nodeId={id} color={color} selected={selected} />
        <div
          className={cn(
            "flex h-full min-h-[170px] w-full flex-col overflow-hidden rounded-2xl border-2 bg-background shadow-md",
            selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          style={{ borderColor: color }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3 text-white"
            style={{ background: `linear-gradient(135deg, ${color}, #4f46e5)` }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <AudioLines className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.title || "Audio note"}</p>
              <p className="text-[11px] text-white/75">
                {hasRecording
                  ? `Recording · ${formatRecordingDuration(savedDuration)}`
                  : "Record a voice note on this board"}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-3 px-4 py-3">
            {status === "requesting" && (
              <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                Waiting for microphone permission…
              </p>
            )}

            {status === "recording" && (
              <div className="flex items-center justify-center gap-2" aria-live="polite">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                <span className="font-mono text-lg font-semibold">
                  {formatRecordingDuration(elapsedMs)}
                </span>
              </div>
            )}

            {status === "processing" && (
              <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                Saving recording…
              </p>
            )}

            {status === "idle" && hasRecording && (
              <audio
                key={d.audioDataUrl}
                data-export-ignore
                className="nodrag nopan h-10 w-full"
                controls
                preload="metadata"
                src={d.audioDataUrl}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Your browser does not support audio playback.
              </audio>
            )}

            {status === "idle" && !hasRecording && (
              <div className="text-center">
                <p className="text-sm font-medium">No recording yet</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Up to five minutes per audio note
                </p>
              </div>
            )}

            <div
              data-export-ignore
              className="nodrag nopan flex flex-wrap items-center justify-center gap-2"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {status === "recording" ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      stopRecording();
                    }}
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-accent"
                    onClick={(event) => {
                      event.stopPropagation();
                      cancelRecording();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-white disabled:cursor-wait disabled:opacity-60"
                    style={{ backgroundColor: color }}
                    onClick={(event) => {
                      event.stopPropagation();
                      void startRecording();
                    }}
                  >
                    {hasRecording
                      ? <RotateCcw className="h-3.5 w-3.5" />
                      : <Mic className="h-3.5 w-3.5" />}
                    {hasRecording ? "Re-record" : "Record"}
                  </button>
                  {hasRecording && (
                    <>
                      <a
                        className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-accent"
                        href={d.audioDataUrl}
                        download={`audio-note.${audioFileExtension(d.audioMimeType)}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Discard recording"
                        title="Discard recording"
                        onClick={(event) => {
                          event.stopPropagation();
                          discardRecording();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const AudioNode = memo(AudioNodeComponent);
