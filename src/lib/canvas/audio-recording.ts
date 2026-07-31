export const MAX_AUDIO_RECORDING_MS = 5 * 60 * 1000;
export const MAX_AUDIO_RECORDING_BYTES = 4 * 1024 * 1024;
export const AUDIO_RECORDING_BITS_PER_SECOND = 64_000;

const AUDIO_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

export function preferredAudioMimeType(
  isTypeSupported?: (mimeType: string) => boolean
): string {
  const supports = isTypeSupported
    ?? (
      typeof MediaRecorder !== "undefined"
      && typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported.bind(MediaRecorder)
        : null
    );
  if (!supports) return "";
  return AUDIO_MIME_TYPE_CANDIDATES.find((mimeType) => supports(mimeType)) ?? "";
}

export function formatRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function audioFileExtension(mimeType: string | undefined): string {
  if (mimeType?.includes("mp4")) return "m4a";
  if (mimeType?.includes("ogg")) return "ogg";
  if (mimeType?.includes("wav")) return "wav";
  return "webm";
}

/** Strip recorder codec parameters so uploaded-audio validation sees a canonical MIME type. */
export function normalizedRecordingMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized?.startsWith("audio/") ? normalized : "audio/webm";
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException
    ? error.name
    : typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied. Allow microphone access in your browser and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use or could not be started.";
  }
  return "The microphone could not be started. Check your browser permissions and try again.";
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The recording could not be encoded."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The recording could not be read."));
    reader.readAsDataURL(blob);
  });
}
