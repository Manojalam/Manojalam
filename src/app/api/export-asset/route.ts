import {
  ExportAssetProxyError,
  fetchExportAsset,
} from "@/lib/export/server-asset-proxy";

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

function errorResponse(error: ExportAssetProxyError): Response {
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

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(new ExportAssetProxyError(
      "INVALID_URL",
      413,
      "The export asset request is too large."
    ));
  }

  let url: string;
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
  } catch (cause) {
    if (cause instanceof ExportAssetProxyError) return errorResponse(cause);
    return errorResponse(new ExportAssetProxyError(
      "INVALID_URL",
      400,
      "Provide a valid remote image URL."
    ));
  }

  try {
    const asset = await fetchExportAsset(url, request.signal);
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
      "The remote image could not be fetched."
    ));
  }
}
