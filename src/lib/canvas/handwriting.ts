export interface InkPoint { x: number; y: number; pressure: number }
export interface InkStroke { id: string; points: InkPoint[]; color: string; width: number; highlighter?: boolean }
export interface InkData { strokes: InkStroke[]; width: number; height: number }
export const MAX_INK_POINTS = 30000;
export function inkBounds(strokes: InkStroke[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const stroke of strokes) for (const p of stroke.points) {
    const pad = stroke.width + 4;
    left = Math.min(left, p.x - pad); top = Math.min(top, p.y - pad);
    right = Math.max(right, p.x + pad); bottom = Math.max(bottom, p.y + pad);
  }
  return { x: left, y: top, width: Math.max(24, right - left), height: Math.max(24, bottom - top) };
}
export function normalizeInk(strokes: InkStroke[]) {
  const bounds = inkBounds(strokes);
  return { position: { x: bounds.x, y: bounds.y }, ink: { width: bounds.width, height: bounds.height,
    strokes: strokes.map(s => ({ ...s, points: s.points.map(p => ({ ...p, x: p.x - bounds.x, y: p.y - bounds.y })) })) } };
}
export function inkRadius(stroke: InkStroke, point: InkPoint) {
  return stroke.width * (stroke.highlighter ? 0.5 : 0.2 + point.pressure * 0.8);
}
export function strokeNear(stroke: InkStroke, point: InkPoint, radius = 12) {
  return stroke.points.some((a, i) => {
    const b = stroke.points[i + 1] ?? a;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= radius + stroke.width;
  });
}
/** Recognition uses black ink on white independently of canvas colours and zoom. */
export function inkPng(ink: InkData): string {
  const scale = Math.min(2, 4000 / Math.max(ink.width, ink.height), Math.sqrt(11000000 / (ink.width * ink.height)));
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid handwriting size.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(ink.width * scale) + 32; canvas.height = Math.ceil(ink.height * scale) + 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.translate(16, 16); ctx.scale(scale, scale);
  ctx.strokeStyle = ctx.fillStyle = "black"; ctx.lineCap = "round";
  for (const s of ink.strokes.filter(s => !s.highlighter)) {
    s.points.forEach((p, i) => {
      const previous = s.points[i - 1] ?? p;
      ctx.lineWidth = inkRadius(s, p) * 2;
      ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, inkRadius(s, p), 0, Math.PI * 2); ctx.fill();
    });
  }
  return canvas.toDataURL("image/png").split(",")[1];
}
/** Standalone vector representation for exports; never embed authored markup. */
export function inkSvg(ink: InkData): string {
  const number = (value: number) => Number.isFinite(value) ? value : 0;
  const groups = ink.strokes.map(s => {
    const color = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#111111";
    return `<g fill="${color}" stroke="${color}" stroke-linecap="round" opacity="${s.highlighter ? 0.3 : 1}">${s.points.map((p, i) => i ? `<line x1="${number(s.points[i-1].x)}" y1="${number(s.points[i-1].y)}" x2="${number(p.x)}" y2="${number(p.y)}" stroke-width="${number(inkRadius(s,p)*2)}"/>` : `<circle cx="${number(p.x)}" cy="${number(p.y)}" r="${number(inkRadius(s,p))}" stroke="none"/>`).join("")}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(ink.width)}" height="${number(ink.height)}" viewBox="0 0 ${number(ink.width)} ${number(ink.height)}">${groups}</svg>`;
}
