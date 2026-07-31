import test from "node:test";
import assert from "node:assert/strict";
import {
  audioFileExtension,
  formatRecordingDuration,
  microphoneErrorMessage,
  preferredAudioMimeType,
} from "./audio-recording";

test("preferredAudioMimeType chooses the first supported recording format", () => {
  assert.equal(
    preferredAudioMimeType((mimeType) => mimeType === "audio/ogg;codecs=opus"),
    "audio/ogg;codecs=opus"
  );
  assert.equal(preferredAudioMimeType(() => false), "");
});

test("formatRecordingDuration presents stable minute and second values", () => {
  assert.equal(formatRecordingDuration(0), "0:00");
  assert.equal(formatRecordingDuration(65_900), "1:05");
  assert.equal(formatRecordingDuration(-1), "0:00");
});

test("audioFileExtension maps browser recording formats to useful downloads", () => {
  assert.equal(audioFileExtension("audio/mp4"), "m4a");
  assert.equal(audioFileExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(audioFileExtension("audio/webm;codecs=opus"), "webm");
});

test("microphoneErrorMessage explains common permission and device failures", () => {
  assert.match(microphoneErrorMessage({ name: "NotAllowedError" }), /denied/i);
  assert.match(microphoneErrorMessage({ name: "NotFoundError" }), /No microphone/i);
  assert.match(microphoneErrorMessage({ name: "NotReadableError" }), /already in use/i);
});
