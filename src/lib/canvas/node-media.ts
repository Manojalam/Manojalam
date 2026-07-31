import type {
  MediaAttachment,
  MediaAttachmentKind,
} from "../types";
import { generateId } from "../utils";

const MEBIBYTE = 1024 * 1024;

export const MAX_MEDIA_ATTACHMENTS = 8;
export const MAX_IMAGE_SOURCE_BYTES = 15 * MEBIBYTE;
export const MAX_IMAGE_STORED_BYTES = 3 * MEBIBYTE;
export const MAX_AUDIO_BYTES = 6 * MEBIBYTE;
export const MAX_IMAGE_DIMENSION = 1600;

export const IMAGE_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif";
export const AUDIO_FILE_ACCEPT = ".mp3,.m4a,.aac,.wav,.ogg,.oga,.webm";

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
};

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
};

type FileDescriptor = Pick<File, "name" | "size" | "type">;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function mediaAttachmentBaseName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 && dot < trimmed.length - 1
    ? trimmed.slice(0, dot)
    : trimmed;
}

export function renamedMediaAttachmentName(
  currentName: string,
  requestedBaseName: string
): string | null {
  const extension = extensionOf(currentName);
  const suffix = extension ? `.${extension}` : "";
  let baseName = requestedBaseName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (suffix && baseName.toLowerCase().endsWith(suffix)) {
    baseName = baseName.slice(0, -suffix.length).trim();
  }
  const maximumBaseLength = Math.max(1, 180 - suffix.length);
  baseName = baseName.slice(0, maximumBaseLength).trim();
  return baseName ? `${baseName}${suffix}` : null;
}

export function moveMediaAttachment(
  attachments: MediaAttachment[],
  attachmentId: string,
  direction: -1 | 1
): MediaAttachment[] {
  const currentIndex = attachments.findIndex((attachment) => attachment.id === attachmentId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= attachments.length) {
    return attachments;
  }
  const reordered = attachments.slice();
  [reordered[currentIndex], reordered[nextIndex]] = [
    reordered[nextIndex],
    reordered[currentIndex],
  ];
  return reordered;
}

export function mediaFileMimeType(file: FileDescriptor): string {
  const declared = file.type.trim().toLowerCase();
  const inferred = MIME_BY_EXTENSION[extensionOf(file.name)] || "";
  if (!declared || declared === "application/octet-stream") return inferred;
  return MIME_ALIASES[declared] || declared;
}

export function validateMediaFile(
  file: FileDescriptor,
  kind: MediaAttachmentKind
): string | null {
  if (!file.name.trim()) return "Choose a file with a valid name.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected file is empty.";

  const mimeType = mediaFileMimeType(file);
  const allowedTypes = kind === "image" ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
  if (!allowedTypes.has(mimeType)) {
    return kind === "image"
      ? "Use a PNG, JPEG, WebP, or GIF image."
      : "Use an MP3, M4A, AAC, WAV, OGG, or WebM audio file.";
  }

  const limit = kind === "image" ? MAX_IMAGE_SOURCE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > limit) {
    return kind === "image"
      ? "Images must be 15 MB or smaller before optimization."
      : "Audio files must be 6 MB or smaller.";
  }
  return null;
}

export function estimatedDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const payload = dataUrl.slice(comma + 1);
  if (dataUrl.slice(0, comma).toLowerCase().includes(";base64")) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isAllowedDataUrl(
  dataUrl: string,
  kind: MediaAttachmentKind,
  mimeType: string
): boolean {
  const allowedTypes = kind === "image" ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
  if (!allowedTypes.has(mimeType)) return false;
  return dataUrl.toLowerCase().startsWith(`data:${mimeType.toLowerCase()};base64,`);
}

