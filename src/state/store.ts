// The store: one signal holding the AppState, the selectors derived from it, and the actions that
// change it. Components read signals and call actions; nothing else writes the state.
import { batch, computed, signal } from '@preact/signals';
import type { Control, ControlValue, RangeControl, SwitchControl } from '../../shared/schema';
import { BACK, captureEntries, gearEntries, type CapturePickerRow, type GearPickerRow } from '../data/pickers';
import type { Catalog } from '../data/catalog';
import { chainKey, chainShort, copyChain } from '../domain/chains';
import { powerAmpOf } from '../domain/catalog/variants';
import { getValue, initialSettings, optionsFor, snap } from '../domain/controls';
import type { GearSettings } from '../domain/types';
import { W_STEP, setWeightOverride, withWeights } from '../domain/weights';
import { PAGE, closedPicker, type AppState, type MenuKind, type PickerState } from './appState';
import { restore, type KeyValueStorage } from './persistence';

/** The gear shown on a first visit. */
export const START_AMP = 'jp2c';

export interface MenuItem {
  v: string;
  top?: string;
  main: string;
  right?: string;
  selected?: boolean;
}

export type PickerKind = 'gear' | 'capture';

export interface StoreOptions {
  storage?: KeyValueStorage | null;
  /** A gear id from the address (?amp=…): wins over the saved gear. */
  urlAmp?: string | null;
}

