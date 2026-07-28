import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(workspace, "public");
const ocrDir = join(publicDir, "ocr");
const coreDir = join(ocrDir, "core");
const langDir = join(ocrDir, "lang");

await Promise.all([
  mkdir(coreDir, { recursive: true }),
  mkdir(langDir, { recursive: true }),
]);

const copies = [
  [
    join(workspace, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    join(publicDir, "pdf.worker.min.mjs"),
  ],
  [
    join(workspace, "node_modules", "tesseract.js", "dist", "worker.min.js"),
    join(ocrDir, "worker.min.js"),
  ],
  [
    join(workspace, "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    join(coreDir, "tesseract-core-lstm.wasm.js"),
  ],
  [
    join(workspace, "node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    join(coreDir, "tesseract-core-simd-lstm.wasm.js"),
  ],
  [
    join(workspace, "node_modules", "tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
    join(coreDir, "tesseract-core-relaxedsimd-lstm.wasm.js"),
  ],
  [
    join(workspace, "node_modules", "@tesseract.js-data", "san", "4.0.0_best_int", "san.traineddata.gz"),
    join(langDir, "san.traineddata.gz"),
  ],
  [
    join(workspace, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
    join(langDir, "eng.traineddata.gz"),
  ],
];

await Promise.all(copies.map(([from, to]) => copyFile(from, to)));
console.log("Prepared local PDF and Sanskrit/English OCR assets.");
