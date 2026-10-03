// Matching weights: each control's weight from the data, optionally edited per gear.
import type { GearDef } from '../../shared/schema';
import type { WeightOverrides } from './types';

export const W_MAX = 5;
export const W_STEP = 0.1;

/** A typed or stepped weight on the 0.1 grid, between 0 and W_MAX. */
export function clampWeight(v: number): number {
  const w = Math.round(Math.min(W_MAX, Math.max(0, v)) / W_STEP) * W_STEP;
  return Math.round(w * 10) / 10;
}

/** Overrides after setting one control's weight: a weight equal to the original is dropped. */
export function setWeightOverride(
  def: GearDef,
  overrides: WeightOverrides | undefined,
  key: string,
  v: number,
): WeightOverrides {
  const next = { ...(overrides || {}) };
  const original = def.controls.find((c) => c.key === key)?.weight;
  const w = clampWeight(v);
  if (w === original) delete next[key];
  else next[key] = w;
  return next;
}

/** Valid stored overrides only: known controls, finite weights in range. */
export function cleanOverrides(def: GearDef, raw: unknown): WeightOverrides {
  const out: WeightOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (def.controls.some((c) => c.key === k) && typeof v === 'number' && isFinite(v) && v >= 0 && v <= W_MAX)
      out[k] = v;
  }
  return out;
}

const WEIGHTED = new WeakMap<GearDef, { overrides: WeightOverrides | undefined; def: GearDef }>();
/** The definition with edited weights applied (the original when nothing is edited). Memoised per
 *  definition and overrides object, so selectors keep stable references. */
export function withWeights(def: GearDef, overrides: WeightOverrides | undefined): GearDef {
  if (!overrides || !Object.keys(overrides).length) return def;
  const hit = WEIGHTED.get(def);
  if (hit && hit.overrides === overrides) return hit.def;
  const weighted: GearDef = {
    ...def,
    controls: def.controls.map((c) => (c.key in overrides ? { ...c, weight: overrides[c.key]! } : c)),
  };
  WEIGHTED.set(def, { overrides, def: weighted });
  return weighted;
}
