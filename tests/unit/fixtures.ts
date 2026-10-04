// The real data, loaded once for the unit tests, and a fresh store over it.
import fs from 'node:fs';
import path from 'node:path';
import type { Capture, GearDef } from '../../shared/schema';
import { createCatalog, type Catalog } from '../../src/data/catalog';
import { settingsSimilarity } from '../../src/domain/similarity';
import { createStore, type Store } from '../../src/state/store';
import { OUTPUT_DIR } from '../../tools/lib/paths';

const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, name), 'utf8')) as T;
export const GEAR = read<GearDef[]>('gear.json');
export const CAPTURES = read<Capture[]>('captures.json');

let shared: Catalog | null = null;
/** One catalog for all tests (it is immutable). */
export const catalog = (): Catalog => (shared ??= createCatalog({ gear: GEAR, captures: CAPTURES }));

/** A store with nothing saved, on the given gear. */
export function storeOn(amp?: string): Store {
  const s = createStore(catalog());
  if (amp) s.pickAmp(amp);
  return s;
}

/** A capture by its (trimmed) name. */
export const capture = (name: string): Capture => {
  const c = CAPTURES.find((x) => x.name.trim() === name);
  if (!c) throw new Error('no capture ' + name);
  return c;
};

/** The score of the gear's starting capture at the starting settings (each channel's most downloaded
 *  capture: it scores 100 at them). */
export function startScore(s: Store): number {
  const def = s.def.value,
    as = s.settings.value;
  const f =
    (def.defaultsFrom || []).find((x) => x.channel === (def.channels ? as.channel : null)) ||
    (def.defaultsFrom || [])[0]!;
  const c = CAPTURES.find((x) => x.ampId === def.id && x.name === f.name)!;
  const r = settingsSimilarity(c, def, as, catalog().gearById);
  return r.status === 'scored' ? r.score : -1;
}
