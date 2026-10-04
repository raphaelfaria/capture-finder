// The rows of both pickers. While the field is empty they browse in levels — gear: Category ›
// Instrument › Gear; captures: Category › Instrument › Gear › Capture — and typing searches everything
// in one flat list with category/instrument headers. Lists are sorted by maker, then name.
import type { GearDef } from '../../shared/schema';
import { gearSort } from '../domain/catalog/categories';
import { byName } from '../domain/format';
import { fzFilter } from '../domain/search/fuzzy';
import type { Catalog, CaptureEntry } from './catalog';

/** A level that opens the next one. */
export interface DrillRow {
  kind: 'drill';
  key: string;
  label: string;
  count: number;
}
/** Back up one level (shows the current path). */
export interface BackRow {
  kind: 'back';
}
export interface GearRow {
  kind: 'amp';
  a: GearDef;
  /** In a search result list (shown under category/instrument headers). */
  grouped?: boolean;
}
export interface CaptureRow {
  kind: 'cap';
  e: CaptureEntry;
  grouped?: boolean;
}
export type GearPickerRow = DrillRow | BackRow | GearRow;
export type CapturePickerRow = DrillRow | BackRow | CaptureRow;

export const BACK: BackRow = { kind: 'back' };

const instrumentRows = <T>(cat: Catalog, items: T[], instOf: (x: T) => string): DrillRow[] =>
  cat.instrumentOrder
    .filter((i) => items.some((x) => instOf(x) === i))
    .map((i) => ({ kind: 'drill' as const, key: i, label: i, count: items.filter((x) => instOf(x) === i).length }));

/** Gear picker levels: [] categories (+ the unmapped library), [cat] instruments, [cat, inst] gear. */
export function gearEntries(cat: Catalog, path: string[], query: string): GearPickerRow[] {
  const aq = query.trim().toLowerCase();
  const inCategorySort = (x: GearDef, y: GearDef) => cat.instRank(cat.gearInstrument(x)) - cat.instRank(cat.gearInstrument(y)) || gearSort(x, y);
  if (aq) {
    const ordered = [...cat.gear].sort(
      (x, y) => cat.categoryOrder.indexOf(cat.gearCategory(x)) - cat.categoryOrder.indexOf(cat.gearCategory(y)) || inCategorySort(x, y),
    );
    return fzFilter(ordered, aq, cat.gearIndex, (a) => cat.gearCategory(a) + '|' + cat.gearInstrument(a)).map((a) => ({ kind: 'amp', a, grouped: true }));
  }
  const [c, inst] = path;
  if (!c)
    return (cat.categories.map((k) => ({ kind: 'drill', key: k, label: k, count: cat.gear.filter((a) => cat.gearCategory(a) === k).length })) as GearPickerRow[]).concat(
      cat.gear.filter((a) => a.browseOnly).map((a) => ({ kind: 'amp', a })),
    );
  const inCat = cat.gear.filter((a) => cat.gearCategory(a) === c);
  if (!inst) return [BACK, ...instrumentRows(cat, inCat, cat.gearInstrument)];
  return [BACK, ...inCat.filter((a) => cat.gearInstrument(a) === inst).sort(gearSort).map((a): GearRow => ({ kind: 'amp', a }))];
}

/** Capture picker levels: [] categories, [cat] instruments, [cat, inst] gear, [cat, inst, gearId]
 *  captures (unmapped captures list straight under their category). */
export function captureEntries(cat: Catalog, path: string[], query: string): CapturePickerRow[] {
  const all = cat.captureEntries();
  const q = query.trim().toLowerCase();
  if (q) return fzFilter(all, q, cat.captureIndex, (e) => e.cat + '|' + e.inst).map((e) => ({ kind: 'cap', e, grouped: true }));
  const [c, inst, gid] = path;
  if (!c)
    return cat.categoryOrder
      .map((k): DrillRow => ({ kind: 'drill', key: k, label: k, count: all.filter((e) => e.cat === k).length }))
      .filter((x) => x.count);
  const inCat = all.filter((e) => e.cat === c);
  if (c === 'Unmapped') return [BACK, ...inCat.map((e): CaptureRow => ({ kind: 'cap', e }))];
  if (!inst) return [BACK, ...instrumentRows(cat, inCat, (e) => e.inst)];
  const inInst = inCat.filter((e) => e.inst === inst);
  if (!gid) {
    const gear = new Map<string, DrillRow>();
    inInst.forEach((e) => {
      if (!gear.has(e.a!.id)) gear.set(e.a!.id, { kind: 'drill', key: e.a!.id, label: cat.deviceName(e.a!), count: 0 });
      gear.get(e.a!.id)!.count++;
    });
    return [BACK, ...[...gear.values()].sort((x, y) => byName(x.label, y.label))];
  }
  return [BACK, ...inInst.filter((e) => e.a!.id === gid).map((e): CaptureRow => ({ kind: 'cap', e }))];
}

/** A path element as shown in the back row: categories and instruments as they are; a gear (in the
 *  capture picker) by its device name. */
export const pathLabel = (cat: Catalog, k: string): string => {
  const a = cat.isPickable(k) ? cat.pickable(k) : null;
  return a ? cat.deviceName(a) : k;
};
