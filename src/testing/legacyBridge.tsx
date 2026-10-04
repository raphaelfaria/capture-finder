// The legacy bridge: the old app's globals (state, cur(), pickAmp(), settingsSimilarity()…), backed by the
// new store and modules, so the original test suites (tests/legacy) run unchanged against the new app.
// Only test builds include it: `vite build --mode legacy-test` (browser suite, tools/verify-gear) and
// vite.bridge.config.ts (the vm-based app suite). It is never part of the deployed app.
//
// `state` is a live view of the store's state under the old field names: reading it reads the current
// state, and assigning anywhere inside it (state.amps.jp2c.ch[3].gain = 9) updates the store immutably.
import { options } from 'preact';
import { renderToString } from 'preact-render-to-string';
import type { ReadonlySignal } from '@preact/signals';
import type { Capture, Control, ControlValue, GearDef } from '../../shared/schema';
import { captureEntries, gearEntries } from '../data/pickers';
import { gearCategory } from '../domain/catalog/categories';
import { deviceNames } from '../domain/catalog/deviceNames';
import { captureTypeLabel, cloudUrl } from '../domain/captures';
import { pedalValue } from '../domain/chains';
import { available, getValue, initialSettings, optionsFor } from '../domain/controls';
import { byName } from '../domain/format';
import { captureValues, comparisonStatus, settingsSimilarity, switchValue } from '../domain/similarity';
import type { GearSettings } from '../domain/types';
import type { Ranking } from '../state/results';
import type { Store } from '../state/store';
import { RankingContext, StoreContext } from '../ui/context';
import { gOrder, gRelated, gSecLayout, gSwitchBlock, gSwitchOrder } from '../ui/panels/generic/layout';
import { CaptureDrawer } from '../ui/results/CaptureDrawer';
import { Stage } from '../ui/stage/Stage';

type Path = (string | number)[];
type Obj = Record<string, unknown>;

/** Old top-level names → where they live now. */
const ALIASES: Record<string, Path> = {
  ampQuery: ['gearPicker', 'query'],
  ampOpen: ['gearPicker', 'open'],
  ampActive: ['gearPicker', 'active'],
  ampPath: ['gearPicker', 'path'],
  capQuery: ['capturePicker', 'query'],
  capOpen: ['capturePicker', 'open'],
  capActive: ['capturePicker', 'active'],
  capPath: ['capturePicker', 'path'],
};
const resolve = (path: Path): Path =>
  path.length && ALIASES[path[0] as string] ? [...ALIASES[path[0] as string]!, ...path.slice(1)] : path;
const at = (root: unknown, path: Path): unknown =>
  path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Obj)[k as string]), root);
/** A copy of `root` with `value` at `path` (copying each object on the way). */
function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = (root ?? {}) as Obj;
  const copy: Obj = Array.isArray(base) ? ([...base] as unknown as Obj) : { ...base };
  copy[k as string] = setAt(base[k as string], rest, value);
  return copy;
}

/** A live, writable view of the store's state at a path (arrays and primitives are returned as values). */
function stateView(store: Store, path: Path = []): Obj {
  return new Proxy({} as Obj, {
    get(_t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key === 'toJSON') return () => at(store.state.peek(), resolve(path));
      const p = resolve([...path, key]),
        v = at(store.state.peek(), p);
      return v && typeof v === 'object' && !Array.isArray(v) ? stateView(store, [...path, key]) : v;
    },
    set(_t, key, value) {
      store.state.value = setAt(
        store.state.peek(),
        resolve([...path, key as string]),
        value,
      ) as typeof store.state.value;
      return true;
    },
    has: (_t, key) => typeof key === 'string' && key in ((at(store.state.peek(), resolve(path)) as Obj) || {}),
    ownKeys: () => Reflect.ownKeys((at(store.state.peek(), resolve(path)) as Obj) || {}),
    getOwnPropertyDescriptor(_t, key) {
      const o = (at(store.state.peek(), resolve(path)) as Obj) || {};
      if (!(key in o)) return undefined;
      const v = o[key as string];
      return {
        value: v && typeof v === 'object' && !Array.isArray(v) ? stateView(store, [...path, key as string]) : v,
        writable: true,
        enumerable: true,
        configurable: true,
      };
    },
  });
}

/** A pedal control as the old code saw it: key "p0:gain", with its pedal and base key. */
type LegacyControl = Control & { pedal?: number; baseKey?: string; w0?: number };

/** Renders Preact has queued, run now (set by installBrowserBridge). */
let flushRenders: () => void = () => {};

