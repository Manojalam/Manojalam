import { ExportError } from "./errors";
import type {
  ExportAssetFallbackAction,
  ExportAssetWarning,
} from "./types";

export type { ExportAssetWarning } from "./types";

const DEFAULT_FONT_TIMEOUT_MS = 15_000;
const URL_FUNCTION_PATTERN = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi;

export type ExportAssetKind = "image" | "style" | "font";

export interface ExportAssetReport {
  embeddedImageCount: number;
  embeddedStyleAssetCount: number;
  embeddedFontCount: number;
  proxiedRemoteAssetCount: number;
  preservedRemoteAssetCount: number;
  substitutedRemoteAssetCount: number;
  fontFaceCss: string;
  warnings: ExportAssetWarning[];
}

export interface ExportAssetOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  fontTimeoutMs?: number;
  /** Fail instead of falling back when an accessible font resource cannot be embedded. */
  strictFontEmbedding?: boolean;
  /** Keep unresolved remote URLs in vector SVG exports instead of failing raster-style. */
  preserveRemoteReferences?: boolean;
  /** Replace unreadable remote visual assets with an explicit canvas-safe placeholder. */
  substituteInaccessibleRemoteAssets?: boolean;
}

interface FontFaceSource {
  cssText: string;
  family: string;
  baseUrl: string;
  stylesheetUrl?: string;
}

interface AssetContext {
  baseUrl: string;
  signal?: AbortSignal;
  preserveRemoteReferences: boolean;
  substituteInaccessibleRemoteAssets: boolean;
  cache: Map<string, Promise<string>>;
  fallbacks: Map<string, string>;
  embeddedByKind: Record<ExportAssetKind, Set<string>>;
  proxiedRemoteAssets: Set<string>;
  preservedRemoteAssets: Set<string>;
  substitutedRemoteAssets: Set<string>;
  warningKeys: Set<string>;
  warnings: ExportAssetWarning[];
}

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("The export was canceled.", "AbortError");
}

function elementDescription(element: Element): string {
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList).slice(0, 4);
  const className = classes.length ? `.${classes.join(".")}` : "";
  const dataId = element.getAttribute("data-id");
  return `${element.tagName.toLowerCase()}${id}${className}${dataId ? `[data-id=\"${dataId}\"]` : ""}`;
}

function resolvedAssetUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("data:")) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch (cause) {
    throw new ExportError({
      stage: "prepare-assets",
      code: "ASSET_EMBED_FAILED",
      cause,
      message: `The export contains an invalid asset URL: ${trimmed}`,
      diagnostics: { offendingUrl: trimmed, renderer: "dom-foreign-object" },
    });
  }
}

