// The store's actions: gear, controls, captures, chains, weights, menus, pickers and saved state.
import { describe, expect, test, vi } from 'vitest';
import { STORE_KEY } from '../../src/state/persistence';
import { createRanking, RESULTS_EVERY, type Clock } from '../../src/state/results';
import { connectPersistence } from '../../src/state/sync';
import { createStore } from '../../src/state/store';
import { capture, catalog, storeOn } from './fixtures';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('gear and controls', () => {
  test('a channel control sets its channel; reset restores the starting settings', () => {
    const s = storeOn('jp2c');
    const gain = s.def.value.controls.find((c) => c.key === 'gain')!;
    s.setControl(gain, 1, 9);
    expect(s.channel.value).toBe(1);
    expect(s.settings.value.ch[1]!.gain).toBe(9);
    s.reset();
    expect(s.settings.value).toEqual(catalog().pickable('jp2c').defaults);
  });
  test('loading a capture switches to its gear, sets its channel and the "loaded from" pill', () => {
    const s = storeOn('jp2c');
    s.loadCapture(capture('Brit 1987 3').id);
    expect(s.state.value.amp).toBe('marshall-jcm800-1987');
    expect(s.state.value.loaded).toEqual({ amp: 'marshall-jcm800-1987', name: 'Brit 1987 3' });
    s.setControl(s.def.value.controls.find((c) => c.kind === 'knob')!, null, 1);
    expect(s.state.value.loaded).toBe(null);
  });
  test('a capture without settings opens its details', () => {
    const s = storeOn('jp2c');
    s.loadCapture(capture("CA John's Ch1 1").id);
    expect(s.state.value.openId).toBe(capture("CA John's Ch1 1").id);
  });
});

describe('weights', () => {
  test('edits apply to matching and reset', () => {
    const s = storeOn('marshall-jcm800-1987');
    const key = s.def.value.controls.find((c) => c.weight > 0)!.key;
    s.setWeight(key, 0);
    expect(s.def.value.controls.find((c) => c.key === key)!.weight).toBe(0);
    expect(s.baseDef.value.controls.find((c) => c.key === key)!.weight).toBeGreaterThan(0);
    s.stepWeight(key, 1);
    expect(s.def.value.controls.find((c) => c.key === key)!.weight).toBe(0.1);
    s.resetWeights();
    expect(s.state.value.weights).toEqual({});
  });
});

describe('chains and versions', () => {
  test('the chain menu lists the gear chains; picking one starts from its most downloaded capture', () => {
    const s = storeOn('bogner-uberschall-first-edition');
    const items = s.menuItems('chain');
    expect(items[0]).toMatchObject({ v: '', main: 'No pedals' });
    const bb = items.find((x) => x.main === 'BB Preamp')!;
    s.pickMenu('chain', bb.v);
    expect(s.chain.value.map((p) => p.id)).toEqual(['xotic-effects-bb-preamp']);
    s.pickMenu('chain', '');
    expect(s.chain.value).toEqual([]);
  });
  test('a pedal opens gear it is used with, with that pedal', () => {
    const s = storeOn('xotic-effects-bb-preamp');
    const amp = s.menuItems('usedin')[0]!.v;
    s.pickMenu('usedin', amp);
    expect(s.state.value.amp).toBe(amp);
    expect(s.chain.value.some((p) => p.id === 'xotic-effects-bb-preamp')).toBe(true);
  });
  test('preamp ⇄ power amp versions', () => {
    const s = storeOn('custom-audio-amplifiers-3-se-preamp');
    expect(s.menuItems('variant').map((x) => x.top)).toEqual(['Preamp only', 'With power amp']);
    expect(catalog().family(catalog().pickable('mesa-boogie-quad-preamp-mesa-boogie-2-90-simulclass'))).toEqual([]);
  });
});

describe('pickers', () => {
  test('keys browse levels and go back to the row we came from', () => {
    const s = storeOn('jp2c');
    s.openPicker('gear');
    expect(s.state.value.gearPicker.active).toBe(catalog().categories.indexOf('Amps'));
    s.pickerKey('gear', 'ArrowRight');
    expect(s.state.value.gearPicker.path).toEqual(['Amps']);
    s.pickerKey('gear', 'Enter');
    expect(s.state.value.gearPicker.path).toEqual(['Amps', 'Guitar']);
    s.pickerKey('gear', 'ArrowLeft');
    expect(s.state.value.gearPicker).toMatchObject({ path: ['Amps'], active: 1 });
    expect(s.pickerKey('gear', 'Tab')).toBe(false);
  });
});

describe('saved state', () => {
  test('the bench survives a reload; invalid values are dropped', () => {
    const storage = memoryStorage();
    const a = createStore(catalog(), { storage });
    const stop = connectPersistence(a, storage);
    a.pickAmp('marshall-jcm800-1987');
    a.setControl(a.def.value.controls.find((c) => c.key === 'volumeI')!, null, 3);
    stop();
    const b = createStore(catalog(), { storage });
    expect(b.state.value.amp).toBe('marshall-jcm800-1987');
    expect(b.settings.value.global.volumeI).toBe(3);
    const saved = JSON.parse(storage.getItem(STORE_KEY)!);
    saved.amps['marshall-jcm800-1987'].global.volumeI = 99;
    storage.setItem(STORE_KEY, JSON.stringify(saved));
    expect(createStore(catalog(), { storage }).settings.value.global.volumeI).toBe(
      catalog().pickable('marshall-jcm800-1987').defaults.global.volumeI,
    );
  });
  test('the address wins over the saved gear', () => {
    expect(createStore(catalog(), { urlAmp: 'bbe-sonic-stomp' }).state.value.amp).toBe('bbe-sonic-stomp');
    expect(createStore(catalog(), { urlAmp: 'nope' }).state.value.amp).toBe('jp2c');
  });
});

describe('ranking', () => {
  test('ranks at most every RESULTS_EVERY ms while a control moves; a new gear ranks at once', () => {
    let t = 1000;
    const timers: (() => void)[] = [];
    const clock: Clock = { now: () => t, setTimeout: (fn) => timers.push(fn), clearTimeout: vi.fn() };
    const s = storeOn('marshall-jcm800-1987');
    const { ranking, dispose } = createRanking(s, clock);
    const first = ranking.value;
    t += 10;
    s.setControl(s.def.value.controls.find((c) => c.key === 'volumeI')!, null, 0);
    expect(ranking.value).toBe(first);
    expect(timers.length).toBe(1);
    t += RESULTS_EVERY;
    timers[0]!();
    expect(ranking.value).not.toBe(first);
    s.pickAmp('jp2c');
    expect(ranking.value.def.id).toBe('jp2c');
    expect(ranking.value.list[0]!.r.status).toBe('scored');
    dispose();
  });
});
