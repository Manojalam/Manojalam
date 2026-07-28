import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBoardDependentExportBackgrounds,
  compositeExportColor,
  configureStandaloneSvgViewport,
  DOM_EXPORT_COMPUTED_STYLE_PROPERTIES,
  exportEdgeReferenceMatches,
  isTransparentExportBackground,
  normalizeExportSurfaceEffects,
  normalizedSelectedExportNodeZIndex,
  parseExportCssColor,
  translatedExportTransform,
  waitForDomExportFontReadiness,
} from "./dom-renderer";
import { ExportError } from "./errors";

function fontFailure(code: "FONT_LOAD_TIMEOUT" | "FONT_LOAD_FAILED"): ExportError {
  return new ExportError({
    stage: "prepare-assets",
    code,
    message: code === "FONT_LOAD_TIMEOUT"
      ? "Fonts did not finish loading before the deadline."
      : "A document font failed to load.",
  });
}

interface FakeSvgNode {
  tagName: string;
  id: string;
  attributes: Map<string, string>;
  children: FakeSvgNode[];
  style: {
    setProperty: (name: string, value: string) => void;
  };
  setAttribute: (name: string, value: string) => void;
  append: (...children: FakeSvgNode[]) => void;
}

function fakeSvgNode(tagName: string): FakeSvgNode {
  const attributes = new Map<string, string>();
  const children: FakeSvgNode[] = [];
  return {
    tagName,
    id: "",
    attributes,
    children,
    style: {
      setProperty: (name, value) => attributes.set(`style:${name}`, value),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    append: (...appended) => children.push(...appended),
  };
}

test("continues a non-strict export after the font readiness wait times out", async () => {
  const timeout = fontFailure("FONT_LOAD_TIMEOUT");
  const warnings = await waitForDomExportFontReadiness(
    { strictFontEmbedding: false },
    async () => { throw timeout; }
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.kind, "font-resource");
  assert.match(warnings[0]?.message ?? "", /continued/i);
  assert.match(warnings[0]?.message ?? "", /fallback/i);
});

test("preserves the CSS exclusion geometry used by dense diamond labels", () => {
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("float"));
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("shape-outside"));
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("shape-margin"));
});

test("scoped exports retain only connector artwork belonging to requested edges", () => {
  const requested = new Set(["branch-b"]);

  assert.equal(exportEdgeReferenceMatches("branch-b", null, requested), true);
  assert.equal(exportEdgeReferenceMatches("branch-a", null, requested), false);
  assert.equal(exportEdgeReferenceMatches(null, "branch-a branch-b branch-c", requested), true);
  assert.equal(exportEdgeReferenceMatches(null, "branch-a,branch-c", requested), false);
});

test("removes React Flow's temporary selected-node elevation from exports", () => {
  assert.equal(normalizedSelectedExportNodeZIndex("1000"), "0");
  assert.equal(normalizedSelectedExportNodeZIndex("1020"), "20");
  assert.equal(normalizedSelectedExportNodeZIndex("999"), null);
  assert.equal(normalizedSelectedExportNodeZIndex("auto"), null);
});

test("adds export-only translation without discarding React Flow positioning", () => {
  assert.equal(
    translatedExportTransform("translate(130px, 800px)", 0, -632),
    "translate(130px, 800px) translate(0px, -632px)"
  );
  assert.equal(
    translatedExportTransform("none", -252, 0),
    "translate(-252px, 0px)"
  );
});

test("continues a non-strict export after the document font set rejects", async () => {
  const warnings = await waitForDomExportFontReadiness(
    {},
    async () => { throw fontFailure("FONT_LOAD_FAILED"); }
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.kind, "font-resource");
});

test("strict font readiness failures remain fatal", async () => {
  const timeout = fontFailure("FONT_LOAD_TIMEOUT");
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: true },
      async () => { throw timeout; }
    ),
    (cause: unknown) => cause === timeout
  );
});

test("cancellation remains fatal even for non-strict exports", async () => {
  const aborted = new ExportError({
    stage: "prepare-assets",
    code: "ABORTED",
    message: "The export was canceled.",
  });
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: false },
      async () => { throw aborted; }
    ),
    (cause: unknown) => cause === aborted
  );
});