function isRemoteUrl(url: string): boolean {
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function diagnosticAssetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * A visible, self-contained fallback is safer than either omitting the image
 * or leaving a cross-origin reference in a PNG-bound foreignObject. The host
 * name makes the substitution discoverable without serializing signed query
 * parameters into the exported file.
 */
function remoteAssetPlaceholder(url: string): string {
  let host = "remote source";
  try {
    host = new URL(url).hostname || host;
  } catch {
    // The URL was already resolved successfully before this function is used.
  }
  const label = escapeXml(host.slice(0, 42));
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140" preserveAspectRatio="xMidYMid meet">',
    '<rect width="240" height="140" rx="8" fill="#f8fafc"/>',
    '<rect x="1" y="1" width="238" height="138" rx="7" fill="none" stroke="#94a3b8" stroke-width="2"/>',
    '<path d="M18 104 67 58l33 30 28-25 94 54H18z" fill="#cbd5e1"/>',
    '<circle cx="174" cy="42" r="14" fill="#cbd5e1"/>',
    '<path d="m82 43 76 62M158 43l-76 62" stroke="#dc2626" stroke-width="7" stroke-linecap="round" opacity=".82"/>',
    '<rect x="13" y="111" width="214" height="22" rx="4" fill="#fff" opacity=".94"/>',
    '<text x="120" y="121" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#334155">REMOTE IMAGE UNAVAILABLE IN EXPORT</text>',
    `<text x="120" y="130" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" fill="#64748b">${label}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isAbortFailure(cause: unknown): boolean {
  return isAbortError(cause)
    || (cause instanceof ExportError && cause.code === "ABORTED");
}

function markFallbackOwner(
  owner: Element | string | undefined,
  action: ExportAssetFallbackAction,
  resolvedUrl: string
): void {
  if (!(owner instanceof Element)) return;
  owner.setAttribute("data-export-asset-fallback", action);
  try {
    owner.setAttribute("data-export-asset-host", new URL(resolvedUrl).hostname);
  } catch {
    // Keep the action marker even if the diagnostic host cannot be parsed.
  }
  if (action !== "substituted-placeholder") return;

  const message = "Remote image unavailable in raster export";
  if (owner instanceof HTMLImageElement) {
    if (!owner.alt.trim()) owner.alt = message;
    owner.title = message;
  } else if (owner.tagName.toLowerCase() === "image") {
    owner.setAttribute("aria-label", message);
  }
}

function recordRemoteFallback(
  kind: ExportAssetKind,
  resolvedUrl: string,
  owner: Element | string | undefined,
  action: ExportAssetFallbackAction,
  cause: unknown,
  context: AssetContext
): void {
  markFallbackOwner(owner, action, resolvedUrl);
  const key = `${action}\u0000${kind}\u0000${resolvedUrl}`;
  if (context.warningKeys.has(key)) return;
  context.warningKeys.add(key);

  const element = owner instanceof Element ? elementDescription(owner) : owner;
  const safeUrl = diagnosticAssetUrl(resolvedUrl);
  const rawDetail = cause instanceof Error ? cause.message : String(cause);
  const detail = rawDetail
    .replaceAll(resolvedUrl, safeUrl)
    .replaceAll(encodeURIComponent(resolvedUrl), encodeURIComponent(safeUrl));
  const message = action === "preserved-reference"
    ? `A remote ${kind} could not be embedded; its external reference was preserved in the SVG. ${detail}`
    : `A remote ${kind} could not be embedded safely and was replaced with a visible raster placeholder. ${detail}`;
  context.warnings.push({
    kind: "remote-asset",
    action,
    message,
    url: safeUrl,
    ...(element ? { element } : {}),
  });
}

function fallbackRemoteAsset(
  resolvedUrl: string,
  kind: ExportAssetKind,
  context: AssetContext,
  cause: unknown,
  owner?: Element | string
): string | null {
  if (isAbortFailure(cause) || !isRemoteUrl(resolvedUrl)) return null;

  if (context.preserveRemoteReferences) {
    context.preservedRemoteAssets.add(resolvedUrl);
    recordRemoteFallback(kind, resolvedUrl, owner, "preserved-reference", cause, context);
    return resolvedUrl;
  }

  // Fonts cannot be represented honestly by an image placeholder. In strict
  // PNG mode they continue to fail with the existing precise font diagnostic.
  if (context.substituteInaccessibleRemoteAssets && kind !== "font") {
    context.substitutedRemoteAssets.add(resolvedUrl);
    recordRemoteFallback(kind, resolvedUrl, owner, "substituted-placeholder", cause, context);
    return remoteAssetPlaceholder(resolvedUrl);
  }

  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The fetched asset could not be converted to a data URL."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The fetched asset could not be read."));
    reader.onabort = () => reject(new DOMException("The export was canceled.", "AbortError"));
    reader.readAsDataURL(blob);
  });
}

const GENERIC_BINARY_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.length <= bytes.length
    && signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset + value.length > bytes.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function detectSvgMime(bytes: Uint8Array): string | null {
  if (!bytes.length) return null;
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 16_384)));
  const root = prefix
    .replace(/^\uFEFF?\s*/, "")
    .replace(/^(?:<\?xml[\s\S]*?\?>\s*)?/i, "")
    .replace(/^(?:(?:<!--[\s\S]*?-->|<!doctype\s+svg(?:\s[^>]*)?>)\s*)*/i, "");
  return /^<svg(?:\s|>)/i.test(root) ? "image/svg+xml" : null;
}

function detectIsoBmffImageMime(bytes: Uint8Array): string | null {
  if (!asciiAt(bytes, 4, "ftyp") || bytes.length < 12) return null;
  const brand = new TextDecoder("ascii").decode(bytes.subarray(8, 12)).toLowerCase();
  if (["avif", "avis"].includes(brand)) return "image/avif";
  if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
  if (["mif1", "msf1"].includes(brand)) return "image/heif";
  return null;
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) return "image/gif";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image/webp";
  if (asciiAt(bytes, 0, "BM")) return "image/bmp";
  if (
    startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00])
    || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "image/tiff";
  }
  if (
    startsWithBytes(bytes, [0x00, 0x00, 0x01, 0x00])
    || startsWithBytes(bytes, [0x00, 0x00, 0x02, 0x00])
  ) {
    return "image/x-icon";
  }
  if (
    startsWithBytes(bytes, [0xff, 0x0a])
    || startsWithBytes(bytes, [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])
  ) {
    return "image/jxl";
  }
  return detectIsoBmffImageMime(bytes) ?? detectSvgMime(bytes);
}

function detectFontMime(bytes: Uint8Array): string | null {
  if (asciiAt(bytes, 0, "wOFF")) return "font/woff";
  if (asciiAt(bytes, 0, "wOF2")) return "font/woff2";
  if (asciiAt(bytes, 0, "OTTO")) return "font/otf";
  if (asciiAt(bytes, 0, "ttcf")) return "font/collection";
  if (
    startsWithBytes(bytes, [0x00, 0x01, 0x00, 0x00])
    || asciiAt(bytes, 0, "true")
    || asciiAt(bytes, 0, "typ1")
  ) {
    return "font/ttf";
  }
  // EOT stores its 0x504c magic value at byte offset 34 (little endian).
  if (bytes.length >= 36 && bytes[34] === 0x4c && bytes[35] === 0x50) {
    return "application/vnd.ms-fontobject";
  }
  return null;
}

const IMAGE_MIME_ALIASES: Record<string, string> = {
  "image/apng": "image/png",
  "image/x-png": "image/png",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-ms-bmp": "image/bmp",
  "image/vnd.microsoft.icon": "image/x-icon",
};

function imageMimeMatches(declaredMime: string, detectedMime: string): boolean {
  const declared = IMAGE_MIME_ALIASES[declaredMime] ?? declaredMime;
  if (declared === detectedMime) return true;
  const isoBmffMimes = new Set([
    "image/avif",
    "image/avif-sequence",
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
  ]);
  return isoBmffMimes.has(declared) && isoBmffMimes.has(detectedMime);
}

/**
 * Verifies both the response declaration and its bytes before a fetched
 * resource is allowed into an export data URL. The returned MIME is inferred
 * from the validated bytes so generic binary responses remain renderable.
 */
export function validateFetchedExportAsset(
  contentType: string,
  bytes: Uint8Array,
  kind: ExportAssetKind
): string {
  const declaredMime = normalizedContentType(contentType);
  if (kind === "font") {
    const declaresFont = declaredMime.startsWith("font/")
      || declaredMime.startsWith("application/font-")
      || declaredMime.startsWith("application/x-font-")
      || declaredMime === "application/vnd.ms-fontobject";
    if (!declaresFont && !GENERIC_BINARY_MIME_TYPES.has(declaredMime)) {
      throw new Error("The export asset response did not declare a supported font MIME type.");
    }
    const detectedMime = detectFontMime(bytes);
    if (!detectedMime) {
      throw new Error("The export asset response did not contain recognizable font bytes.");
    }
    return detectedMime;
  }

  if (!declaredMime.startsWith("image/") && !GENERIC_BINARY_MIME_TYPES.has(declaredMime)) {
    throw new Error("The export asset response did not declare an image MIME type.");
  }
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime) {
    throw new Error("The export asset response did not contain recognizable image bytes.");
  }
  if (
    !GENERIC_BINARY_MIME_TYPES.has(declaredMime)
    && !imageMimeMatches(declaredMime, detectedMime)
  ) {
    throw new Error(
      `The export asset response declared ${declaredMime} but contained ${detectedMime} bytes.`
    );
  }
  return detectedMime;
}

async function validatedResponseBlob(
  response: Response,
  kind: ExportAssetKind
): Promise<Blob> {
  const buffer = await response.arrayBuffer();
  const mime = validateFetchedExportAsset(
    response.headers.get("content-type") ?? "",
    new Uint8Array(buffer),
    kind
  );
  return new Blob([buffer], { type: mime });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function remoteCorsCode(kind: ExportAssetKind): "REMOTE_IMAGE_CORS" | "REMOTE_FONT_CORS" {
  return kind === "font" ? "REMOTE_FONT_CORS" : "REMOTE_IMAGE_CORS";
}

function assetFetchError(url: string, kind: ExportAssetKind, cause: unknown): ExportError {
  if (isAbortError(cause)) {
    return new ExportError({
      stage: "prepare-assets",
      code: "ABORTED",
      cause,
      diagnostics: { offendingUrl: url, offendingAssetKind: kind, renderer: "dom-foreign-object" },
    });
  }
  // With mode:"cors", a browser CORS rejection is deliberately exposed as a
  // TypeError. HTTP failures remain ordinary embedding failures below.
  const remote = isRemoteUrl(url) && cause instanceof TypeError;
  return new ExportError({
    stage: "prepare-assets",
    code: remote ? remoteCorsCode(kind) : "ASSET_EMBED_FAILED",
    cause,
    message: remote
      ? `A cross-origin asset could not be embedded: ${url}`
      : `An export asset could not be embedded: ${url}`,
    diagnostics: { offendingUrl: url, offendingAssetKind: kind, renderer: "dom-foreign-object" },
  });
}

async function directFetchDataUrl(
  url: string,
  kind: ExportAssetKind,
  context: AssetContext
): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:", "blob:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported asset protocol: ${parsed.protocol}`);
  }
  const sameOrigin = parsed.protocol === "blob:" || parsed.origin === window.location.origin;
  const response = await fetch(url, {
    mode: "cors",
    credentials: sameOrigin ? "same-origin" : "omit",
    signal: context.signal,
  });
  if (response.type === "opaque") {
    throw new ExportError({
      stage: "prepare-assets",
      code: remoteCorsCode(kind),
      message: `The browser returned an opaque response for export asset: ${url}`,
      diagnostics: { offendingUrl: url, offendingAssetKind: kind, renderer: "dom-foreign-object" },
    });
  }
  if (!response.ok) {
    throw new ExportError({
      stage: "prepare-assets",
      code: "ASSET_EMBED_FAILED",
      message: `Export asset request failed with HTTP ${response.status}: ${url}`,
      diagnostics: { offendingUrl: url, offendingAssetKind: kind, renderer: "dom-foreign-object" },
    });
  }
  const blob = await validatedResponseBlob(response, kind);
  abortIfRequested(context.signal);
  return blobToDataUrl(blob);
}

