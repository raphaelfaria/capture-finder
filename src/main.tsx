// Entry point: fetch the data, build the catalog and the store, keep the store in step with the browser
// (saved state, the address), and render the app.
import { render } from 'preact';
import type { Capture, GearDef } from '../shared/schema';
import { createCatalog } from './data/catalog';
import { createRanking } from './state/results';
import { createStore } from './state/store';
import { ampFromUrl, connectPersistence, connectUrl } from './state/sync';
import './styles/index.css';
import { App } from './ui/App';

/** localStorage, or null where it can't be used (private windows, blocked site data). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function load<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' (' + r.status + ')');
  return (await r.json()) as T;
}

export async function start(root: HTMLElement): Promise<ReturnType<typeof createStore>> {
  // the data sits next to the page (public/data → data/ in the build)
  const [gear, captures] = await Promise.all([
    load<GearDef[]>('data/gear.json'),
    load<Capture[]>('data/captures.json'),
  ]);
  const catalog = createCatalog({ gear, captures });
  const store = createStore(catalog, { storage: storage(), urlAmp: ampFromUrl(window) });
  connectPersistence(store, storage());
  connectUrl(store, window);
  const { ranking } = createRanking(store);
  render(<App store={store} ranking={ranking} />, root);
  // test builds only (vite build --mode legacy-test): the old app's globals, for the original test suites
  if (import.meta.env.MODE === 'legacy-test')
    (await import('./testing/legacyBridge')).installBrowserBridge(store, ranking);
  return store;
}

const root = document.getElementById('root')!;
export const ready = start(root).catch((err: Error) => {
  const msg = document.createElement('p');
  msg.className = 'note';
  msg.setAttribute('role', 'alert');
  msg.textContent = 'Could not load the capture data: ' + err.message + '.';
  root.replaceChildren(msg);
  throw err;
});