export function normalizeMediaAttachments(value: unknown): MediaAttachment[] {
  if (!Array.isArray(value)) return [];

  const normalized: MediaAttachment[] = [];
  for (const candidate of value.slice(0, MAX_MEDIA_ATTACHMENTS)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    const kind = item.kind === "image" || item.kind === "audio" ? item.kind : null;
    if (
      !kind
      || typeof item.id !== "string"
      || !item.id
      || typeof item.name !== "string"
      || !item.name.trim()
      || typeof item.mimeType !== "string"
      || typeof item.dataUrl !== "string"
      || typeof item.createdAt !== "string"
    ) continue;

    const mimeType = item.mimeType.toLowerCase();
    if (!isAllowedDataUrl(item.dataUrl, kind, mimeType)) continue;
    const actualSize = estimatedDataUrlBytes(item.dataUrl);
    const sizeLimit = kind === "image" ? MAX_IMAGE_STORED_BYTES : MAX_AUDIO_BYTES;
    if (!Number.isFinite(actualSize) || actualSize <= 0 || actualSize > sizeLimit) continue;

    normalized.push({
      id: item.id,
      kind,
      name: item.name.trim().slice(0, 180),
      mimeType,
      size: actualSize,
      dataUrl: item.dataUrl,
      createdAt: item.createdAt,
      ...(kind === "image"
        && typeof item.width === "number"
        && Number.isFinite(item.width)
        && item.width > 0
        ? { width: item.width }
        : {}),
      ...(kind === "image"
        && typeof item.height === "number"
        && Number.isFinite(item.height)
        && item.height > 0
        ? { height: item.height }
        : {}),
    });
  }
  return normalized;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The file could not be read."));
    }, { once: true });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The file could not be read."));
    }, { once: true });
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected image could not be decoded."));
    }, { once: true });
    image.src = url;
  });
}

function canvasBlob(
  image: HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image optimization is not available in this browser.");
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The image could not be optimized.")),
      "image/webp",
      quality
    );
  });
}

async function prepareImage(file: File): Promise<{
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}> {
  const mimeType = mediaFileMimeType(file);
  const image = await loadImage(file);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) throw new Error("The selected image has no visible dimensions.");

  // Preserve animation. Static images are optimized only when their dimensions
  // or payload would otherwise make the board unnecessarily heavy.
  if (mimeType === "image/gif") {
    if (file.size > MAX_IMAGE_STORED_BYTES) {
      throw new Error("Animated GIFs must be 3 MB or smaller.");
    }
    return {
      blob: new Blob([file], { type: mimeType }),
      mimeType,
      width: naturalWidth,
      height: naturalHeight,
    };
  }
  if (
    file.size <= MAX_IMAGE_STORED_BYTES
    && naturalWidth <= MAX_IMAGE_DIMENSION
    && naturalHeight <= MAX_IMAGE_DIMENSION
  ) {
    return {
      blob: new Blob([file], { type: mimeType }),
      mimeType,
      width: naturalWidth,
      height: naturalHeight,
    };
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(naturalWidth, naturalHeight));
  let width = Math.max(1, Math.round(naturalWidth * scale));
  let height = Math.max(1, Math.round(naturalHeight * scale));
  let blob = await canvasBlob(image, width, height, 0.84);

  if (blob.size > MAX_IMAGE_STORED_BYTES) {
    const reduction = Math.min(0.9, Math.sqrt(MAX_IMAGE_STORED_BYTES / blob.size) * 0.9);
    width = Math.max(1, Math.round(width * reduction));
    height = Math.max(1, Math.round(height * reduction));
    blob = await canvasBlob(image, width, height, 0.72);
  }
  if (blob.size > MAX_IMAGE_STORED_BYTES) {
    throw new Error("The optimized image is still larger than 3 MB. Choose a smaller image.");
  }
  return { blob, mimeType: "image/webp", width, height };
}

export async function createMediaAttachment(
  file: File,
  kind: MediaAttachmentKind
): Promise<MediaAttachment> {
  const validationError = validateMediaFile(file, kind);
  if (validationError) throw new Error(validationError);

  if (kind === "image") {
    const prepared = await prepareImage(file);
    return {
      id: generateId(),
      kind,
      name: file.name.trim(),
      mimeType: prepared.mimeType,
      size: prepared.blob.size,
      dataUrl: await readBlobAsDataUrl(prepared.blob),
      createdAt: new Date().toISOString(),
      width: prepared.width,
      height: prepared.height,
    };
  }

  const mimeType = mediaFileMimeType(file);
  const normalizedBlob = new Blob([file], { type: mimeType });
  return {
    id: generateId(),
    kind,
    name: file.name.trim(),
    mimeType,
    size: normalizedBlob.size,
    dataUrl: await readBlobAsDataUrl(normalizedBlob),
    createdAt: new Date().toISOString(),
  };
}

export function formattedMediaSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < MEBIBYTE) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / MEBIBYTE).toFixed(size < 10 * MEBIBYTE ? 1 : 0)} MB`;
}
