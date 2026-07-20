import { compositeExportColor, parseExportCssColor } from "./dom-renderer";

export interface ResolvedExportBackground {
  /** The board paint to include in the output. Null means transparent pixels. */
  background: string | null;
  /** The visible page matte used to preserve translucent object appearance. */
  appearanceBackground: string;
}

function firstVisibleColor(colors: readonly string[]): string {
  return colors.find((color) => {
    const parsed = parseExportCssColor(color);
    return parsed ? parsed.a > 0 : Boolean(color.trim());
  }) ?? "#ffffff";
}

/** Resolve the distinct exported paint and the matte visible behind the board. */
export function resolveExportBackgroundColors(
  boardColor: string,
  ancestorColors: readonly string[]
): ResolvedExportBackground {
  const parsedBoard = parseExportCssColor(boardColor);
  const background = parsedBoard
    ? parsedBoard.a > 0 ? boardColor : null
    : boardColor.trim() ? boardColor : null;
  const ancestorMatte = firstVisibleColor(ancestorColors);

  if (!parsedBoard || parsedBoard.a >= 1) {
    return {
      background,
      appearanceBackground: background ?? ancestorMatte,
    };
  }
  if (parsedBoard.a <= 0) {
    return { background: null, appearanceBackground: ancestorMatte };
  }
  return {
    background,
    appearanceBackground: compositeExportColor(boardColor, ancestorMatte) ?? ancestorMatte,
  };
}

export function resolveElementExportBackground(element: HTMLElement): ResolvedExportBackground {
  const view = element.ownerDocument.defaultView;
  if (!view) return { background: "#ffffff", appearanceBackground: "#ffffff" };

  const boardColor = view.getComputedStyle(element).backgroundColor;
  const ancestorColors: string[] = [];
  let ancestor = element.parentElement;
  while (ancestor) {
    ancestorColors.push(view.getComputedStyle(ancestor).backgroundColor);
    ancestor = ancestor.parentElement;
  }
  return resolveExportBackgroundColors(boardColor, ancestorColors);
}
