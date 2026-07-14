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

function normalizedHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.toLowerCase().replace(/\.+$/, "");
}

export function validateExportAssetUrl(rawUrl: string): URL {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "The remote image URL is missing or too long.");
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch (cause) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "The remote image URL is invalid.", cause);
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new ExportAssetProxyError("INVALID_URL", 400, "Only HTTP and HTTPS image URLs are supported.");
  }
  if (target.username || target.password) {
    throw new ExportAssetProxyError("INVALID_URL", 400, "Remote image URLs cannot contain credentials.");
  }

  const hostname = normalizedHostname(target.hostname);
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
  ) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote image host is not publicly routable.");
  }
  const literalFamily = isIP(hostname);
  if (literalFamily && addressIsBlocked(hostname, literalFamily)) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote image host is a private or reserved address.");
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
      throw new ExportAssetProxyError("DNS_FAILED", 502, "The remote image host could not be resolved.", cause);
    }
  }

  if (!addresses.length) {
    throw new ExportAssetProxyError("DNS_FAILED", 502, "The remote image host did not resolve to an address.");
  }
  if (addresses.some(({ address, family }) => addressIsBlocked(address, family))) {
    throw new ExportAssetProxyError("BLOCKED_TARGET", 403, "The remote image host resolves to a private or reserved address.");
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

function imageContentType(headers: IncomingHttpHeaders): string | null {
  const raw = firstHeader(headers["content-type"]);
  const mime = raw?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mime.startsWith("image/") ? mime : null;
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
  signal?: AbortSignal
): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    let settled = false;
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
      const error = new ExportAssetProxyError("REQUEST_ABORTED", 408, "The remote image request was canceled.");
      request?.destroy(error);
      fail(error);
    };
    const totalTimeout = setTimeout(() => {
      const error = new ExportAssetProxyError("REQUEST_TIMEOUT", 504, "The remote image request timed out.");
      request?.destroy(error);
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
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8",
        "accept-encoding": "identity",
        "user-agent": "Manojalam-export/1.0",
      },
      lookup: pinnedLookup(addresses),
    }, (response) => {
      const status = response.statusCode ?? 0;
      const headers = response.headers;

      if (REDIRECT_STATUSES.has(status) || status < 200 || status >= 300) {
        response.resume();
        finish(() => resolve({ status, headers }));
        return;
      }

      const contentType = imageContentType(headers);
      if (!contentType) {
        response.resume();
        fail(new ExportAssetProxyError("NOT_IMAGE", 415, "The remote server did not return an image."));
        return;
      }

      const contentEncoding = firstHeader(headers["content-encoding"]);
      if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
        response.resume();
        fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, "The remote image server ignored the identity encoding request."));
        return;
      }

      const length = declaredLength(headers);
      if (length !== null && length > MAX_RESPONSE_BYTES) {
        response.resume();
        fail(new ExportAssetProxyError("ASSET_TOO_LARGE", 413, "The remote image exceeds the 16 MB export limit."));
        return;
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      response.on("data", (chunk: Buffer) => {
        bytesRead += chunk.byteLength;
        if (bytesRead > MAX_RESPONSE_BYTES) {
          const error = new ExportAssetProxyError("ASSET_TOO_LARGE", 413, "The remote image exceeds the 16 MB export limit.");
          response.destroy(error);
          fail(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Uint8Array.from(Buffer.concat(chunks, bytesRead));
        finish(() => resolve({ status, headers, body, contentType }));
      });
      response.on("aborted", () => {
        fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, "The remote image response ended unexpectedly."));
      });
      response.on("error", fail);
    });

    request.on("error", (cause) => {
      if (cause instanceof ExportAssetProxyError) {
        fail(cause);
        return;
      }
      fail(new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, "The remote image request failed.", cause));
    });
    request.end();
  });
}

export async function fetchExportAsset(
  rawUrl: string,
  signal?: AbortSignal
): Promise<ProxiedExportAsset> {
  let target = validateExportAssetUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // Resolve and pin the public address for every hop. This prevents both
    // redirects to private services and DNS rebinding between validation and IO.
    const addresses = await resolvePublicAddresses(target);
    const response = await requestOnce(target, addresses, signal);

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount === MAX_REDIRECTS) {
        throw new ExportAssetProxyError("TOO_MANY_REDIRECTS", 502, "The remote image returned too many redirects.");
      }
      const location = firstHeader(response.headers.location);
      if (!location) {
        throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, "The remote image redirect did not include a destination.");
      }
      try {
        target = validateExportAssetUrl(new URL(location, target).href);
      } catch (cause) {
        if (cause instanceof ExportAssetProxyError) throw cause;
        throw new ExportAssetProxyError("INVALID_URL", 400, "The remote image redirect was invalid.", cause);
      }
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, `The remote image server returned HTTP ${response.status}.`);
    }
    if (!response.body?.byteLength || !response.contentType) {
      throw new ExportAssetProxyError("UPSTREAM_RESPONSE", 502, "The remote image response was empty.");
    }

    return { bytes: response.body, contentType: response.contentType };
  }

  throw new ExportAssetProxyError("TOO_MANY_REDIRECTS", 502, "The remote image returned too many redirects.");
}