function proxyAssetKind(kind: ExportAssetKind): "image" | "font" {
  return kind === "font" ? "font" : "image";
}

async function proxyFetchDataUrl(
  url: string,
  kind: ExportAssetKind,
  context: AssetContext
): Promise<string> {
  const response = await fetch("/api/export-asset", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: kind === "font" ? "font/*,application/font-*" : "image/*",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url, kind: proxyAssetKind(kind) }),
    signal: context.signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object"
        && payload !== null
        && "message" in payload
        && typeof payload.message === "string"
      ) {
        detail = `: ${payload.message.slice(0, 300)}`;
      }
    } catch {
      // The HTTP status is sufficient when the proxy did not return JSON.
    }
    throw new Error(`The export asset proxy returned HTTP ${response.status}${detail}`);
  }

  const blob = await validatedResponseBlob(response, kind);
  abortIfRequested(context.signal);
  context.proxiedRemoteAssets.add(url);
  return blobToDataUrl(blob);
}

function combinedRemoteFetchError(
  url: string,
  kind: ExportAssetKind,
  directCause: unknown,
  proxyCause: unknown
): ExportError {
  const directDetail = directCause instanceof Error ? directCause.message : String(directCause);
  const proxyDetail = proxyCause instanceof Error ? proxyCause.message : String(proxyCause);
  const safeUrl = diagnosticAssetUrl(url);
  return new ExportError({
    stage: "prepare-assets",
    code: remoteCorsCode(kind),
    cause: proxyCause,
    message: [
      `A remote export ${kind} could not be embedded directly or through the safe asset proxy: ${safeUrl}`,
      `Direct request: ${directDetail.replaceAll(url, safeUrl)}`,
      `Proxy request: ${proxyDetail.replaceAll(url, safeUrl)}`,
    ].join(" "),
    diagnostics: { offendingUrl: safeUrl, offendingAssetKind: kind, renderer: "dom-foreign-object" },
  });
}

