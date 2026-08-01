import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_AUDIO_BYTES,
  estimatedDataUrlBytes,
  mediaAttachmentBaseName,
  mediaFileMimeType,
  moveMediaAttachment,
  normalizeMediaAttachments,
  renamedMediaAttachmentName,
  validateMediaFile,
} from "./node-media";
import {
  relationshipDiagramItemMediaAttachments,
  relationshipDiagramItemStylesWithMedia,
} from "../relationship-diagram-item-media";

const ONE_BYTE_PNG = "data:image/png;base64,AA==";

test("infers a supported MIME type when a browser omits it", () => {
  assert.equal(mediaFileMimeType({ name: "recitation.M4A", size: 12, type: "" }), "audio/mp4");
  assert.equal(
    mediaFileMimeType({
      name: "recitation.mp3",
      size: 12,
      type: "application/octet-stream",
    }),
    "audio/mpeg"
  );
  assert.equal(
    mediaFileMimeType({ name: "recitation.wav", size: 12, type: "audio/vnd.wave" }),
    "audio/wav"
  );
  assert.equal(validateMediaFile(
    { name: "recitation.M4A", size: 12, type: "" },
    "audio"
  ), null);
});

test("rejects mismatched or oversized files", () => {
  assert.match(
    validateMediaFile({ name: "notes.txt", size: 20, type: "text/plain" }, "image") ?? "",
    /PNG/
  );
  assert.match(
    validateMediaFile(
      { name: "large.mp3", size: MAX_AUDIO_BYTES + 1, type: "audio/mpeg" },
      "audio"
    ) ?? "",
    /6 MB/
  );
});

test("calculates base64 payload size without counting the data URL header", () => {
  assert.equal(estimatedDataUrlBytes(ONE_BYTE_PNG), 1);
});

test("normalizes safe persisted attachments and drops malformed payloads", () => {
  const normalized = normalizeMediaAttachments([
    {
      id: "image-1",
      kind: "image",
      name: " diagram.png ",
      mimeType: "image/png",
      size: 999,
      dataUrl: ONE_BYTE_PNG,
      createdAt: "2026-07-29T12:00:00.000Z",
      width: 20,
      height: 10,
    },
    {
      id: "unsafe-svg",
      kind: "image",
      name: "unsafe.svg",
      mimeType: "image/svg+xml",
      size: 1,
      dataUrl: "data:image/svg+xml;base64,AA==",
      createdAt: "2026-07-29T12:00:00.000Z",
    },
    {
      id: "wrong-kind",
      kind: "audio",
      name: "not-audio.mp3",
      mimeType: "audio/mpeg",
      size: 1,
      dataUrl: ONE_BYTE_PNG,
      createdAt: "2026-07-29T12:00:00.000Z",
    },
  ]);

  assert.deepEqual(normalized, [{
    id: "image-1",
    kind: "image",
    name: "diagram.png",
    mimeType: "image/png",
    size: 1,
    dataUrl: ONE_BYTE_PNG,
    createdAt: "2026-07-29T12:00:00.000Z",
    width: 20,
    height: 10,
  }]);
});

test("renames attachments while preserving their file extension", () => {
  assert.equal(mediaAttachmentBaseName("voice-recording.webm"), "voice-recording");
  assert.equal(
    renamedMediaAttachmentName("voice-recording.webm", "Opening chant"),
    "Opening chant.webm"
  );
  assert.equal(
    renamedMediaAttachmentName("voice-recording.webm", "Opening chant.webm"),
    "Opening chant.webm"
  );
  assert.equal(renamedMediaAttachmentName("voice-recording.webm", "  "), null);
});

test("moves attachments one position without changing their payloads", () => {
  const attachments = [
    { id: "first", name: "First.webm" },
    { id: "second", name: "Second.webm" },
    { id: "third", name: "Third.webm" },
  ] as unknown as Parameters<typeof moveMediaAttachment>[0];

  assert.deepEqual(
    moveMediaAttachment(attachments, "second", -1).map((attachment) => attachment.id),
    ["second", "first", "third"]
  );
  assert.equal(moveMediaAttachment(attachments, "first", -1), attachments);
});

test("stores media on one relationship item without disturbing its styling", () => {
  const attachment = normalizeMediaAttachments([{
    id: "audio-1",
    kind: "audio",
    name: "petal.mp3",
    mimeType: "audio/mpeg",
    size: 1,
    dataUrl: "data:audio/mpeg;base64,YQ==",
    createdAt: "2026-07-31T00:00:00.000Z",
  }])[0];
  assert.ok(attachment);

  const styles = relationshipDiagramItemStylesWithMedia({
    petal: { fillColor: "#334155" },
  }, "petal", [attachment]);

  assert.equal(styles?.petal.fillColor, "#334155");
  assert.deepEqual(
    relationshipDiagramItemMediaAttachments(styles, "petal"),
    [attachment]
  );
  assert.equal(
    relationshipDiagramItemStylesWithMedia(styles, "petal", [])?.petal.fillColor,
    "#334155"
  );
});
