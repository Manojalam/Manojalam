import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  hierarchyDraftToBoardContent,
  remapHierarchyForBoardInsertion,
} from "./board";
import {
  compactRawHierarchy,
  ensureSingleDraftRoot,
  isLikelyStructuralLabel,
  locateDraftNode,
} from "./draft";
import {
  DEVANAGARI_FONT,
  LATIN_FONT,
  MIXED_FONT,
  fontFamilyForText,
  scriptModeForText,
} from "./script";
import { hasUsablePdfText } from "./pdf";
import {
  decodeTextBuffer,
  parseHtmlHierarchy,
  parseIndentedTextRaw,
  parseTextHierarchy,
} from "./text";

const SAMPLE = `छन्दः - समवृत्तानि
\t८ अक्षराणि अनुष्टुप्
\t\tश्लोकः ...
\t\t\tपञ्चमं लघु सर्वत्र सप्तमं द्विचतुर्थयोः । गुरु षष्ठञ्च पादानां चतुर्णां स्यादनुष्टुभि ॥
\t\t\t\tसोऽहमाजन्मशुद्धानामाफलोदयकर्मणाम् । आसमुद्रक्षितीशानामानाकरथवर्त्मनाम् ॥
\t\tप्रमाणिका
\t\t\tप्रमाणिका जरौ लगौ । जगणः - रगणः - लगौ
\t\t\t\tप्रवाति दक्षिणानिलः सुपुष्पिताम्रकिंशुकः । वसन्त एष साम्प्रतं प्रमाणिकाऽत्र कोकिला ॥
छन्दः - समवृत्तानि
\t११ अक्षराणि । त्रिष्टुप् ।
\t\tइन्द्रवज्रा
\t\t\tस्यादिन्द्रवज्रा यदि तौ जगै गः । त त ज ग ग ।`;

test("decodes UTF-8 BOM and UTF-16LE text", () => {
  const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("छन्दः")]);
  assert.equal(decodeTextBuffer(utf8.buffer), "छन्दः");

  const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
  assert.equal(decodeTextBuffer(utf16.buffer), "AB");
});

test("rejects corrupt PDF text layers and keeps valid Devanagari/English text", () => {
  assert.equal(
    hasUsablePdfText("छन्दः समवृत्तानि प्रमाणिका Sanskrit prosody hierarchy"),
    true
  );
  assert.equal(
    hasUsablePdfText("छ\u0000न्दः \u0000समवृत्तानि broken text layer"),
    false
  );
  assert.equal(hasUsablePdfText(".... ---- ...."), false);
});

test("parses indented text and merges repeated continuation roots", () => {
  const draft = parseTextHierarchy(SAMPLE, "छन्दः - समवृत्तानि.txt");
  assert.equal(draft.roots.length, 1);
  const root = draft.roots[0];
  assert.equal(root.label, "छन्दः - समवृत्तानि");
  assert.equal(root.children.length, 2);
  assert.equal(root.children[0].label, "८ अक्षराणि अनुष्टुप्");
  assert.deepEqual(
    root.children[0].children.map((node) => node.label),
    ["श्लोकः ...", "प्रमाणिका"]
  );
  assert.match(root.children[0].children[0].notes, /पञ्चमं लघु/u);
  assert.match(root.children[0].children[0].notes, /सोऽहमाजन्म/u);
  assert.equal(root.children[1].children[0].label, "इन्द्रवज्रा");
});

test("supports spaces, bullets, and numbering as outline markers", () => {
  const raw = parseIndentedTextRaw(`Root
  - First
    1. Grandchild
  - Second`);
  const compact = compactRawHierarchy(raw);
  assert.equal(compact[0].children.length, 2);
  assert.equal(compact[0].children[0].children[0].label, "Grandchild");
});

test("uses an existing filename-matching root when combining top-level sections", () => {
  const draft = parseTextHierarchy(
    `छन्दः - समवृत्तानि
\t८ अक्षराणि
छन्दः
\tसमवृत्तानि
\tजातिः`,
    "छन्दः - समवृत्तानि.txt"
  );
  const finalized = ensureSingleDraftRoot(draft, "छन्दः - समवृत्तानि");
  assert.equal(finalized.roots.length, 1);
  assert.equal(finalized.roots[0].label, "छन्दः - समवृत्तानि");
  assert.deepEqual(
    finalized.roots[0].children.map((node) => node.label),
    ["८ अक्षराणि", "छन्दः"]
  );
});

