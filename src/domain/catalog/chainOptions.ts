// The pedal chains gear is captured with, and the gear each pedal is used with.
import type { Capture, ChainItem } from '../../../shared/schema';
import { chainKey, chainName } from '../chains';
import { byName } from '../format';
import type { GearLookup } from '../types';

export interface ChainOption {
  key: string;
  /** The chain's pedals (ids, names and placement; no values). */
  chain: ChainItem[];
  /** How many of the gear's captures use it. */
  count: number;
  /** The most downloaded capture using it: picking the chain starts from its pedal settings. */
  from: Capture;
}

/** Per gear id, the pedal chains its captures use, most used first. */
export function chainOptions(captures: Capture[], gear: GearLookup): Record<string, ChainOption[]> {
  const by: Record<string, Map<string, ChainOption>> = {};
  captures.forEach((c) => {
    if (!c.ampId || !c.chain) return;
    const k = chainKey(c.chain),
      m = (by[c.ampId] = by[c.ampId] || new Map());
    let o = m.get(k);
    if (!o) {
      o = {
        key: k,
        chain: c.chain.map((p) => ({ id: p.id, name: p.name, ...(p.loop ? { loop: true } : {}) })),
        count: 0,
        from: c,
      };
      m.set(k, o);
    }
    o.count++;
    if ((c.downloads || 0) > (o.from.downloads || 0)) o.from = c;
  });
  return Object.fromEntries(
    Object.entries(by).map(([id, m]) => [
      id,
      [...m.values()].sort((a, b) => b.count - a.count || byName(chainName(a.chain, gear), chainName(b.chain, gear))),
    ]),
  );
}

/** Per pedal id, the gear it is used with (by its captures' chains): {gear id → capture count}. */
export function pedalUse(captures: Capture[]): Record<string, Record<string, number>> {
  const used: Record<string, Record<string, number>> = {};
  captures.forEach((c) => {
    if (!c.ampId || !c.chain) return;
    new Set(c.chain.map((p) => p.id).filter((id): id is string => !!id)).forEach((id) => {
      const m = (used[id] = used[id] || {});
      m[c.ampId!] = (m[c.ampId!] || 0) + 1;
    });
  });
  return used;
}