async function fetchDataUrl(
  url: string,
  kind: ExportAssetKind,
  context: AssetContext
): Promise<string> {
  abortIfRequested(context.signal);
  const cacheKey = `${kind}\u0000${url}`;
  const cached = context.cache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    try {
      return await directFetchDataUrl(url, kind, context);
    } catch (cause) {
      const directCause = cause instanceof ExportError ? cause : assetFetchError(url, kind, cause);
      if (isAbortFailure(directCause)) throw directCause;
      if (!isRemoteUrl(url)) throw directCause;

      try {
        return await proxyFetchDataUrl(url, kind, context);
      } catch (proxyCause) {
        if (isAbortFailure(proxyCause)) throw assetFetchError(url, kind, proxyCause);
        throw combinedRemoteFetchError(url, kind, directCause, proxyCause);
      }
    }
  })();

  context.cache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    context.cache.delete(cacheKey);
    throw error;
  }
}

async function embedUrl(
  rawUrl: string,
  kind: ExportAssetKind,
  context: AssetContext,
  owner?: Element | string
): Promise<string> {
  const resolved = resolvedAssetUrl(rawUrl, context.baseUrl);
  if (!resolved) return rawUrl;
  const fallbackKey = `${kind}\u0000${resolved}`;
  const cachedFallback = context.fallbacks.get(fallbackKey);
  if (cachedFallback) {
    markFallbackOwner(
      owner,
      context.substitutedRemoteAssets.has(resolved)
        ? "substituted-placeholder"
        : "preserved-reference",
      resolved
    );
    return cachedFallback;
  }

  try {
    const dataUrl = await fetchDataUrl(resolved, kind, context);
    context.embeddedByKind[kind].add(resolved);
    return dataUrl;
  } catch (cause) {
    const fallback = fallbackRemoteAsset(resolved, kind, context, cause, owner);
    if (fallback === null) throw cause;
    context.fallbacks.set(fallbackKey, fallback);
    return fallback;
  }
}

