import {
  ExportAssetProxyError,
  fetchExportAsset,
  type ExportProxyAssetKind,
} from "@/lib/export/server-asset-proxy";
import {
  isSameOriginExportRequest,
} from "@/lib/export/route-security";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 12_000;

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ExportAssetProxyError(
          "INVALID_URL",
          413,
          "The export asset request is too large."
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

interface ExportRouteError {
  code: string;
  message: string;
  status: number;
}

function errorResponse(error: ExportRouteError): Response {
  return Response.json(
    { code: error.code, message: error.message },
    {
      status: error.status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    }
  );
}

async function cancelRequestBody(request: Request): Promise<void> {
  try {
    await request.body?.cancel();
  } catch {
    // The browser may already have aborted or locked the request stream.
  }
}

/**
 * Local-only installations intentionally work without Supabase. Once cloud
 * auth is configured, the proxy is available only to a verified user.
 */
async function hasAuthenticatedExportUser(): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return true;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return !error && Boolean(user);
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginExportRequest(request)) {
    await cancelRequestBody(request);
    return errorResponse({
      code: "FORBIDDEN_REQUEST",
      message: "Export assets can only be requested from this application.",
      status: 403,
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    await cancelRequestBody(request);
    return errorResponse(new ExportAssetProxyError(
      "INVALID_URL",
      413,
      "The export asset request is too large."
    ));
  }

  if (!(await hasAuthenticatedExportUser())) {
    await cancelRequestBody(request);
    return errorResponse({
      code: "UNAUTHENTICATED",
      message: "Sign in before exporting remote assets.",
      status: 401,
    });
  }

  let url: string;
  let kind: ExportProxyAssetKind = "image";
  try {
    const payload = await readBoundedJson(request);
    if (
      typeof payload !== "object"
      || payload === null
      || !("url" in payload)
      || typeof payload.url !== "string"
    ) {
      throw new Error("Missing URL");
    }
    url = payload.url;
    const requestedKind = "kind" in payload ? payload.kind : "image";
    if (requestedKind !== "image" && requestedKind !== "font") {
      throw new Error("Invalid asset kind");
    }
    kind = requestedKind;
  } catch (cause) {
    if (cause instanceof ExportAssetProxyError) return errorResponse(cause);
    return errorResponse(new ExportAssetProxyError(
      "INVALID_URL",
      400,
      "Provide a valid remote asset URL and kind."
    ));
  }

  try {
    const asset = await fetchExportAsset(url, kind, request.signal);
    const body = new ArrayBuffer(asset.bytes.byteLength);
    new Uint8Array(body).set(asset.bytes);
    return new Response(body, {
      headers: {
        "cache-control": "private, max-age=300, no-transform",
        "content-disposition": "attachment; filename=export-asset",
        "content-length": String(asset.bytes.byteLength),
        "content-security-policy": "sandbox; default-src 'none'",
        "content-type": asset.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (cause) {
    if (cause instanceof ExportAssetProxyError) return errorResponse(cause);
    console.error("[Manojalam export asset proxy]", cause);
    return errorResponse(new ExportAssetProxyError(
      "UPSTREAM_RESPONSE",
      502,
      `The remote ${kind} could not be fetched.`
    ));
  }
}
