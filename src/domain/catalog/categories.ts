// Gear categories (Amps, Pedals…) and instrument subcategories (Guitar, Bass…) for the pickers.
import type { Capture, GearDef } from '../../../shared/schema';
import { byName } from '../format';

export const gearCategory = (a: GearDef): string => (a.browseOnly ? 'Unmapped' : a.category || 'Amps');

/** Categories of the pickable gear: Amps first, then by name. */
export const categoriesOf = (gear: GearDef[]): string[] =>
  [...new Set(gear.filter((a) => !a.browseOnly).map(gearCategory))].sort(
    (a, b) => Number(a !== 'Amps') - Number(b !== 'Amps') || byName(a, b),
  );

/** A capture's instrument, with unset ones as "Other". */
export const instrumentOf = (v: string | null | undefined): string => (v && !/not.?set|unknown/i.test(v) ? v : 'Other');

/** Each gear's instrument: the most common one among its captures ("Other" when none is set). */
export function gearInstruments(gear: GearDef[], captures: Capture[]): Record<string, string> {
  const counts: Record<string, Record<string, number>> = {};
  captures.forEach((c) => {
    if (!c.ampId) return;
    const i = instrumentOf(c.instrument);
    if (i === 'Other') return;
    (counts[c.ampId] = counts[c.ampId] || {})[i] = (counts[c.ampId]![i] || 0) + 1;
  });
  return Object.fromEntries(
    gear.map((a) => [a.id, Object.entries(counts[a.id] || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || 'Other']),
  );
}

/** Instrument order: Guitar, Bass, the others by name, then Other. */
export const instrumentOrderOf = (captures: Capture[]): string[] =>
  ['Guitar', 'Bass'].concat(
    [...new Set(captures.map((c) => instrumentOf(c.instrument)))]
      .filter((i) => !['Guitar', 'Bass', 'Other'].includes(i))
      .sort(),
    'Other',
  );

/** Gear by maker, then model. */
export const gearSort = (a: GearDef, b: GearDef): number => byName(a.brand, b.brand) || byName(a.model, b.model);