test("an aborted signal wins a simultaneous font timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    waitForDomExportFontReadiness(
      { signal: controller.signal, strictFontEmbedding: false },
      async () => { throw fontFailure("FONT_LOAD_TIMEOUT"); }
    ),
    (cause: unknown) => cause instanceof DOMException && cause.name === "AbortError"
  );
});

test("does not hide unrelated font preflight bugs", async () => {
  const unexpected = new Error("Unexpected preflight bug");
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: false },
      async () => { throw unexpected; }
    ),
    (cause: unknown) => cause === unexpected
  );
});

test("precomposites translucent node paint against the visible board matte", () => {
  assert.equal(
    compositeExportColor("rgba(239, 68, 68, 0.18)", "rgb(240, 238, 234)"),
    "rgb(240, 207, 204)"
  );
});

test("combines SVG paint opacity with the color alpha", () => {
  assert.equal(
    compositeExportColor("rgba(0, 100, 200, 0.4)", "#ffffff", 0.5),
    "rgb(204, 224, 244)"
  );
});

test("keeps fully transparent paint transparent instead of adding a rectangular matte", () => {
  assert.equal(compositeExportColor("transparent", "#ffffff"), null);
});

test("recognizes explicit transparent export backgrounds", () => {
  assert.equal(isTransparentExportBackground(null), true);
  assert.equal(isTransparentExportBackground("transparent"), true);
  assert.equal(isTransparentExportBackground("rgba(0, 0, 0, 0)"), true);
  assert.equal(isTransparentExportBackground("rgb(255, 255, 255)"), false);
});

test("retains intrinsic SVG dimensions when downloaded or rasterized", () => {
  const svg = fakeSvgNode("svg");

  configureStandaloneSvgViewport(
    svg as unknown as Pick<SVGSVGElement, "setAttribute">,
    697,
    450
  );

  assert.equal(svg.attributes.get("width"), "697");
  assert.equal(svg.attributes.get("height"), "450");
  assert.equal(svg.attributes.has("preserveAspectRatio"), false);
  assert.equal(svg.attributes.has("style:width"), false);
  assert.equal(svg.attributes.has("style:height"), false);
  assert.equal(svg.attributes.has("style:background-color"), false);
});

test("parses modern computed color syntax used by color-mix", () => {
  assert.deepEqual(parseExportCssColor("color(srgb 0.2 0.4 0.6 / 25%)"), {
    r: 51,
    g: 102,
    b: 153,
    a: 0.25,
  });
});

test("normalizes authored surface effects for foreign-object export", () => {
  const attributes = new Map([
    ["data-export-surface-effect-shadow-layers", JSON.stringify([{
      dx: 4,
      dy: 4,
      blur: 6,
      color: "#020617",
      opacity: 0.3,
    }])],
    ["data-export-surface-effect-shadow", "inset 0 1px 0 rgba(255,255,255,.5)"],
  ]);
  const styles = new Map<string, string>([
    ["box-shadow", "4px 4px 14px rgba(2,6,23,.3)"],
    ["filter", "drop-shadow(4px 4px 6px rgba(2,6,23,.3))"],
  ]);
  const surface = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => attributes.delete(name),
    style: {
      width: "",
      height: "",
      borderTopLeftRadius: "",
      setProperty: (name: string, value: string) => styles.set(name, value),
      removeProperty: (name: string) => styles.delete(name),
      getPropertyValue: (name: string) => styles.get(name) ?? "",
    },
    parentElement: null,
  } as unknown as HTMLElement;
  const clone = {
    matches: () => false,
    querySelectorAll: () => [surface],
  } as unknown as HTMLElement;

  assert.equal(normalizeExportSurfaceEffects(clone), 1);
  assert.equal(styles.get("filter"), undefined);
  assert.equal(styles.get("box-shadow"), "inset 0 1px 0 rgba(255,255,255,.5)");
  assert.equal(styles.get("backdrop-filter"), "none");
  assert.equal(attributes.size, 0);
});

