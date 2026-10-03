// Remember the workbench between visits, in this browser only: the current gear, every gear's settings
// and channel, its pedal chain, edited matching weights, and the "Loaded from" pill. Popups, the drawer
// and searches start fresh. Saved values are checked against the current gear data, so a rebuilt dataset
// never restores a control that no longer exists or a value out of range.
import type { ChainItem, Values } from '../../shared/schema';
import type { Catalog } from '../data/catalog';
import { cleanValue } from '../domain/controls';
import type { GearSettings, WeightOverrides } from '../domain/types';
import { cleanOverrides } from '../domain/weights';
import type { AppState, LoadedFrom } from './appState';

export const STORE_KEY = 'capture-finder:v1';
/** Saved state from before the rename to Capture Finder: read once, then removed. */
export const OLD_STORE_KEY = 'neural-capture-finder:v1';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Saved {
  amp?: string;
  amps: Record<string, GearSettings>;
  loaded: LoadedFrom | null;
  weights: Record<string, WeightOverrides>;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object';

/** The saved bench, merged onto the given starting settings (which are not modified). `startAmp` is
 *  the gear shown when nothing valid is saved. */
export function restore(
  catalog: Catalog,
  storage: KeyValueStorage | null,
  amps: Record<string, GearSettings>,
  startAmp: string,
): Saved {
  const out: Saved = { amps, loaded: null, weights: {} };
  let saved: unknown;
  try {
    saved = JSON.parse((storage && (storage.getItem(STORE_KEY) || storage.getItem(OLD_STORE_KEY))) || 'null');
  } catch {
    return out;
  }
  if (!isObj(saved)) return out;
  if (typeof saved.amp === 'string' && catalog.isPickable(saved.amp)) out.amp = saved.amp;
  const next: Record<string, GearSettings> = { ...amps };
  const savedAmps = isObj(saved.amps) ? saved.amps : {};
  Object.entries(savedAmps).forEach(([id, sv]) => {
    const def = catalog.isPickable(id) ? catalog.pickable(id) : null;
    if (!def || !isObj(sv) || !next[id]) return;
    const as: GearSettings = { ...next[id]!, ch: { ...next[id]!.ch }, global: { ...next[id]!.global } };
    if (def.channels && def.channels.some((c) => c.n === sv.channel)) as.channel = sv.channel as number;
    const svCh = isObj(sv.ch) ? sv.ch : {},
      svGlobal = isObj(sv.global) ? sv.global : {};
    def.controls.forEach((c) => {
      if (c.scope === 'channel')
        (def.channels || []).forEach((ch) => {
          const v = cleanValue(c, ((svCh[ch.n] as Values) || {})[c.key]);
          if (v !== undefined) as.ch[ch.n] = Object.assign({}, as.ch[ch.n], { [c.key]: v });
        });
      else {
        const v = cleanValue(c, svGlobal[c.key]);
        if (v !== undefined) as.global[c.key] = v;
      }
    });
    if (Array.isArray(sv.chain))
      as.chain = (sv.chain as unknown[])
        .filter(
          (p): p is ChainItem =>
            isObj(p) &&
            typeof p.name === 'string' &&
            (p.id === null || (typeof p.id === 'string' && !!catalog.gearById(p.id))),
        )
        .map((p) => {
          const d = p.id ? catalog.gearById(p.id) : null,
            values: Values = {};
          if (d)
            d.controls.forEach((c) => {
              const v = cleanValue(c, (p.values || {})[c.key]);
              if (v !== undefined) values[c.key] = v;
            });
          return { id: p.id, name: p.name, values, ...(p.loop ? { loop: true } : {}) };
        });
    next[id] = as;
  });
  out.amps = next;
  const amp = out.amp ?? startAmp;
  const loaded = saved.loaded;
  if (isObj(loaded) && loaded.amp === amp && typeof loaded.name === 'string')
    out.loaded = { amp: loaded.amp, name: loaded.name };
  if (isObj(saved.weights))
    Object.entries(saved.weights).forEach(([id, ws]) => {
      const def = catalog.isPickable(id) ? catalog.pickable(id) : null;
      if (!def) return;
      const clean = cleanOverrides(def, ws);
      if (Object.keys(clean).length) out.weights[id] = clean;
    });
  return out;
}

/** What is saved: the gear, the settings that differ from each gear's starting ones, the "Loaded from"
 *  pill and edited weights. */
export function serializeBench(catalog: Catalog, state: AppState): string {
  const amps: Record<string, GearSettings> = {};
  catalog.gear.forEach((d) => {
    const as = state.amps[d.id];
    if (as && JSON.stringify(as) !== JSON.stringify(d.defaults)) amps[d.id] = as;
  });
  return JSON.stringify({ amp: state.amp, amps, loaded: state.loaded, weights: state.weights });
}

export function save(storage: KeyValueStorage | null, data: string): void {
  try {
    storage?.setItem(STORE_KEY, data);
    storage?.removeItem(OLD_STORE_KEY);
  } catch {
    // private mode or blocked storage: nothing is remembered
  }
}
