import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import {
  BlockList,
  isIP,
  type LookupFunction,
} from "node:net";
import type { LookupAddress } from "node:dns";
import type { IncomingHttpHeaders } from "node:http";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_URL_LENGTH = 8_192;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ExportProxyAssetKind = "image" | "font";

const FONT_CONTENT_TYPES = new Set([
  "application/font-sfnt",
  "application/font-woff",
  "application/font-woff2",
  "application/vnd.ms-fontobject",
  "application/x-font-opentype",
  "application/x-font-ttf",
  "application/x-font-woff",
  "application/x-font-woff2",
  "font/collection",
  "font/otf",
  "font/sfnt",
  "font/ttf",
  "font/woff",
  "font/woff2",
]);

const BLOCKED_ADDRESSES = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export type ExportAssetProxyErrorCode =
  | "INVALID_URL"
  | "BLOCKED_TARGET"
  | "DNS_FAILED"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "TOO_MANY_REDIRECTS"
  | "UPSTREAM_RESPONSE"
  | "NOT_IMAGE"
  | "NOT_FONT"
  | "ASSET_TOO_LARGE";

export class ExportAssetProxyError extends Error {
  readonly code: ExportAssetProxyErrorCode;
  readonly status: number;

  constructor(code: ExportAssetProxyErrorCode, status: number, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExportAssetProxyError";
    this.code = code;
    this.status = status;
  }
}

export interface ProxiedExportAsset {
  bytes: Uint8Array;
  contentType: string;
}

interface UpstreamResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body?: Uint8Array;
  contentType?: string;
}

interface DestroyableTransfer {
  readonly destroyed?: boolean;
  destroy(): void;
}

/**
 * Stops both halves of an upstream transfer without draining an untrusted
 * response body. Exported so the early-termination contract can be tested
 * without opening a real network connection.
 */
export function destroyExportAssetTransfer(
  response?: DestroyableTransfer,
  request?: DestroyableTransfer
): void {
  if (response && !response.destroyed) response.destroy();
  if (request && !request.destroyed) request.destroy();
}

function normalizedHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.toLowerCase().replace(/\.+$/, "");
}

export function validateExportAssetUrl(rawUrl: string): URL {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "The remote asset URL is missing or too long.");
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch (cause) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "The remote asset URL is invalid.", cause);
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new ExportAssetProxyError("INVALID_URL", 400, "Only HTTP and HTTPS asset URLs are supported.");
  }
  if (target.username || target.password) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "Remote asset URLs cannot contain credentials.");
  }

  const hostname = normalizedHostname(target.hostname);
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
  ) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote asset host is not publicly routable.");
  }
  const literalFamily = isIP(hostname);
  if (literalFamily && addressIsBlocked(hostname, literalFamily)) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote asset host is a private or reserved address.");
  }

  return target;
}

function addressIsBlocked(address: string, family: number): boolean {
  return family === 4
    ? BLOCKED_ADDRESSES.check(address, "ipv4")
    : BLOCKED_ADDRESSES.check(address, "ipv6");
}

async function resolvePublicAddresses(target: URL): Promise<LookupAddress[]> {
  const hostname = normalizedHostname(target.hostname);
  const literalFamily = isIP(hostname);
  let addresses: LookupAddress[];

  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (cause) {
      throw new ExportAssetProxyError("DNS_FAILED", 502, "The remote asset host could not be resolved.", cause);
    }
  }

  if (!addresses.length) {
    throw new ExportAssetProxyError("DNS_FAILED", 502, "The remote asset host did not resolve to an address.");
  }
  if (addresses.some(({ address, family }) => addressIsBlocked(address, family))) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote asset host resolves to a private or reserved address.");
  }

  return addresses.sort((left, right) => left.family - right.family);
}

function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily = options.family === 4 || options.family === 6
      ? options.family
      : undefined;
    const candidates = requestedFamily
      ? addresses.filter(({ family }) => family === requestedFamily)
      : addresses;
    const available = candidates.length ? candidates : addresses;

    if (options.all) {
      callback(null, available);
      return;
    }

    const selected = available[0];
    callback(null, selected.address, selected.family);
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedContentType(headers: IncomingHttpHeaders): string {
  const raw = firstHeader(headers["content-type"]);
  return raw?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedExportAssetContentType(
  contentType: string,
  kind: ExportProxyAssetKind
): boolean {
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (kind === "image") return mime.startsWith("image/");
  // Some CDNs serve WOFF/WOFF2 as an opaque binary download. It is safe to
  // pass through the font decoder because the response remains attachment-only,
  // byte-limited, and never executes in this route.
  return FONT_CONTENT_TYPES.has(mime) || mime === "application/octet-stream";
}

export function hasRecognizedFontSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return signature === "wOFF"
    || signature === "wOF2"
    || signature === "OTTO"
    || signature === "true"
    || signature === "ttcf"
    || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
}

function acceptedContentType(
  headers: IncomingHttpHeaders,
  kind: ExportProxyAssetKind
): string | null {
  const mime = normalizedContentType(headers);
  return isAllowedExportAssetContentType(mime, kind) ? mime : null;
}

