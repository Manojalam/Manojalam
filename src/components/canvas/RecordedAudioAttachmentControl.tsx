"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, X } from "lucide-react";
import { toast } from "sonner";

import {
  AUDIO_RECORDING_BITS_PER_SECOND,
  audioFileExtension,
  formatRecordingDuration,
  MAX_AUDIO_RECORDING_MS,
  microphoneErrorMessage,
  normalizedRecordingMimeType,
  preferredAudioMimeType,
} from "@/lib/canvas/audio-recording";
import { MAX_AUDIO_BYTES } from "@/lib/canvas/node-media";

type RecordingStatus = "idle" | "requesting" | "recording" | "processing";

interface RecordedAudioAttachmentControlProps {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onRecorded: (file: File) => Promise<void>;
}

function recordingFileName(mimeType: string, recordedAt: Date): string {
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");
  return `voice-recording-${timestamp}.${audioFileExtension(mimeType)}`;
}

export function RecordedAudioAttachmentControl({
  disabled,
  onBusyChange,
  onRecorded,
}: RecordedAudioAttachmentControlProps) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
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
        setElapsedMs(0);
        setStatus("idle");
      }
      return;
    }

    setStatus("processing");
    const recordedAt = new Date();
    const mimeType = normalizedRecordingMimeType(
      recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm"
    );
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      toast.error("No audio was captured. Please try recording again.");
      setStatus("idle");
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      toast.error("That recording is too large to attach. Try a shorter recording.");
      setStatus("idle");
      return;
    }

    try {
      const file = new File(
        [blob],
        recordingFileName(mimeType, recordedAt),
        { type: mimeType, lastModified: recordedAt.getTime() }
      );
      await onRecorded(file);
      if (disposedRef.current) return;
      setElapsedMs(durationMs);
      setStatus("idle");
    } catch (error) {
      if (disposedRef.current) return;
      setStatus("idle");
      toast.error("The recording could not be attached.", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, [clearTimers, onRecorded, stopStream]);

  const startRecording = useCallback(async () => {
    if (disabled || status !== "idle") return;
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
      const preferredMimeType = preferredAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
          audioBitsPerSecond: AUDIO_RECORDING_BITS_PER_SECOND,
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        cancelRequestedRef.current = true;
        clearTimers();
        stopStream();
        recorderRef.current = null;
        if (!disposedRef.current) {
          setStatus("idle");
          toast.error("The browser stopped the audio recording unexpectedly.");
        }
      });
      recorder.addEventListener("stop", () => {
        void finalizeRecording(recorder);
      }, { once: true });

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
  }, [clearTimers, disabled, finalizeRecording, status, stopStream]);

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
      return;
    }
    clearTimers();
    stopStream();
    setElapsedMs(0);
    setStatus("idle");
  }, [clearTimers, stopStream]);

  useEffect(() => {
    onBusyChange(status !== "idle");
  }, [onBusyChange, status]);

  useEffect(() => () => {
    onBusyChange(false);
  }, [onBusyChange]);

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

  if (status === "recording") {
    return (
      <div className="col-span-2 rounded-md border border-red-500/40 bg-red-500/5 p-2">
        <div className="mb-2 flex items-center justify-center gap-2" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs font-medium text-red-600 dark:text-red-400">Recording</span>
          <span className="font-mono text-xs tabular-nums">
            {formatRecordingDuration(elapsedMs)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 text-xs font-medium text-white hover:bg-red-700"
            onClick={stopRecording}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop & attach
          </button>
          <button
            type="button"
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium hover:bg-muted"
            onClick={cancelRecording}
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (status === "requesting" || status === "processing") {
    return (
      <button
        type="button"
        disabled
        className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium opacity-60"
        aria-live="polite"
      >
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {status === "requesting" ? "Waiting for microphone…" : "Attaching recording…"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => void startRecording()}
    >
      <Mic className="h-4 w-4" />
      Record audio
    </button>
  );
}