async function replaceCssUrls(
  cssText: string,
  kind: ExportAssetKind,
  context: AssetContext,
  owner?: Element | string
): Promise<string> {
  const matches = Array.from(cssText.matchAll(URL_FUNCTION_PATTERN));
  if (!matches.length) return cssText;

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    abortIfRequested(context.signal);
    const index = match.index ?? cursor;
    result += cssText.slice(cursor, index);
    const rawUrl = (match[2] ?? match[3] ?? "").trim();
    const embedded = await embedUrl(rawUrl, kind, context, owner);
    result += embedded === rawUrl ? match[0] : `url(\"${embedded}\")`;
    cursor = index + match[0].length;
  }
  return result + cssText.slice(cursor);
}

function assetElementError(element: Element, url: string, cause: unknown): ExportError {
  const inheritedCode = cause instanceof ExportError ? cause.code : undefined;
  return new ExportError({
    stage: "prepare-assets",
    code: inheritedCode,
    cause,
    message: `Could not embed ${elementDescription(element)} asset: ${url}`,
    diagnostics: {
      offendingElement: elementDescription(element),
      offendingUrl: url,
      renderer: "dom-foreign-object",
    },
  });
}

async function embedHtmlImages(root: Element, context: AssetContext): Promise<void> {
  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    abortIfRequested(context.signal);
    const source = image.getAttribute("src") ?? "";
    if (!source || source.startsWith("data:")) {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      continue;
    }
    try {
      image.setAttribute("src", await embedUrl(source, "image", context, image));
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.removeAttribute("crossorigin");
    } catch (cause) {
      throw assetElementError(image, source, cause);
    }
  }

  // A <picture> source can override the now-embedded <img> source.
  for (const source of Array.from(root.querySelectorAll("picture source"))) {
    source.removeAttribute("srcset");
    source.removeAttribute("sizes");
  }
}