function declaredLength(headers: IncomingHttpHeaders): number | null {
  const raw = firstHeader(headers["content-length"]);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function requestOnce(
  target: URL,
  addresses: LookupAddress[],
  kind: ExportProxyAssetKind,
  signal?: AbortSignal
): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    let settled = false;
    let activeResponse: http.IncomingMessage | undefined;
    // The abort handler must exist before the request is created, including
    // for an already-aborted signal, so this lifecycle reference starts empty.
    // eslint-disable-next-line prefer-const
    let request: http.ClientRequest | undefined;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimeout);
      signal?.removeEventListener("abort", abortRequest);
      callback();
    };
    const fail = (error: unknown) => finish(() => reject(error));
    const abortRequest = () => {
      const error = new ExportAssetProxyError("REQUEST_ABORTED", 408, `The remote ${kind} request was canceled.`);
      destroyExportAssetTransfer(activeResponse, request);
      fail(error);
    };
    const totalTimeout = setTimeout(() => {
      const error = new ExportAssetProxyError("REQUEST_TIMEOUT", 504, `The remote ${kind} request timed out.`);
      destroyExportAssetTransfer(activeResponse, request);
      fail(error);
    }, REQUEST_TIMEOUT_MS);

    if (signal?.aborted) {
      abortRequest();
      return;
    }
    signal?.addEventListener("abort", abortRequest, { once: true });

    request = transport.request(target, {
      method: "GET",
      headers: {
        accept: kind === "font"
          ? "font/woff2,font/woff,font/ttf,font/otf,application/font-woff2,application/font-woff,application/octet-stream;q=0.5"
          : "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8",
        "accept-encoding": "identity",
        "user-agent": "Manojalam-export/1.0",
      },
      lookup: pinnedLookup(addresses),
    }, (response) => {
      activeResponse = response;
      const status = response.statusCode ?? 0;
      const headers = response.headers;

      if (REDIRECT_STATUSES.has(status) || status < 200 || status >= 300) {
        destroyExportAssetTransfer(response, request);
        finish(() => resolve({ status, headers }));
        return;
      }

      const contentType = acceptedContentType(headers, kind);
      if (!contentType) {
        destroyExportAssetTransfer(response, request);
        fail(new ExportAssetProxyError(
          kind === "font" ? "NOT_FONT" : "NOT_IMAGE",
          415,
          `The remote server did not return a ${kind}.`
        ));
        return;
      }

      const contentEncoding = firstHeader(headers["content-encoding"]);
      if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
        destroyExportAssetTransfer(response, request);
        fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} server ignored the identity encoding request.`));
        return;
      }

      const length = declaredLength(headers);
      if (length !== null && length > MAX_RESPONSE_BYTES) {
        destroyExportAssetTransfer(response, request);
        fail(new ExportAssetProxyError("ASSET_TOO_LARGE", 413, `The remote ${kind} exceeds the 16 MB export limit.`));
        return;
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      response.on("data", (chunk: Buffer) => {
        bytesRead += chunk.byteLength;
        if (bytesRead > MAX_RESPONSE_BYTES) {
          const error = new ExportAssetProxyError("ASSET_TOO_LARGE", 413, `The remote ${kind} exceeds the 16 MB export limit.`);
          destroyExportAssetTransfer(response, request);
          fail(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Uint8Array.from(Buffer.concat(chunks, bytesRead));
        if (
          kind === "font"
          && contentType === "application/octet-stream"
          && !hasRecognizedFontSignature(body)
        ) {
          fail(new ExportAssetProxyError(
            "NOT_FONT",
            415,
            "The remote server returned an unrecognized binary file instead of a font."
          ));
          return;
        }
        finish(() => resolve({ status, headers, body, contentType }));
      });
      response.on("aborted", () => {
        destroyExportAssetTransfer(response, request);
        fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} response ended unexpectedly.`));
      });
      response.on("error", (cause) => {
        destroyExportAssetTransfer(response, request);
        fail(cause);
      });
    });

    request.on("error", (cause) => {
      destroyExportAssetTransfer(activeResponse, request);
      if (cause instanceof ExportAssetProxyError) {
        fail(cause);
        return;
      }
      fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} request failed.`, cause));
    });
    request.end();
  });
}

export async function fetchExportAsset(
  rawUrl: string,
  kind: ExportProxyAssetKind = "image",
  signal?: AbortSignal
): Promise<ProxiedExportAsset> {
  let target = validateExportAssetUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // Resolve and pin the public address for every hop. This prevents both
    // redirects to private services and DNS rebinding between validation and IO.
    const addresses = await resolvePublicAddresses(target);
    const response = await requestOnce(target, addresses, kind, signal);

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount === MAX_REDIRECTS) {
        throw new ExportAssetProxyError("TOO_MANY_REDIRECTS", 502, `The remote ${kind} returned too many redirects.`);
      }
      const location = firstHeader(response.headers.location);
      if (!location) {
        throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} redirect did not include a destination.`);
      }
      try {
        target = validateExportAssetUrl(new URL(location, target).href);
      } catch (cause) {
        if (cause instanceof ExportAssetProxyError) throw cause;
        throw new ExportAssetProxyError("INVALID_URL", 400, `The remote ${kind} redirect was invalid.`, cause);
      }
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} server returned HTTP ${response.status}.`);
    }
    if (!response.body?.byteLength || !response.contentType) {
      throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote ${kind} response was empty.`);
    }

    return { bytes: response.body, contentType: response.contentType };
  }

  throw new ExportAssetProxyError("TOO_MANY_REDIRECTS", 502, `The remote ${kind} returned too many redirects.`);
}
