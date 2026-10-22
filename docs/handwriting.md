# Canvas handwriting

Choose Handwriting (the pen icon) in the left toolbar and write directly on the board. Its controls use the existing **Properties → Handwriting** tab; Arrange, lock/delete, the app's Undo/Redo and board autosave remain shared. Pen, highlighter, stroke eraser, colour and width are available. Stylus pressure affects pen width. Done writing returns to selection; New handwriting starts another object.

Select one handwriting object, choose English, Sanskrit, or English + Sanskrit, then Convert to text. The selected strokes are rendered black on white, independently of viewport zoom. Highlighter strokes are excluded. Recognition uses a locally installed vision model through Ollama; it no longer routes handwriting through the printed-document Tesseract models. PDF/image import keeps its existing OCR path.

## Local setup

Install [Ollama](https://ollama.com/download) on the computer running your browser, then download the vision model once:

```powershell
ollama pull gemma3:4b
```

This requires several GB of disk space and sufficient RAM; acceleration depends on your hardware. Quit Ollama before changing these Windows user environment variables, then reopen it:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_NO_CLOUD', '1', 'User')
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'https://manojalam.com,https://www.manojalam.com', 'User')
```

Use the exact origin of your deployed site. For development, add `http://localhost:3093` (or the port you use). Do not use a wildcard. Keep Ollama bound to localhost. Allow Chrome's local-network permission when prompted. If your browser or organization blocks website access to localhost, conversion is unavailable on that device; no cloud fallback is used.

The app connects directly to `http://127.0.0.1:11434`. There is no new application server endpoint, remote-host setting, API key, auto-install or model download from the conversion button. Redirects are rejected; cloud-backed/non-vision model metadata is rejected before sending an image. Normal board autosave still follows the existing local/cloud board setting. Only recognition is local-only.

See [Ollama configuration](https://docs.ollama.com/faq), [vision model](https://ollama.com/library/gemma3), and [generation API](https://docs.ollama.com/api/generate).

## Review and limitations

Original strokes remain untouched during recognition and review. Correct the draft, then accept. Keep handwriting beside the text is enabled by default. Uncheck it only to replace the original after acceptance. Cancel, errors, or changing selection retain the original. Acceptance creates the normal editable text object through the existing undo/save flow.

A vision model can misread or invent text. It is not a guarantee of faithful Sanskrit transcription: review conjuncts, vowel marks, spelling, and omissions. Empty results, Latin-only output when Sanskrit was requested, and truncated output are rejected. These checks detect only some errors; they do not measure accuracy. Slow conversion times out after three minutes and can be cancelled earlier.

Limits: one handwriting object per conversion; eraser removes entire touched strokes; 30,000 points per note; rasterization is bounded to 4,096 pixels per side and 12 megapixels. Lasso selection and live transcription are not included.

## Checks

`HANDWRITING_TEST_STUB=1 node scripts/run-handwriting-smoke.mjs` checks the editor/undo/review/persistence/sidebar flow with a stubbed recognition response. It is **not** an accuracy test. Without that flag it uses the installed local model for the drawn English sample. The recognition unit tests cover local-only requests, cloud rejection, wrong-script/truncated output and cancellation. Actual handwritten images must be tested separately through `transcribeHandwritingImage`; rendered fonts and manually corrected drafts are not handwriting accuracy evidence.
