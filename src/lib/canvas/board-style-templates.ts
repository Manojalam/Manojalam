import type { Node } from "@xyflow/react";
import type { BoardStyleTemplate, TemplateTextRole } from "../types";
import { captureShapeFormat } from "./shape-format";
import { colorSwatchHex, normalizeHexColor } from "./custom-colors";
import { plainTextToRichText } from "./rich-text-paste";

export const TEMPLATE_EXTRA_STYLE_KEYS = ["shapeType", "surfaceEffect", "surfaceEffectDepth", "surfaceEffectStrength", "surfaceEffectAngle", "lineSpacing", "paragraphIndent", "firstLineIndent", "tabSize"] as const;
export function supportsStyleTemplate(node: Node): boolean {
  return ["shape", "text", "sticky", "mindmap"].includes(node.type ?? "") && !node.data.cardTemplateId && !node.data.sampleTemplateId && !node.data.sampleDesignId && !(node.data.radialChart as { enabled?: boolean } | undefined)?.enabled;
}
export function captureTemplateStyle(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ ...captureShapeFormat(data), ...Object.fromEntries(TEMPLATE_EXTRA_STYLE_KEYS.map(key => [key, data[key]])) })
    .map(([key, value]) => [key, value === undefined ? null : structuredClone(value)]));
}
function htmlContainer(html: string): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  const container = document.createElement("div"); container.innerHTML = html; return container;
}
function inheritedColor(element: HTMLElement | null, base: string): string {
  for (let current = element; current; current = current.parentElement) {
    const color = colorSwatchHex(current.style.color);
    if (color) return color;
  }
  return base;
}
export function templateRolesFromHtml(html: string, base: string): TemplateTextRole[] {
  const container = htmlContainer(html);
  const anchor = container?.querySelector<HTMLElement>("a");
  const link = anchor?.querySelector<HTMLElement>('[style*="color"]') ?? anchor;
  const reference = link ? inheritedColor(link, base) : "#db2777";
  const extras = [...new Set(Array.from(container?.querySelectorAll<HTMLElement>("[style]") ?? [])
    .filter(element => !element.closest("a"))
    .map(element => colorSwatchHex(element.style.color)).filter((color): color is string => !!color && color !== base))];
  return [
    { id: "question", name: "Question", color: base },
    { id: "answer", name: "Answer", color: extras[0] ?? "#16a34a" },
    { id: "reference", name: "Reference / link", color: reference },
    ...extras.slice(1).map((color, index) => ({ id: `color_${index + 1}`, name: `Color ${index + 1}`, color })),
  ];
}
/** Bind matching source colors to semantic roles without flattening content or marks. */
export function bindTemplateRoles(html: string, roles: TemplateTextRole[], base: string): string {
  const container = htmlContainer(html); if (!container) return html;
  container.querySelectorAll("[data-template-role]").forEach(element => element.removeAttribute("data-template-role"));
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: Text[] = []; while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (!text.data.trim() || text.parentElement?.closest("[data-vidya-symbol]")) continue;
    const color = inheritedColor(text.parentElement, base);
    const role = text.parentElement?.closest("a") ? roles.find(role => role.id === "reference") : roles.find(role => role.color === color) ?? (color === base ? roles.find(role => role.id === "question") : undefined);
    if (!role) continue;
    const parent = text.parentElement;
    const span = parent?.tagName === "SPAN" && parent.childNodes.length === 1 ? parent : document.createElement("span");
    span.dataset.templateRole = role.id;span.style.color = role.color;
    if (span !== parent) { text.replaceWith(span);span.append(text); }
  }
  return container.innerHTML;
}
export function refreshTemplateRoles(html: string, roles: TemplateTextRole[]): string {
  const container = htmlContainer(html); if (!container) return html;
  const byId = new Map(roles.map(role => [role.id, role]));
  container.querySelectorAll<HTMLElement>("[data-template-role]").forEach(element => {
    const role = byId.get(element.dataset.templateRole ?? "");
    if (role) element.style.color = role.color;
    else element.removeAttribute("data-template-role");
  });
  return container.innerHTML;
}
export function detachTemplateData(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };delete next.styleTemplateId;
  const container = typeof data.richText === "string" ? htmlContainer(data.richText) : null;
  if (container) { container.querySelectorAll("[data-template-role]").forEach(element => element.removeAttribute("data-template-role"));next.richText = container.innerHTML; }
  return next;
}
export function applyStyleTemplate(node: Node, template: BoardStyleTemplate, bind = true, keys = Object.keys(template.style)): Node {
  if (!supportsStyleTemplate(node)) return node;
  const style = Object.fromEntries(keys.map(key => [key, template.style[key] === null ? undefined : structuredClone(template.style[key])]));
  const data = { ...node.data, ...style, styleTemplateId: template.id, linkColor: template.roles.find(role => role.id === "reference")?.color ?? node.data.linkColor, layoutAutoFill: false, layoutAutoBorder: false, layoutAutoText: false, layoutAutoTypography: false };
  const html = typeof node.data.richText === "string" && node.data.richText ? node.data.richText : plainTextToRichText(String(node.data.text ?? ""));
  const base = colorSwatchHex(node.data.textColor) ?? String(template.style.textColor ?? "#111827");
  return { ...node, data: { ...data, richText: bind ? bindTemplateRoles(html, template.roles, base) : refreshTemplateRoles(html, template.roles) } };
}
export function normalizeBoardStyleTemplates(value: unknown): BoardStyleTemplate[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const styleKeys = new Set(Object.keys(captureTemplateStyle({})));
  const result: BoardStyleTemplate[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.name !== "string" || !item.name.trim()
      || !item.style || typeof item.style !== "object" || Array.isArray(item.style)
      || !item.sample || typeof item.sample !== "object" || !Array.isArray(item.roles)) continue;
    if (!["shape", "text", "sticky", "mindmap"].includes(item.sample.type)) continue;
    ids.add(item.id);
    const roleIds = new Set<string>();
    const roles: TemplateTextRole[] = [];
    for (const role of item.roles) {
      if (!role || typeof role.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(role.id)
        || roleIds.has(role.id) || typeof role.name !== "string" || !role.name.trim()) continue;
      const color = normalizeHexColor(role.color);
      if (!color) continue;
      roleIds.add(role.id);roles.push({ id: role.id, name: role.name.trim(), color });
    }
    const text = typeof item.sample.text === "string" ? item.sample.text : "";
    result.push({
      id: item.id, name: item.name.trim(), roles,
      style: Object.fromEntries(Object.entries(item.style).filter(([key]) => styleKeys.has(key))),
      sample: {
        type: item.sample.type, text,
        richText: typeof item.sample.richText === "string" ? item.sample.richText : plainTextToRichText(text),
        width: Number.isFinite(item.sample.width) && item.sample.width > 0 ? item.sample.width : 300,
        height: Number.isFinite(item.sample.height) && item.sample.height > 0 ? item.sample.height : 180,
      },
    });
  }
  return result;
}