test("inserts a rounded native SVG shadow behind the exported HTML surface", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const insertedShadows: FakeSvgNode[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElementNS: (_namespace: string, tagName: string) => fakeSvgNode(tagName),
    },
  });

  try {
    const attributes = new Map([
      ["data-export-surface-effect-shadow-layers", JSON.stringify([{
        dx: 4,
        dy: 5,
        blur: 7,
        color: "#020617",
        opacity: 0.3,
      }])],
    ]);
    const styles = new Map<string, string>([
      ["filter", "drop-shadow(4px 5px 7px rgba(2,6,23,.3))"],
    ]);
    const surface = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      removeAttribute: (name: string) => attributes.delete(name),
      style: {
        width: "240px",
        height: "80px",
        borderTopLeftRadius: "40px",
        setProperty: (name: string, value: string) => styles.set(name, value),
        removeProperty: (name: string) => styles.delete(name),
        getPropertyValue: (name: string) => styles.get(name) ?? "",
      },
    } as unknown as HTMLElement;
    const parent = {
      insertBefore: (node: Node) => {
        insertedShadows.push(node as unknown as FakeSvgNode);
        return node;
      },
    } as unknown as HTMLElement;
    Object.defineProperty(surface, "parentElement", { value: parent });
    const clone = {
      matches: () => false,
      querySelectorAll: () => [surface],
    } as unknown as HTMLElement;

    assert.equal(normalizeExportSurfaceEffects(clone), 1);
    const insertedShadow = insertedShadows[0];
    assert.ok(insertedShadow);
    assert.equal(insertedShadow.tagName, "svg");
    assert.equal(insertedShadow.attributes.get("viewBox"), "0 0 240 80");
    assert.equal(insertedShadow.attributes.get("style:overflow"), "visible");
    const defs = insertedShadow.children[0];
    const rect = insertedShadow.children[1];
    const filter = defs?.children[0];
    assert.equal(defs?.tagName, "defs");
    assert.equal(rect?.tagName, "rect");
    assert.equal(rect?.attributes.get("rx"), "40px");
    assert.equal(rect?.attributes.get("filter"), "url(#export-surface-shadow-0)");
    assert.equal(filter?.tagName, "filter");
    assert.equal(filter?.children[filter.children.length - 1]?.tagName, "feMerge");
    assert.equal(styles.get("filter"), undefined);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("clears generated layout-frame paint only for no-background exports", () => {
  const transparentAttributes = new Map([
    ["data-export-board-dependent-background", "true"],
  ]);
  const transparentStyles = new Map([
    ["background-color", "rgba(180, 140, 40, 0.08)"],
  ]);
  const transparentSurface = {
    removeAttribute: (name: string) => transparentAttributes.delete(name),
    style: {
      setProperty: (name: string, value: string) => transparentStyles.set(name, value),
    },
  } as unknown as HTMLElement;
  const transparentClone = {
    matches: () => false,
    querySelectorAll: () => [transparentSurface],
  } as unknown as HTMLElement;

  assert.equal(clearBoardDependentExportBackgrounds(transparentClone, true), 1);
  assert.equal(transparentStyles.get("background-color"), "transparent");
  assert.equal(
    transparentAttributes.has("data-export-board-dependent-background"),
    false
  );

  const includedAttributes = new Map([
    ["data-export-board-dependent-background", "true"],
  ]);
  const includedStyles = new Map([
    ["background-color", "rgba(180, 140, 40, 0.08)"],
  ]);
  const includedSurface = {
    removeAttribute: (name: string) => includedAttributes.delete(name),
    style: {
      setProperty: (name: string, value: string) => includedStyles.set(name, value),
    },
  } as unknown as HTMLElement;
  const includedClone = {
    matches: () => false,
    querySelectorAll: () => [includedSurface],
  } as unknown as HTMLElement;

  assert.equal(clearBoardDependentExportBackgrounds(includedClone, false), 0);
  assert.equal(
    includedStyles.get("background-color"),
    "rgba(180, 140, 40, 0.08)"
  );
  assert.equal(includedAttributes.has("data-export-board-dependent-background"), false);
});
