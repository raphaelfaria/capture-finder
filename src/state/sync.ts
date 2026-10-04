// Keeping the store in step with the browser: saved state (localStorage) and the address (?amp=…).
import { computed, effect } from '@preact/signals';
import { save, serializeBench, type KeyValueStorage } from './persistence';
import type { Store } from './store';

/** Save the bench whenever it changes (UI-only changes don't write). */
export function connectPersistence(store: Store, storage: KeyValueStorage | null): () => void {
  const bench = computed(() => {
    const s = store.state.value;
    return { amp: s.amp, amps: s.amps, loaded: s.loaded, weights: s.weights };
  });
  let last = '';
  return effect(() => {
    const b = bench.value;
    const data = serializeBench(store.catalog, { ...store.state.peek(), ...b });
    if (data !== last) save(storage, (last = data));
  });
}

/** The gear in the address: picking gear adds a history entry, so back and forward move between gear;
 *  the first page records its gear in place. */
export function connectUrl(store: Store, win: Window): () => void {
  let urlAmp: string | null = null;
  const stop = effect(() => {
    const amp = store.state.value.amp;
    if (amp === urlAmp) return;
    try {
      const u = new URL(win.location.href);
      u.searchParams.set('amp', amp);
      win.history[urlAmp === null ? 'replaceState' : 'pushState']({ amp }, '', u);
      urlAmp = amp;
    } catch {
      // no history API (sandboxed frames): the address just doesn't follow
    }
  });
  const onPop = () => {
    let q: string | null;
    try {
      q = new URLSearchParams(win.location.search).get('amp');
    } catch {
      return;
    }
    if (!q || !store.catalog.isPickable(q) || q === store.state.peek().amp) return;
    urlAmp = q;
    store.showAmpFromUrl(q);
  };
  win.addEventListener('popstate', onPop);
  return () => {
    stop();
    win.removeEventListener('popstate', onPop);
  };
}

/** The gear named in the address, if any. */
export function ampFromUrl(win: Window): string | null {
  try {
    return new URLSearchParams(win.location.search).get('amp');
  } catch {
    return null;
  }
}
