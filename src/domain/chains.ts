// Pedal chains: pedals with the gear in signal order, in front of it or in its effects loop.
import type { ChainItem, ControlValue } from '../../shared/schema';
import type { GearLookup } from './types';

/** Identity of a chain (ids, or names for unidentified pedals, and their placement). */
export const chainKey = (list: ChainItem[] | null | undefined): string =>
  (list || []).map((p) => (p.id || 'name:' + String(p.name).toLowerCase()) + (p.loop ? '@loop' : '')).join('>');

/** "A → B · loop: C → D" (front pedals, then the ones in the effects loop). */
export function chainLabel(list: ChainItem[] | null | undefined, nameOf: (p: ChainItem) => string): string {
  const front = (list || []).filter((p) => !p.loop).map(nameOf),
    loop = (list || []).filter((p) => p.loop).map(nameOf);
  return front.join(' → ') + (loop.length ? (front.length ? ' · ' : '') + 'loop: ' + loop.join(' → ') : '');
}

/** The chain with full pedal names ("Xotic Effects BB Preamp → …"). */
export const chainName = (list: ChainItem[] | null | undefined, gear: GearLookup): string =>
  chainLabel(list, (p) => {
    const d = p.id ? gear(p.id) : null;
    return d ? d.brand + ' ' + d.model : p.name;
  });

/** The chain with short pedal names ("BB Preamp → …"). */
export const chainShort = (list: ChainItem[] | null | undefined, gear: GearLookup): string =>
  chainLabel(list, (p) => {
    const d = p.id ? gear(p.id) : null;
    return d ? d.model : p.name;
  });

/** A pedal's value in a chain: its own setting, else its definition's starting value. */
export function pedalValue(chain: ChainItem[], i: number, key: string, gear: GearLookup): ControlValue | undefined {
  const p = chain[i];
  if (!p) return undefined;
  const d = p.id ? gear(p.id) : null;
  return p.values && key in p.values ? p.values[key] : d ? d.defaults.global[key] : undefined;
}

/** A chain to keep in the settings: each pedal's values copied. */
export const copyChain = (list: ChainItem[] | null | undefined): ChainItem[] =>
  (list || []).map((p) => ({
    id: p.id,
    name: p.name,
    values: { ...(p.values || {}) },
    ...(p.loop ? { loop: true } : {}),
  }));
