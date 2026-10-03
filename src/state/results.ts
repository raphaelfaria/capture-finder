// Ranking the gear's captures against the dialled-in settings. Ranking every capture is the costly
// part of an update, so it is redone only when the gear or its settings (or weights) change, and at most
// every RESULTS_EVERY ms while a control is moving; the last change always lands. A different gear
// ranks straight away.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { Capture, GearDef } from '../../shared/schema';
import type { Catalog } from '../data/catalog';
import { settingsSimilarity } from '../domain/similarity';
import type { GearSettings, Similarity } from '../domain/types';
import type { Store } from './store';

export const RESULTS_EVERY = 150;

export interface Ranked {
  c: Capture;
  r: Similarity;
}
export interface Ranking {
  def: GearDef;
  /** The gear's captures. */
  captures: Capture[];
  /** Scored captures best first, then the unscored ones. */
  list: Ranked[];
  /** The best score, or null when none could be scored. */
  best: number | null;
}

export function rank(catalog: Catalog, def: GearDef, as: GearSettings): Ranking {
  const captures = catalog.capturesFor(def);
  const results = captures.map((c) => ({ c, r: settingsSimilarity(c, def, as, catalog.gearById) }));
  const scored = results.filter((x) => x.r.status === 'scored').sort((a, b) => score(b) - score(a));
  return {
    def,
    captures,
    list: scored.concat(results.filter((x) => x.r.status !== 'scored')),
    best: scored.length ? score(scored[0]!) : null,
  };
}
const score = (x: Ranked) => (x.r.status === 'scored' ? x.r.score : -1);

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
}
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/** The ranking for the workbench, kept up to date (throttled) while `dispose` isn't called. */
export function createRanking(
  store: Store,
  clock: Clock = realClock,
): { ranking: ReadonlySignal<Ranking>; dispose: () => void } {
  let latest = { def: store.def.peek(), as: store.settings.peek() },
    shown = latest,
    at = clock.now(),
    timer: unknown = null;
  const ranking = signal(rank(store.catalog, latest.def, latest.as));
  const run = () => {
    timer = null;
    at = clock.now();
    shown = latest;
    ranking.value = rank(store.catalog, latest.def, latest.as);
  };
  const dispose = effect(() => {
    latest = { def: store.def.value, as: store.settings.value };
    if (latest.def === shown.def && latest.as === shown.as) return;
    if (latest.def.id !== shown.def.id || clock.now() - at >= RESULTS_EVERY) {
      if (timer !== null) clock.clearTimeout(timer);
      run();
    } else if (timer === null) timer = clock.setTimeout(run, RESULTS_EVERY - (clock.now() - at));
  });
  return { ranking, dispose };
}