async function embedSvgImages(root: Element, context: AssetContext): Promise<void> {
  for (const image of Array.from(root.querySelectorAll<SVGImageElement>("image"))) {
    abortIfRequested(context.signal);
    const href = image.getAttribute("href")
      ?? image.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      ?? "";
    if (!href || href.startsWith("data:") || href.startsWith("#")) continue;
    try {
      const embedded = await embedUrl(href, "image", context, image);
      image.setAttribute("href", embedded);
      image.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    } catch (cause) {
      throw assetElementError(image, href, cause);
    }
  }
}

async function embedInlineStyleAssets(root: Element, context: AssetContext): Promise<void> {
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    abortIfRequested(context.signal);
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
    const properties = Array.from({ length: element.style.length }, (_, index) => element.style.item(index));
    for (const property of properties) {
      if (!property) continue;
      const value = element.style.getPropertyValue(property);
      if (!value.toLowerCase().includes("url(")) continue;
      try {
        element.style.setProperty(
          property,
          await replaceCssUrls(value, "style", context, element),
          element.style.getPropertyPriority(property)
        );
      } catch (cause) {
        throw assetElementError(element, value, cause);
      }
    }
  }

  for (const style of Array.from(root.querySelectorAll<HTMLStyleElement>("style"))) {
    const cssText = style.textContent ?? "";
    if (!cssText.toLowerCase().includes("url(")) continue;
    try {
      style.textContent = await replaceCssUrls(cssText, "style", context, style);
    } catch (cause) {
      throw assetElementError(style, cssText.slice(0, 160), cause);
    }
  }
}

function normalizeFontFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
}

function usedFontFamilies(root: Element): Set<string> {
  const families = new Set<string>();
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
    const value = element.style.getPropertyValue("font-family");
    for (const family of value.split(",")) {
      const normalized = normalizeFontFamily(family);
      if (normalized) families.add(normalized);
    }
  }
  return families;
}

const EXPORT_SAFE_FONT_STACK = [
  '"Nirmala UI"',
  "Mangal",
  '"Kohinoor Devanagari"',
  '"Devanagari Sangam MN"',
  "Arial",
  "Helvetica",
  "sans-serif",
].join(", ");

function applyUnavailableFontFallback(root: Element, unavailableFamily: string): number {
  let changed = 0;
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
    const current = element.style.getPropertyValue("font-family");
    if (!current.split(",").some((family) => normalizeFontFamily(family) === unavailableFamily)) {
      continue;
    }
    const priority = element.style.getPropertyPriority("font-family");
    element.style.setProperty("font-family", EXPORT_SAFE_FONT_STACK, priority);
    element.setAttribute("data-export-font-fallback", unavailableFamily);
    changed += 1;
  }
  return changed;
}

