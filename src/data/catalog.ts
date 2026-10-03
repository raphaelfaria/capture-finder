// The catalog: the loaded gear and captures with the indexes and derived lists the app reads.
// Immutable once built; expensive parts are computed on first use.
import type { Capture, GearDef } from '../../shared/schema';
import { categoriesOf, gearCategory, gearInstruments, gearSort, instrumentOf, instrumentOrderOf } from '../domain/catalog/categories';
import { chainOptions, pedalUse, type ChainOption } from '../domain/catalog/chainOptions';
import { deviceNames } from '../domain/catalog/deviceNames';
import { ampFamily } from '../domain/catalog/variants';
import { byName } from '../domain/format';
import { fzIndex, type FuzzyIndex } from '../domain/search/fuzzy';
import type { GearLookup } from '../domain/types';

export interface CatalogData {
  gear: GearDef[];
  captures: Capture[];
}

/** The library entry for captures with no gear mapping: browsed, never scored. */
export const UNMAPPED: GearDef = {
  id: 'unmapped',
  brand: 'Library',
  model: 'Unmapped captures',
  category: 'Unmapped',
  panel: 'generic',
  channels: null,
  controls: [],
  defaults: { channel: null, ch: {}, global: {} },
  browseOnly: true,
};

/** A capture in the capture picker: with its gear, category and instrument, and its search text. */
export interface CaptureEntry {
  c: Capture;
  a: GearDef | null;
  cat: string;
  inst: string;
  hay: string;
}

export interface Catalog {
  /** Every definition, chain-only pedals included. */
  allDefs: GearDef[];
  /** Gear offered in the pickers (no chain-only pedals), plus the unmapped library last. */
  gear: GearDef[];
  captures: Capture[];
  /** Any definition by id (chain-only pedals too), or null. */
  gearById: GearLookup;
  /** Pickable gear by id; unknown ids fall back to the first gear. */
  pickable(id: string): GearDef;
  isPickable(id: string | null | undefined): boolean;
  captureById(id: string): Capture | undefined;
  /** The captures of a gear (unmapped ones for the library entry). */
  capturesFor(def: GearDef): Capture[];
  categories: string[];
  /** Categories, then Unmapped. */
  categoryOrder: string[];
  gearCategory(def: GearDef): string;
  gearInstrument(def: GearDef): string;
  instrumentOrder: string[];
  instRank(instrument: string): number;
  /** The name the gear goes by on the device (from its capture names). */
  deviceName(def: GearDef): string;
  /** Every capture for the capture picker, sorted by category, instrument, gear and name. */
  captureEntries(): CaptureEntry[];
  /** The pedal chains a gear's captures use, most used first. */
  chainOptions(gearId: string): ChainOption[];
  /** The gear a pedal is used with, most captures first. */
  usedIn(pedalId: string): { id: string; count: number }[];
  /** The standalone preamp and its power amp versions, or [] (see domain/catalog/variants). */
  family(def: GearDef): GearDef[];
  /** The fuzzy-search index of a gear's names. */
  gearIndex(def: GearDef): FuzzyIndex;
  captureIndex(entry: CaptureEntry): FuzzyIndex;
}

const lazy = <T>(make: () => T): (() => T) => {
  let v: T | undefined, done = false;
  return () => {
    if (!done) {
      v = make();
      done = true;
    }
    return v as T;
  };
};

export function createCatalog({ gear: defs, captures }: CatalogData): Catalog {
  const allDefs = defs;
  const gear = defs.filter((d) => !d.chainOnly).concat(UNMAPPED);
  const byId = new Map(allDefs.map((d) => [d.id, d] as const));
  const pickById = new Map(gear.map((d) => [d.id, d] as const));
  const capById = new Map(captures.map((c) => [c.id, c] as const));
  const gearById: GearLookup = (id) => byId.get(id) || null;
  const pickable = (id: string) => pickById.get(id) || gear[0]!;
  const capsByGear = new Map<string, Capture[]>();
  captures.forEach((c) => {
    const k = c.ampId || UNMAPPED.id;
    if (!capsByGear.has(k)) capsByGear.set(k, []);
    capsByGear.get(k)!.push(c);
  });
  const categories = categoriesOf(gear);
  const categoryOrder = categories.concat('Unmapped');
  const instruments = lazy(() => gearInstruments(gear, captures));
  const instrumentOrder = instrumentOrderOf(captures);
  const instRank = (i: string) => {
    const r = instrumentOrder.indexOf(i);
    return r < 0 ? instrumentOrder.length : r;
  };
  const gearInstrument = (a: GearDef) => (a.browseOnly ? '' : instruments()[a.id] || 'Other');
  const names = lazy(() => deviceNames(captures, pickable, gearCategory));
  const deviceName = (a: GearDef) => names()[a.id] || a.brand + ' ' + a.model;
  const entries = lazy(() =>
    captures
      .map((c): CaptureEntry => {
        const a = c.ampId ? pickById.get(c.ampId) || null : null,
          cat = a ? gearCategory(a) : 'Unmapped';
        // a mapped capture sits under its gear's instrument, so each gear appears in one place
        const inst = a ? gearInstrument(a) : instrumentOf(c.instrument);
        return { c, a, cat, inst, hay: (c.name + ' ' + (a ? a.brand + ' ' + a.model : '') + ' ' + cat + ' ' + inst).toLowerCase() };
      })
      .sort(
        (x, y) =>
          categoryOrder.indexOf(x.cat) - categoryOrder.indexOf(y.cat) ||
          instRank(x.inst) - instRank(y.inst) ||
          (x.a && y.a ? gearSort(x.a, y.a) : 0) ||
          byName(x.c.name, y.c.name),
      ),
  );
  const chains = lazy(() => chainOptions(captures, gearById));
  const uses = lazy(() => pedalUse(captures));
  const families = new Map<string, GearDef[]>();
  const gearIndexes = new Map<string, FuzzyIndex>();
  const captureIndexes = new WeakMap<CaptureEntry, FuzzyIndex>();
  const deviceLabel = (id: string) => {
    const d = gearById(id);
    return d ? d.brand + ' ' + d.model : id;
  };
  return {
    allDefs,
    gear,
    captures,
    gearById,
    pickable,
    isPickable: (id) => !!id && pickById.has(id),
    captureById: (id) => capById.get(id),
    capturesFor: (def) => capsByGear.get(def.browseOnly ? UNMAPPED.id : def.id) || [],
    categories,
    categoryOrder,
    gearCategory,
    gearInstrument,
    instrumentOrder,
    instRank,
    deviceName,
    captureEntries: entries,
    chainOptions: (id) => chains()[id] || [],
    usedIn: (pedalId) =>
      Object.entries(uses()[pedalId] || {})
        .filter(([id]) => pickById.has(id) && id !== UNMAPPED.id)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || byName(deviceLabel(a.id), deviceLabel(b.id))),
    family: (def) => {
      if (!families.has(def.id)) families.set(def.id, ampFamily(def, gear, captures));
      return families.get(def.id)!;
    },
    gearIndex: (a) => {
      if (!gearIndexes.has(a.id))
        gearIndexes.set(a.id, fzIndex(a.brand + ' ' + a.model + ' ' + deviceName(a) + ' ' + a.id + ' ' + gearCategory(a) + ' ' + gearInstrument(a)));
      return gearIndexes.get(a.id)!;
    },
    captureIndex: (e) => {
      if (!captureIndexes.has(e)) captureIndexes.set(e, fzIndex(e.hay));
      return captureIndexes.get(e)!;
    },
  };
}