test("parses nested HTML lists without executing or importing unsafe elements", () => {
  const { window } = parseHTML(`<html><head><title>Prosody</title></head><body>
    <script>globalThis.__unsafeImportExecuted = true</script>
    <ol>
      <li>छन्दः - समवृत्तानि
        <ol>
          <li>८ अक्षराणि अनुष्टुप्
            <ol>
              <li>प्रमाणिका
                <ol><li>प्रमाणिका जरौ लगौ । जगणः - रगणः - लगौ</li></ol>
              </li>
            </ol>
          </li>
        </ol>
      </li>
      <li>छन्दः - समवृत्तानि
        <ol><li>११ अक्षराणि । त्रिष्टुप् ।</li></ol>
      </li>
    </ol>
  </body></html>`);
  const previous = {
    DOMParser: globalThis.DOMParser,
    Node: globalThis.Node,
    Element: globalThis.Element,
  };
  Object.assign(globalThis, {
    DOMParser: window.DOMParser,
    Node: window.Node,
    Element: window.Element,
  });
  try {
    const source = window.document.toString();
    const parsed = parseHtmlHierarchy(source, "prosody.html");
    assert.equal(parsed.roots.length, 1);
    assert.equal(parsed.roots[0].label, "छन्दः - समवृत्तानि");
    assert.equal(parsed.roots[0].children.length, 2);
    assert.equal(parsed.roots[0].children[0].children[0].label, "प्रमाणिका");
    assert.match(parsed.roots[0].children[0].children[0].notes, /जरौ लगौ/u);
    assert.equal(
      (globalThis as typeof globalThis & { __unsafeImportExecuted?: boolean }).__unsafeImportExecuted,
      undefined
    );
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("classifies structural headings separately from verses and definitions", () => {
  assert.equal(isLikelyStructuralLabel("११ अक्षराणि । त्रिष्टुप् ।"), true);
  assert.equal(isLikelyStructuralLabel("प्रमाणिका"), true);
  assert.equal(
    isLikelyStructuralLabel("प्रमाणिका जरौ लगौ । जगणः - रगणः - लगौ"),
    false
  );
  assert.equal(
    isLikelyStructuralLabel("लोकाभिरामं रणरङ्गधीरं राजीवनेत्रं रघुवंशनाथम् ॥"),
    false
  );
});

test("selects explicit Devanagari, Latin, and mixed-script fonts", () => {
  assert.equal(scriptModeForText("प्रमाणिका"), "devanagari");
  assert.equal(scriptModeForText("Prosody"), "plain");
  assert.equal(scriptModeForText("वसन्ततिलका uses 14 syllables"), "mixed");
  assert.equal(fontFamilyForText("प्रमाणिका"), DEVANAGARI_FONT);
  assert.equal(fontFamilyForText("Prosody"), LATIN_FONT);
  assert.equal(fontFamilyForText("वसन्ततिलका uses 14 syllables"), MIXED_FONT);
});

test("converts a reviewed draft to stable board hierarchy data", () => {
  const draft = parseTextHierarchy(SAMPLE, "छन्दः - समवृत्तानि.txt");
  const { content, rootId } = hierarchyDraftToBoardContent(draft);
  assert.equal(content.nodes[0].id, rootId);
  assert.equal(content.nodes[0].type, "mindmap");
  assert.equal(content.nodes[0].data.parentId, null);
  assert.equal(content.edges.length, content.nodes.length - 1);

  for (const edge of content.edges) {
    const child = content.nodes.find((node) => node.id === edge.target);
    assert.equal(child?.data.parentId, edge.source);
    const parent = content.nodes.find((node) => node.id === edge.source);
    assert.ok((parent?.data.childOrder as string[]).includes(edge.target));
    assert.equal(edge.type, "branch");
  }

  const shloka = content.nodes.find((node) => node.data.text === "श्लोकः ...");
  assert.match(String(shloka?.data.notes), /पञ्चमं लघु/u);
  assert.equal(shloka?.data.fontFamily, DEVANAGARI_FONT);
  assert.ok(locateDraftNode(draft.roots, shloka!.id));
});

test("remaps a reviewed hierarchy for collision-free current-board insertion", () => {
  const draft = parseTextHierarchy(SAMPLE, "छन्दः - समवृत्तानि.txt");
  const { content, rootId } = hierarchyDraftToBoardContent(draft);
  const originalNodeIds = new Set(content.nodes.map((node) => node.id));
  const reservedIds = new Set(["existing-node", "existing-edge"]);
  let generatedId = 0;
  const insertion = remapHierarchyForBoardInsertion(
    content,
    rootId,
    reservedIds,
    () => generatedId++ === 0 ? "existing-node" : `imported-${generatedId}`
  );

  assert.equal(insertion.nodes.length, content.nodes.length);
  assert.equal(insertion.edges.length, content.edges.length);
  assert.equal(insertion.nodeIds.length, content.nodes.length);
  assert.ok(insertion.nodes.some((node) => node.id === insertion.rootId));
  assert.ok(insertion.nodes.every((node) => !originalNodeIds.has(node.id)));
  assert.ok(insertion.nodes.every((node) => !reservedIds.has(node.id)));
  assert.equal(new Set([
    ...insertion.nodes.map((node) => node.id),
    ...insertion.edges.map((edge) => edge.id),
  ]).size, insertion.nodes.length + insertion.edges.length);

  const insertedById = new Map(insertion.nodes.map((node) => [node.id, node]));
  const insertedRoot = insertedById.get(insertion.rootId)!;
  assert.equal(insertedRoot.data.parentId, null);
  for (const edge of insertion.edges) {
    assert.ok(insertedById.has(edge.source));
    assert.ok(insertedById.has(edge.target));
    assert.equal(insertedById.get(edge.target)?.data.parentId, edge.source);
    assert.ok(
      (insertedById.get(edge.source)?.data.childOrder as string[]).includes(edge.target)
    );
  }
});