function collectFontFaceRules(
  rules: CSSRuleList,
  fallbackBaseUrl: string,
  output: FontFaceSource[],
  warnings: ExportAssetWarning[],
  visitedSheets: Set<CSSStyleSheet>
): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === CSSRule.FONT_FACE_RULE) {
      const face = rule as CSSFontFaceRule;
      output.push({
        cssText: face.cssText,
        family: normalizeFontFamily(face.style.getPropertyValue("font-family")),
        baseUrl: face.parentStyleSheet?.href ?? fallbackBaseUrl,
        ...(face.parentStyleSheet?.href ? { stylesheetUrl: face.parentStyleSheet.href } : {}),
      });
      continue;
    }

    if (rule.type === CSSRule.IMPORT_RULE) {
      const imported = (rule as CSSImportRule).styleSheet;
      if (!imported || visitedSheets.has(imported)) continue;
      visitedSheets.add(imported);
      try {
        collectFontFaceRules(
          imported.cssRules,
          imported.href ?? fallbackBaseUrl,
          output,
          warnings,
          visitedSheets
        );
      } catch (cause) {
        warnings.push({
          kind: "stylesheet",
          message: cause instanceof Error ? cause.message : "An imported stylesheet was inaccessible.",
          ...(imported.href ? { url: imported.href } : {}),
        });
      }
      continue;
    }

    if ("cssRules" in rule) {
      try {
        collectFontFaceRules(
          (rule as CSSGroupingRule).cssRules,
          rule.parentStyleSheet?.href ?? fallbackBaseUrl,
          output,
          warnings,
          visitedSheets
        );
      } catch (cause) {
        warnings.push({
          kind: "stylesheet",
          message: cause instanceof Error ? cause.message : "A nested stylesheet rule was inaccessible.",
          ...(rule.parentStyleSheet?.href ? { url: rule.parentStyleSheet.href } : {}),
        });
      }
    }
  }
}

function documentFontFaces(warnings: ExportAssetWarning[]): FontFaceSource[] {
  const output: FontFaceSource[] = [];
  const visitedSheets = new Set<CSSStyleSheet>();
  for (const sheet of Array.from(document.styleSheets)) {
    if (visitedSheets.has(sheet)) continue;
    visitedSheets.add(sheet);
    try {
      collectFontFaceRules(
        sheet.cssRules,
        sheet.href ?? document.baseURI,
        output,
        warnings,
        visitedSheets
      );
    } catch (cause) {
      warnings.push({
        kind: "stylesheet",
        message: cause instanceof Error ? cause.message : "A stylesheet was inaccessible.",
        ...(sheet.href ? { url: sheet.href } : {}),
      });
    }
  }
  return output;
}

async function embeddedFontCss(
  root: Element,
  context: AssetContext,
  strict: boolean,
  warnings: ExportAssetWarning[]
): Promise<string> {
  const usedFamilies = usedFontFamilies(root);
  const faces = documentFontFaces(warnings).filter((face) =>
    !usedFamilies.size || !face.family || usedFamilies.has(face.family)
  );
  const embedded = new Set<string>();
  const failedFamilies = new Set<string>();

  for (const face of faces) {
    abortIfRequested(context.signal);
    try {
      const cssText = await replaceCssUrls(face.cssText, "font", {
        ...context,
        baseUrl: face.baseUrl,
      }, face.stylesheetUrl ? `@font-face (${diagnosticAssetUrl(face.stylesheetUrl)})` : "@font-face");
      embedded.add(cssText);
    } catch (cause) {
      if (cause instanceof ExportError && cause.code === "ABORTED") throw cause;
      const warning: ExportAssetWarning = {
        kind: "font-resource",
        message: cause instanceof Error ? cause.message : "A font resource could not be embedded.",
        ...(face.stylesheetUrl ? { url: face.stylesheetUrl } : {}),
      };
      warnings.push(warning);
      if (face.family) failedFamilies.add(face.family);
      if (strict) {
        throw new ExportError({
          stage: "prepare-assets",
          code: cause instanceof ExportError ? cause.code : "FONT_LOAD_FAILED",
          cause,
          message: warning.message,
          diagnostics: {
            offendingUrl: warning.url,
            offendingAssetKind: "font",
            renderer: "dom-foreign-object",
          },
        });
      }
    }
  }

  for (const family of failedFamilies) {
    // Families commonly use separate unicode-range or weight faces. If even
    // one required face fails, retaining the family can silently lose its
    // Devanagari glyphs even though another face embedded successfully.
    const changed = applyUnavailableFontFallback(root, family);
    warnings.push({
      kind: "font-resource",
      action: "font-fallback",
      message: changed
        ? `The unavailable font “${family}” was replaced with a browser-safe export font on ${changed} element${changed === 1 ? "" : "s"}.`
        : `The unavailable font “${family}” was replaced with a browser-safe export font.`,
    });
  }
  return Array.from(embedded).join("\n");
}

