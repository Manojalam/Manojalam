import { normalizeBoardSearch } from "./board-search";

export const BOARD_SEARCH_HIGHLIGHT = "board-search-match";

/** Map normalized matching back to original UTF-16 offsets (including Sanskrit). */
export function searchTextOffsets(text: string, query: string): [number, number][] {
  const needle = normalizeBoardSearch(query);
  if (!needle) return [];
  let normalized = "";
  const starts: number[] = [], ends: number[] = [];
  for (const { segment, index } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    const value = segment.normalize("NFC").toLocaleLowerCase().replace(/\s+/gu, " ");
    if (value === " " && normalized.endsWith(" ")) {
      ends[ends.length - 1] = index + segment.length;
      continue;
    }
    normalized += value;
    for (let i = 0; i < value.length; i++) {
      // Unchanged-length clusters retain exact offsets for substring searches
      // (e.g. कृति inside कृतिः), not the whole grapheme including its suffix.
      starts.push(index + (value.length === segment.length ? i : 0));
      ends.push(index + (value.length === segment.length ? i + 1 : segment.length));
    }
  }
  const matches: [number, number][] = [];
  for (let at = normalized.indexOf(needle); at !== -1; at = normalized.indexOf(needle, at + needle.length)) {
    matches.push([starts[at], ends[at + needle.length - 1]]);
  }
  return matches;
}

export function clearBoardSearchHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete(BOARD_SEARCH_HIGHLIGHT);
    CSS.highlights.delete("board-search-active");
  }
  document.getElementById("board-search-highlight-style")?.remove();
}

/** Paint matches without editing rich text, creating undo entries, or saving markup. */
export function highlightBoardSearch(root: Element, query: string, activeIndex = 0): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('button, script, style, [aria-hidden="true"]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  const ranges = searchTextOffsets(text, query).flatMap(([start, end]) => {
    const first = nodes.find(item => item.end > start);
    const last = nodes.find(item => item.end >= end);
    if (!first || !last) return [];
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return Array.from(range.getClientRects()).some(rect => rect.width && rect.height) ? [range] : [];
  });
  if (typeof Highlight !== "undefined" && CSS.highlights) {
    if (!document.getElementById("board-search-highlight-style")) {
      // Runtime rule avoids older CSS build parsers dropping the Highlight API selector.
      const style = document.createElement("style");
      style.id = "board-search-highlight-style";
      style.textContent = "::highlight(board-search-match) { background-color: #ffe066; color: #171717; } ::highlight(board-search-active) { background-color: #ff9f43; color: #111111; text-decoration: underline; }";
      document.head.append(style);
    }
    CSS.highlights.set(BOARD_SEARCH_HIGHLIGHT, new Highlight(...ranges));
    const active = ranges[Math.min(Math.max(activeIndex, 0), ranges.length - 1)];
    const highlight = new Highlight(...(active ? [active] : []));
    highlight.priority = 1;
    CSS.highlights.set("board-search-active", highlight);
  }
  return ranges;
}

/** Refresh browser ranges when an editor replaces text nodes or virtualization remounts it. */
export function observeBoardSearch(
  container: Element,
  selector: string,
  query: string,
  activeIndex: number,
  onRefresh: (ranges: Range[]) => void,
): () => void {
  let frame = 0;
  let stopped = false;
  const refresh = () => {
    frame = 0;
    if (stopped) return;
    const target = container.querySelector(selector);
    if (!target) { clearBoardSearchHighlight(); return; }
    onRefresh(highlightBoardSearch(target, query, activeIndex));
  };
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(refresh);
  });
  observer.observe(container, { childList: true, characterData: true, subtree: true });
  return () => {
    stopped = true;
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
