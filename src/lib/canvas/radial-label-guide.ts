export interface RadialSectionGeometry {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Inset a radial section by a visually consistent number of pixels while
 * retaining its annular-sector shape. Angular insets are derived from arc
 * length, then capped so even very narrow sections keep a useful guide.
 */
export function radialLabelGuideGeometry(
  section: RadialSectionGeometry,
  requestedInset = 5
): RadialSectionGeometry {
  const innerRadius = Math.max(0, section.innerRadius);
  const outerRadius = Math.max(innerRadius + 0.01, section.outerRadius);
  const span = Math.max(0.01, section.endAngle - section.startAngle);
  const radialBand = outerRadius - innerRadius;
  const inset = Math.max(0, requestedInset);
  const radialInset = Math.min(inset, radialBand * 0.22);
  const middleRadius = Math.max(1, (innerRadius + outerRadius) / 2);
  const angularInsetFromArc = (inset / middleRadius) * (180 / Math.PI);
  const angularInset = Math.min(angularInsetFromArc, span * 0.18);

  return {
    innerRadius: innerRadius + radialInset,
    outerRadius: outerRadius - radialInset,
    startAngle: section.startAngle + angularInset,
    endAngle: section.endAngle - angularInset,
  };
}
