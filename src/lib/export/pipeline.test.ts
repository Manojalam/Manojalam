import assert from "node:assert/strict";
import test from "node:test";

import { encodeCanvasRaster } from "./pipeline";

test("encodes JPG with the JPEG MIME type and quality", async () => {
  let requestedType: string | undefined;
  let requestedQuality: number | undefined;
  const canvas = {
    toBlob: (
      callback: BlobCallback,
      type?: string,
      quality?: number
    ) => {
      requestedType = type;
      requestedQuality = quality;
      callback(new Blob(["jpg"], { type }));
    },
  } as unknown as HTMLCanvasElement;

  const blob = await encodeCanvasRaster(canvas, "jpg");

  assert.equal(blob.type, "image/jpeg");
  assert.equal(requestedType, "image/jpeg");
  assert.equal(requestedQuality, 0.92);
});

test("keeps PNG encoding lossless without a quality override", async () => {
  let requestedType: string | undefined;
  let requestedQuality: number | undefined;
  const canvas = {
    toBlob: (
      callback: BlobCallback,
      type?: string,
      quality?: number
    ) => {
      requestedType = type;
      requestedQuality = quality;
      callback(new Blob(["png"], { type }));
    },
  } as unknown as HTMLCanvasElement;

  const blob = await encodeCanvasRaster(canvas, "png");

  assert.equal(blob.type, "image/png");
  assert.equal(requestedType, "image/png");
  assert.equal(requestedQuality, undefined);
});
