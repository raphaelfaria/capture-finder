// App-wide contexts: the store, and the (throttled) ranking of the gear's captures.
import type { ReadonlySignal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Ranking } from '../state/results';
import type { Store } from '../state/store';

export const StoreContext = createContext<Store | null>(null);
export const RankingContext = createContext<ReadonlySignal<Ranking> | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside the app');
  return s;
}
export function useRanking(): ReadonlySignal<Ranking> {
  const r = useContext(RankingContext);
  if (!r) throw new Error('useRanking outside the app');
  return r;
}
