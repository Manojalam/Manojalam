# Canvas handwriting

Choose the pen icon (Handwriting) in the left toolbar, then write directly on the board. Pen, highlighter, stroke eraser, colour and width are available. Stylus pressure affects pen width. Done writing returns to normal selection, so notes can be moved, copied and deleted like other objects. New handwriting starts a separate note.

Select one handwriting object and choose English, Sanskrit, or English + Sanskrit, then Convert to text. Recognition runs in a browser worker using the existing bundled English and Sanskrit Tesseract models. There is no recognition API endpoint, API key, or Google upload. Normal board autosave still uses the board's existing local/cloud storage setting.

Conversion is **experimental**: these models are trained primarily on print, not handwriting. Clear separated characters work better than cursive; Sanskrit conjuncts, vowel marks and handwritten derivations can require substantial correction. Do not treat the result as a faithful transcription without review. This is not validated support for arbitrary cursive Sanskrit.

The original strokes are untouched during recognition and review. Edit the result, then accept. Keep handwriting beside the text is enabled by default. Uncheck it only to replace the original after acceptance. Cancel or recognition errors retain the ink. Acceptance is one undoable operation. Conversion ignores highlighter strokes and renders the selected pen strokes in black on white independently of board zoom and colours.

Setup: npm install and the normal build prepare the existing local /ocr assets (English and Sanskrit language data, Tesseract worker and WASM). No additional service configuration is required. Assets must remain accessible from the same origin under /ocr. First use downloads these app-hosted assets; recognition requires available assets and sufficient browser memory. It is not a guarantee that a first-time session works without network access.

Limits: one handwriting object per conversion; stroke eraser removes complete touched strokes; 30,000 points per note; rasterization is bounded to 4,096 pixels per side and 12 megapixels. Selecting subsets with a lasso, live recognition while writing and trained cursive models are not included.