export function createStore(catalog: Catalog, { storage = null, urlAmp = null }: StoreOptions = {}) {
  const startAmps = Object.fromEntries(catalog.gear.map((d) => [d.id, initialSettings(d)]));
  const saved = restore(catalog, storage, startAmps, START_AMP);
  const amp = urlAmp && catalog.isPickable(urlAmp) ? urlAmp : (saved.amp ?? START_AMP);
  const state = signal<AppState>({
    amp,
    amps: saved.amps,
    weights: saved.weights,
    loaded: saved.loaded,
    gearPicker: closedPicker(),
    capturePicker: closedPicker(),
    openId: null,
    infoOpen: false,
    weightsOpen: false,
    menu: null,
    menuActive: 0,
    limit: PAGE,
  });

  // ---------- selectors ----------
  /** The gear on the workbench, as defined in the data. */
  const baseDef = computed(() => catalog.pickable(state.value.amp));
  /** The same gear with its edited matching weights applied: what matching uses. */
  const def = computed(() => withWeights(baseDef.value, state.value.weights[baseDef.value.id]));
  const settings = computed(() => state.value.amps[baseDef.value.id]!);
  const channel = computed(() => settings.value.channel);
  const chain = computed(() => settings.value.chain || []);
  const openCapture = computed(() => (state.value.openId ? catalog.captureById(state.value.openId) || null : null));
  const gearRows = computed(() => gearEntries(catalog, state.value.gearPicker.path, state.value.gearPicker.query));
  const captureRows = computed(() =>
    captureEntries(catalog, state.value.capturePicker.path, state.value.capturePicker.query),
  );

  // ---------- updates ----------
  const set = (patch: Partial<AppState>) => {
    state.value = { ...state.value, ...patch };
  };
  const setSettings = (id: string, as: GearSettings, patch: Partial<AppState> = {}) =>
    set({ amps: { ...state.value.amps, [id]: as }, loaded: null, ...patch });
  const picker = (which: PickerKind) => (which === 'gear' ? state.value.gearPicker : state.value.capturePicker);
  const setPicker = (which: PickerKind, patch: Partial<PickerState>) =>
    set(
      which === 'gear'
        ? { gearPicker: { ...state.value.gearPicker, ...patch } }
        : { capturePicker: { ...state.value.capturePicker, ...patch } },
    );
  const closeAll = { infoOpen: false, weightsOpen: false } as const;

  // ---------- gear ----------
  function pickAmp(id: string) {
    set({
      amp: id,
      openId: null,
      gearPicker: { ...state.value.gearPicker, open: false, active: 0 },
      limit: PAGE,
      loaded: null,
      menu: null,
      ...closeAll,
    });
  }
  /** Back/forward to a gear in the address. */
  function showAmpFromUrl(id: string | null) {
    const s = state.value;
    if (!id || !catalog.isPickable(id) || id === s.amp) return;
    set({
      amp: id,
      openId: null,
      gearPicker: { ...s.gearPicker, open: false },
      capturePicker: { ...s.capturePicker, open: false },
      limit: PAGE,
      loaded: s.loaded && s.loaded.amp === id ? s.loaded : null,
      ...closeAll,
    });
  }

  // ---------- controls ----------
  /** Set a control of the gear on the workbench (a channel control also selects its channel). */
  function setControl(c: Control, n: number | null, v: ControlValue) {
    const id = baseDef.value.id,
      as = settings.value;
    if (c.scope === 'channel') {
      if (n == null) return;
      setSettings(id, { ...as, ch: { ...as.ch, [n]: Object.assign({}, as.ch[n], { [c.key]: v }) }, channel: n });
    } else setSettings(id, { ...as, global: { ...as.global, [c.key]: v } });
  }
  /** Set a control of the i-th pedal in the chain. */
  function setPedalControl(i: number, key: string, v: ControlValue) {
    const as = settings.value,
      list = as.chain || [];
    if (!list[i]) return;
    const next = list.map((p, j) => (j === i ? { ...p, values: Object.assign({}, p.values, { [key]: v }) } : p));
    setSettings(baseDef.value.id, { ...as, chain: next });
  }
  function setChannel(n: number | null) {
    setSettings(baseDef.value.id, { ...settings.value, channel: n });
  }
  function cycleChannel() {
    const ns = (baseDef.value.channels || []).map((c) => c.n);
    if (ns.length) setChannel(ns[(ns.indexOf(channel.value as number) + 1) % ns.length]!);
  }
  /** Step a switch to its next position on channel n. */
  function cycleSwitch(
    c: SwitchControl,
    n: number | null,
    current: ControlValue | undefined,
    apply: (v: ControlValue) => void,
  ) {
    const opts = optionsFor(c, n),
      idx = Math.max(
        0,
        opts.findIndex((o) => o.v === current),
      );
    apply(opts[(idx + 1) % opts.length]!.v);
  }
  function reset() {
    const d = baseDef.value;
    setSettings(d.id, initialSettings(d));
  }

  // ---------- captures ----------
  /** Copy a capture's stated settings onto its gear (unstated controls keep their values) and show it;
   *  a capture without readable settings opens its details instead. */
  function loadCapture(id: string) {
    const c = catalog.captureById(id);
    if (!c) return;
    // the last searches stay in both fields
    const close = {
      gearPicker: { ...state.value.gearPicker, open: false },
      capturePicker: { ...state.value.capturePicker, open: false },
      ...closeAll,
    };
    if (!c.settings || !c.ampId) {
      set({ ...close, openId: id });
      return;
    }
    const d = catalog.pickable(c.ampId),
      s = c.settings,
      prev = state.value.amps[d.id]!;
    const as: GearSettings = { ...prev, ch: { ...prev.ch }, global: { ...prev.global } };
    const recorded = Object.keys(s.byChannel || {}).map(Number);
    const channels: (number | null)[] = !d.channels
      ? [null]
      : recorded.length > 1
        ? recorded
        : [s.channel != null ? s.channel : as.channel];
    channels.forEach((n) => {
      const multiple = Object.keys(s.byChannel || {}).length > 1;
      const vals = multiple ? Object.assign({}, s.values, (n != null && s.byChannel[n]) || {}) : s.values || {};
      d.controls.forEach((ctl) => {
        const v = vals[ctl.key];
        if (v == null || (ctl.channels && (n == null || !ctl.channels.includes(n)))) return;
        if (ctl.scope === 'channel') {
          if (n != null) as.ch[n] = Object.assign({}, as.ch[n], { [ctl.key]: v });
        } else as.global[ctl.key] = v;
      });
    });
    if (d.channels) as.channel = s.channel != null ? s.channel : channels[0]!;
    as.chain = copyChain(c.chain);
    set({
      ...close,
      amps: { ...state.value.amps, [d.id]: as },
      amp: d.id,
      openId: null,
      limit: PAGE,
      loaded: { amp: d.id, name: c.name },
    });
  }
  const openDetails = (id: string) => set({ openId: id, infoOpen: false });
  const closeDetails = () => set({ openId: null });
  const unload = () => set({ loaded: null });
  const showMore = () => set({ limit: state.value.limit + PAGE });

  // ---------- panels ----------
  const toggleInfo = () => set({ infoOpen: !state.value.infoOpen, weightsOpen: false });
  const closeInfo = () => set({ infoOpen: false });
  const toggleWeights = () => set({ weightsOpen: !state.value.weightsOpen, infoOpen: false });
  const closeWeights = () => set({ weightsOpen: false });
  function setWeight(key: string, v: number) {
    const d = baseDef.value;
    const next = setWeightOverride(d, state.value.weights[d.id], key, v);
    const weights = { ...state.value.weights };
    if (Object.keys(next).length) weights[d.id] = next;
    else delete weights[d.id];
    set({ weights });
  }
  /** One weight step up or down (ten with Shift). */
  function stepWeight(key: string, dir: 1 | -1, big = false) {
    const c = def.value.controls.find((x) => x.key === key);
    if (c) setWeight(key, c.weight + dir * W_STEP * (big ? 10 : 1));
  }
  function resetWeights() {
    const weights = { ...state.value.weights };
    delete weights[baseDef.value.id];
    set({ weights });
  }

  // ---------- pedal chains and versions ----------
  /** Pick one of the gear's chains: its pedals start from the most downloaded capture using it. */
  function setChain(key: string) {
    const d = baseDef.value,
      o = catalog.chainOptions(d.id).find((x) => x.key === key);
    setSettings(d.id, { ...settings.value, chain: o ? copyChain(o.from.chain) : [] });
  }
  /** Open gear with the most used of its chains that has this pedal. */
  function openWithPedal(ampId: string, pedalId: string) {
    const o = catalog.chainOptions(ampId).find((x) => x.chain.some((p) => p.id === pedalId));
    const as = state.value.amps[ampId];
    if (o && as) set({ amps: { ...state.value.amps, [ampId]: { ...as, chain: copyChain(o.from.chain) } } });
    pickAmp(ampId);
  }

  /** The rows of a header menu. */
  function menuItems(kind: MenuKind): MenuItem[] {
    const d = baseDef.value;
    if (kind === 'chain') {
      const curKey = chainKey(chain.value),
        opts = catalog.chainOptions(d.id);
      if (!opts.length && !chain.value.length) return [];
      const items: MenuItem[] = [{ v: '', main: 'No pedals', selected: !curKey }];
      opts.forEach((o) => {
        const one = o.chain.length === 1 && o.chain[0]!.id ? catalog.gearById(o.chain[0]!.id) : null;
        items.push({
          v: o.key,
          top: one ? one.brand + (o.chain[0]!.loop ? ' · in the effects loop' : '') : o.chain.length + ' pedals',
          main: one ? one.model : chainShort(o.chain, catalog.gearById),
          right: o.count + ' ' + (o.count === 1 ? 'capture' : 'captures'),
          selected: o.key === curKey,
        });
      });
      if (curKey && !opts.some((o) => o.key === curKey))
        items.push({ v: curKey, main: chainShort(chain.value, catalog.gearById), selected: true });
      return items;
    }
    if (kind === 'variant') {
      const fam = catalog.family(d);
      return fam.map((x) => {
        const pa = powerAmpOf(fam, x),
          n = catalog.capturesFor(x).length;
        return {
          v: x.id,
          top: pa ? 'With power amp' : 'Preamp only',
          main: pa || x.model,
          right: n + ' ' + (n === 1 ? 'capture' : 'captures'),
          selected: x === d,
        };
      });
    }
    return catalog.usedIn(d.id).map((u) => {
      const g = catalog.gearById(u.id)!;
      return { v: u.id, top: g.brand, main: g.model, right: u.count + ' ' + (u.count === 1 ? 'capture' : 'captures') };
    });
  }
  function toggleMenu(kind: MenuKind) {
    const open = state.value.menu === kind;
    set({
      menu: open ? null : kind,
      menuActive: Math.max(
        0,
        menuItems(kind).findIndex((x) => x.selected),
      ),
    });
  }
  const closeMenu = () => set({ menu: null });
  /** ↑/↓ on a menu button: open it on its selected row, or move the highlight. */
  function moveMenu(kind: MenuKind, d: 1 | -1) {
    const items = menuItems(kind),
      open = state.value.menu === kind;
    set({
      menu: kind,
      menuActive: open
        ? Math.max(0, Math.min(items.length - 1, state.value.menuActive + d))
        : Math.max(
            0,
            items.findIndex((x) => x.selected),
          ),
    });
  }
  function pickMenu(kind: MenuKind, v: string) {
    set({ menu: null });
    if (kind === 'chain') setChain(v);
    else if (kind === 'variant') {
      if (v !== baseDef.value.id) pickAmp(v);
    } else if (v) openWithPedal(v, baseDef.value.id);
  }

  // ---------- pickers ----------
  const rowsOf = (which: PickerKind, path: string[], query: string): (GearPickerRow | CapturePickerRow)[] =>
    which === 'gear' ? gearEntries(catalog, path, query) : captureEntries(catalog, path, query);
  /** Opening a picker starts at the category list (the gear picker on the current gear's category). */
  function openPicker(which: PickerKind) {
    if (picker(which).open) return;
    const active = which === 'gear' ? Math.max(0, catalog.categories.indexOf(catalog.gearCategory(baseDef.value))) : 0;
    setPicker(which, { open: true, path: [], active });
  }
  /** Leaving the gear picker without choosing returns it to the top level; the typed text stays. */
  const closePicker = (which: PickerKind) =>
    setPicker(which, which === 'gear' ? { open: false, path: [] } : { open: false });
  const setQuery = (which: PickerKind, query: string) => setPicker(which, { query, open: true, active: 0 });
  /** Move one level: into a drill row, or back up to the row we came from. */
  function stepPicker(which: PickerKind, row: { kind: 'drill'; key: string } | { kind: 'back' }) {
    const path = picker(which).path;
    if (row.kind === 'drill') setPicker(which, { path: path.concat(row.key), active: 1, open: true });
    else if (path.length) {
      const parent = path.slice(0, -1);
      const back = rowsOf(which, parent, '').findIndex((x) => x.kind === 'drill' && x.key === path[path.length - 1]);
      setPicker(which, { path: parent, active: Math.max(0, back), open: true });
    }
  }
  /** Choose a row: gear opens, a capture loads, a level opens. */
  function activate(which: PickerKind, row: GearPickerRow | CapturePickerRow | undefined) {
    if (!row) return;
    if (row.kind === 'amp') pickAmp(row.a.id);
    else if (row.kind === 'cap') loadCapture(row.e.c.id);
    else stepPicker(which, row);
  }
  /** Picker keys (both comboboxes): ↑/↓ move, Enter picks or opens a level, → opens a level, ← or
   *  Backspace (empty field) goes back up, Escape closes. Returns whether the key was handled. */
  function pickerKey(which: PickerKind, key: string): boolean {
    const p = picker(which),
      list = which === 'gear' ? gearRows.value : captureRows.value;
    const active = Math.min(p.active, Math.max(0, list.length - 1)),
      row = list[active];
    const browsing = !p.query.trim();
    if (key === 'ArrowDown') setPicker(which, { open: true, active: Math.min(active + 1, list.length - 1) });
    else if (key === 'ArrowUp') setPicker(which, { open: true, active: Math.max(active - 1, 0) });
    else if (key === 'ArrowRight' && browsing && p.open && row && row.kind === 'drill') stepPicker(which, row);
    else if ((key === 'ArrowLeft' || key === 'Backspace') && browsing && p.open && p.path.length)
      stepPicker(which, BACK);
    else if (key === 'Enter' && p.open && row) activate(which, row);
    else if (key === 'Escape' && p.open) closePicker(which);
    else return false;
    return true;
  }

  // ---------- control helpers for panels ----------
  /** Step a knob/fader from the keyboard or a drag (snapped to its grid). */
  const snapTo = (c: RangeControl, v: number) => snap(c, v);
  const valueOf = (c: Control, n: number | null) => getValue(settings.value, c, n);

  return {
    catalog,
    state,
    // selectors
    baseDef,
    def,
    settings,
    channel,
    chain,
    openCapture,
    gearRows,
    captureRows,
    // actions
    batch,
    set,
    pickAmp,
    showAmpFromUrl,
    setControl,
    setPedalControl,
    setChannel,
    cycleChannel,
    cycleSwitch,
    reset,
    loadCapture,
    openDetails,
    closeDetails,
    unload,
    showMore,
    toggleInfo,
    closeInfo,
    toggleWeights,
    closeWeights,
    setWeight,
    stepWeight,
    resetWeights,
    setChain,
    openWithPedal,
    menuItems,
    toggleMenu,
    closeMenu,
    moveMenu,
    pickMenu,
    openPicker,
    closePicker,
    setQuery,
    stepPicker,
    activate,
    pickerKey,
    snapTo,
    valueOf,
  };
}

export type Store = ReturnType<typeof createStore>;
