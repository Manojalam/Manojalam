"use client";

import { normalizeSurfaceEffects, SURFACE_EFFECT_PRESETS, surfaceEffectLayerPatch, type SurfaceEffectSettings } from "@/lib/canvas/surface-effects";
import { resolveSurfaceEffectData } from "@/lib/style-utils";

export function SurfaceEffectsControl({ data, onChange }: {
  data: Record<string, unknown>[];
  onChange: (patch: (current: Record<string, unknown>) => Record<string, unknown>) => void;
}) {
  const selections = data.map(value => normalizeSurfaceEffects(resolveSurfaceEffectData(value)));
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Combine effects. Each effect has its own settings.</p>
    {SURFACE_EFFECT_PRESETS.filter(preset => preset.id !== "flat").map(preset => {
      const layers = selections.map(selection => selection.find(layer => layer.preset === preset.id));
      const allEnabled = layers.every(Boolean);
      const anyEnabled = layers.some(Boolean);
      const first = layers.find(Boolean);
      const change = (enabled: boolean, values = {}) => onChange(current => surfaceEffectLayerPatch(resolveSurfaceEffectData(current), preset.id, enabled, values));
      return <section key={preset.id} aria-label={`${preset.label} effect`} className="rounded border p-2">
        <label className="flex items-center gap-2 text-xs font-medium" title={preset.description}>
          <input type="checkbox" checked={allEnabled} ref={input => { if (input) input.indeterminate = anyEnabled && !allEnabled; }} onChange={event => change(event.target.checked)} />
          {preset.label}{anyEnabled && !allEnabled && <span className="text-muted-foreground">(some selected objects)</span>}
        </label>
        {first && <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">{preset.label} settings</summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([{ key: "depth", label: "Depth (px)", min: 0, max: 24 }, { key: "strength", label: "Strength (%)", min: 0, max: 100 }, ...(preset.id === "glow" ? [] : [{ key: "angle", label: "Direction (deg)", min: -180, max: 180 }])] as const).map(control => {
              const key = control.key as "depth" | "strength" | "angle";
              const mixed = layers.some(layer => !layer || layer[key] !== first[key]);
              return <label key={key} className="text-[10px] text-muted-foreground">{control.label}
                <EffectNumber key={`${preset.id}-${key}-${mixed ? "mixed" : first[key]}`} label={`${preset.label} ${control.label}`} value={mixed ? undefined : first[key]} min={control.min} max={control.max} onCommit={value => change(true, { [key]: value } as Partial<SurfaceEffectSettings>)} />
              </label>;
            })}
          </div>
        </details>}
      </section>;
    })}
    <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={selections.every(layers => !layers.length)} onClick={() => onChange(current => surfaceEffectLayerPatch(current, "flat", false))}>Clear all effects</button>
  </div>;
}

function EffectNumber({ value, min, max, label, onCommit }: { value?: number; min: number; max: number; label: string; onCommit: (value: number) => void }) {
  return <input type="number" aria-label={label} defaultValue={value ?? ""} placeholder="Mixed" min={min} max={max} step="any" className="mt-1 w-full rounded border bg-background px-1 py-1 text-xs text-foreground"
    onBlur={event => { const raw = event.currentTarget.value; const number = Number(raw); if (raw.trim() && Number.isFinite(number)) { const next = Math.min(max, Math.max(min, number)); if (next !== value) onCommit(next); event.currentTarget.value = String(next); } else event.currentTarget.value = value === undefined ? "" : String(value); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