export async function waitForExportFonts(
  options: Pick<ExportAssetOptions, "fontTimeoutMs" | "signal"> = {}
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const timeoutMs = Math.max(1, options.fontTimeoutMs ?? DEFAULT_FONT_TIMEOUT_MS);
  abortIfRequested(options.signal);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new ExportError({
        stage: "prepare-assets",
        code: "FONT_LOAD_TIMEOUT",
        message: `Fonts did not finish loading within ${timeoutMs} ms.`,
        diagnostics: { renderer: "dom-foreign-object" },
      })), timeoutMs);
    });
    const abortPromise = new Promise<never>((_, reject) => {
      if (!options.signal) return;
      abortListener = () => reject(new DOMException("The export was canceled.", "AbortError"));
      options.signal.addEventListener("abort", abortListener, { once: true });
    });
    await Promise.race([document.fonts.ready, timeoutPromise, abortPromise]);
  } catch (cause) {
    if (cause instanceof ExportError) throw cause;
    throw new ExportError({
      stage: "prepare-assets",
      code: cause instanceof DOMException && cause.name === "AbortError" ? "ABORTED" : "FONT_LOAD_FAILED",
      cause,
      diagnostics: { renderer: "dom-foreign-object" },
    });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abortListener && options.signal) options.signal.removeEventListener("abort", abortListener);
  }
}

/**
 * Makes all URL-backed resources in a detached export clone self-contained.
 * The function mutates only the supplied clone, never the live board.
 */
export async function embedDomExportAssets(
  root: Element,
  options: ExportAssetOptions = {}
): Promise<ExportAssetReport> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ExportError({
      stage: "prepare-assets",
      code: "ASSET_EMBED_FAILED",
      message: "DOM asset embedding is only available in the browser.",
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }

  const warnings: ExportAssetWarning[] = [];
  const context: AssetContext = {
    baseUrl: options.baseUrl ?? document.baseURI,
    signal: options.signal,
    preserveRemoteReferences: options.preserveRemoteReferences ?? false,
    substituteInaccessibleRemoteAssets: options.substituteInaccessibleRemoteAssets ?? false,
    cache: new Map(),
    fallbacks: new Map(),
    embeddedByKind: {
      image: new Set(),
      style: new Set(),
      font: new Set(),
    },
    proxiedRemoteAssets: new Set(),
    preservedRemoteAssets: new Set(),
    substitutedRemoteAssets: new Set(),
    warningKeys: new Set(),
    warnings,
  };

  try {
    await embedHtmlImages(root, context);
    await embedSvgImages(root, context);
    await embedInlineStyleAssets(root, context);
    const fontFaceCss = await embeddedFontCss(
      root,
      context,
      options.strictFontEmbedding ?? false,
      warnings
    );
    return {
      embeddedImageCount: context.embeddedByKind.image.size,
      embeddedStyleAssetCount: context.embeddedByKind.style.size,
      embeddedFontCount: context.embeddedByKind.font.size,
      proxiedRemoteAssetCount: context.proxiedRemoteAssets.size,
      preservedRemoteAssetCount: context.preservedRemoteAssets.size,
      substitutedRemoteAssetCount: context.substitutedRemoteAssets.size,
      fontFaceCss,
      warnings,
    };
  } catch (cause) {
    if (cause instanceof ExportError) throw cause;
    throw new ExportError({
      stage: "prepare-assets",
      cause,
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }
}