export function legacyApi(store: Store, ranking?: ReadonlySignal<Ranking>) {
  const cat = store.catalog,
    gear = cat.gearById;
  const state = stateView(store);
  // preamp versions: tests may override a gear's family
  const VARIANTS = new Map<string, GearDef[]>();
  const family = cat.family.bind(cat);
  cat.family = (def) => (VARIANTS.has(def.id) ? VARIANTS.get(def.id)! : family(def));
  const cur = () => {
    const def = store.def.peek();
    return { def, as: (state.amps as Obj)[def.id] as unknown as GearSettings, ch: store.channel.peek() };
  };
  const ctrlByKey = (key: string): LegacyControl | undefined => {
    const own = store.def.peek().controls.find((c) => c.key === key);
    // w0: the control's original weight (the old app kept it on the control)
    if (own) return { ...own, w0: store.baseDef.peek().controls.find((c) => c.key === key)!.weight };
    const m = /^p(\d+):(.+)$/.exec(key);
    if (!m) return undefined;
    const p = store.chain.peek()[Number(m[1])],
      d = p && p.id ? gear(p.id) : null,
      c = d && d.controls.find((x) => x.key === m[2]);
    return c ? { ...c, key, pedal: Number(m[1]), baseKey: c.key, scope: 'global' } : undefined;
  };
  const getVal = (_def: GearDef, as: GearSettings, c: LegacyControl, n: number | null): ControlValue | undefined =>
    c.pedal != null ? pedalValue(as.chain || [], c.pedal, c.baseKey!, gear) : getValue(as, c, n);
  const setCtrl = (c: LegacyControl, n: number | null, v: ControlValue) =>
    c.pedal != null ? store.setPedalControl(c.pedal, c.baseKey!, v) : store.setControl(c, n, v);
  const wrap = (node: preact.ComponentChildren) =>
    renderToString(
      <StoreContext.Provider value={store}>
        <RankingContext.Provider value={ranking ?? null}>{node}</RankingContext.Provider>
      </StoreContext.Provider>,
    );
  const ALIAS_KEYS = Object.keys(ALIASES);
  return {
    state,
    cur,
    ctrlByKey,
    getVal,
    setCtrl,
    update: (patch: Obj = {}) => {
      let next: unknown = store.state.peek();
      for (const [k, v] of Object.entries(patch)) next = setAt(next, ALIAS_KEYS.includes(k) ? ALIASES[k]! : [k], v);
      store.state.value = { ...(next as typeof store.state.value) };
    },
    render: () => flushRenders(),
    pickAmp: store.pickAmp,
    loadCapture: store.loadCapture,
    setChannel: store.setChannel,
    initialAmpState: initialSettings,
    settingsSimilarity: (cap: Capture, def: GearDef, as: GearSettings) => settingsSimilarity(cap, def, as, gear),
    comparisonStatus,
    captureValues,
    switchValue,
    available,
    optionsFor,
    filteredCaptures: () => {
      const caps = cat.capturesFor(store.def.peek());
      return { ampCaps: caps, shown: caps };
    },
    renderStage: () => wrap(<Stage />),
    renderDrawer: () => wrap(<CaptureDrawer />),
    gOrder,
    gRelated,
    gSwitchOrder,
    gSecLayout,
    gSwitchBlock,
    gearEntries: (path: string[] = store.state.peek().gearPicker.path, query = store.state.peek().gearPicker.query) =>
      gearEntries(cat, path, query),
    capEntries: (
      path: string[] = store.state.peek().capturePicker.path,
      query = store.state.peek().capturePicker.query,
    ) => captureEntries(cat, path, query),
    cloudUrl,
    captureTypeLabel,
    AMP_DEFS: cat.gear,
    CAPTURES: cat.captures,
    CATEGORIES: cat.categories,
    CATEGORY_ORDER: cat.categoryOrder,
    get CAP_SORTED() {
      return cat.captureEntries();
    },
    DEVICE_NAME: deviceNames(cat.captures, cat.pickable, gearCategory),
    VARIANTS,
    gearDef: gear,
    ampById: cat.pickable,
    gearCategory: cat.gearCategory,
    gearInstrument: cat.gearInstrument,
    byName,
  };
}

/** Browser test builds: the globals on window, and the old readiness flag. The old app's render() drew the
 *  page synchronously (the tests change `state`, call render() and read the page right away), so here
 *  render() runs the renders Preact has queued (they still run on their own a moment later). */
export function installBrowserBridge(store: Store, ranking: ReadonlySignal<Ranking>): void {
  let pending: (() => void) | null = null;
  options.debounceRendering = (run) => {
    pending = run;
    queueMicrotask(() => {
      if (pending === run) pending = null;
      run();
    });
  };
  flushRenders = () => {
    const run = pending;
    pending = null;
    run?.();
  };
  const api = legacyApi(store, ranking);
  Object.defineProperties(window, Object.getOwnPropertyDescriptors(api));
  (window as unknown as { CF_READY: boolean }).CF_READY = true;
}
