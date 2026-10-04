// Generic layout heuristics (ported from the legacy tests): signal-flow knob order, switches next to the
// knob they relate to, one knob row when it fits, switches up to three rows tall.
import { describe, expect, test } from 'vitest';
import type { Control } from '../../shared/schema';
import { available } from '../../src/domain/controls';
import {
  gOrder,
  gRelated,
  gSecLayout,
  gSwitchBlock,
  gSwitchOrder,
  layoutWidth,
} from '../../src/ui/panels/generic/layout';
import { catalog } from './fixtures';

const labels = (list: { label: string }[]) => list.map((c) => c.label).join(',');
const lab = (...ls: string[]) => ls.map((label) => ({ label }));

describe('knob order', () => {
  test('gain stages, tone stack bass → treble, presence-type, others, output last', () => {
    const sigx = catalog().pickable('fryette-sigx');
    expect(labels(gOrder(sigx.controls.filter((c) => c.kind === 'knob' && available(c, 1))))).toBe(
      'Gain 1,Gain 2,Bass,Middle,Treble,Presence,Depth,Master',
    );
    expect(
      labels(
        gOrder(
          catalog()
            .pickable('ada-mp-1-preamp')
            .controls.filter((c) => c.kind === 'knob'),
        ),
      ),
    ).toBe('Overdrive 1,Overdrive 2,Bass,Mid,Treble,Presence,Program no,Master Gain');
  });
  test('"Volume" is the gain stage without a gain knob, the output level after one', () => {
    expect(labels(gOrder(lab('Treble', 'Volume', 'Bass')))).toBe('Volume,Bass,Treble');
    expect(labels(gOrder(lab('Volume', 'Treble', 'Gain')))).toBe('Gain,Treble,Volume');
    expect(labels(gOrder(lab('Gain2', 'Treble', 'Gain1')))).toBe('Gain1,Gain2,Treble');
  });
  test('channels run clean → lead', () => {
    expect(
      catalog()
        .pickable('fryette-sigx')
        .channels!.map((c) => c.name),
    ).toEqual(['Rhythm', 'Lead']);
    expect(
      catalog()
        .pickable('peavey-5150-signature')
        .channels!.map((c) => c.name),
    ).toEqual(['Rhythm', 'Lead']);
  });
});

describe('switches', () => {
  const d = catalog().pickable('fryette-sigx');
  const knobs = gOrder(d.controls.filter((c) => c.kind === 'knob' && available(c, 1)));
  const rel = (l: string) => {
    const r = gRelated(d.controls.find((c) => c.label === l)!, knobs);
    return r.k < 0 ? null : knobs[r.k]!.label;
  };
  test('relate to knobs by a shared word, else by a usual pairing', () => {
    expect(rel('Gain More/Less')).toBe('Gain 1');
    expect(rel('Scoop/Wood')).toBe('Middle');
    expect(rel('Power Shift')).toBe('Master');
    expect(rel('CH Mode')).toBe(null);
  });
  test('unrelated first, then in the order of their knobs', () => {
    expect(
      labels(
        gSwitchOrder(
          d.controls.filter((c): c is Extract<Control, { kind: 'switch' }> => c.kind === 'switch'),
          knobs,
        ),
      ),
    ).toBe('CH Mode,Boost,Gain More/Less,Scoop/Wood,Power Shift');
  });
  test('up to three rows tall', () => {
    expect(gSwitchBlock([60, 60, 60, 60, 60, 60, 60]).rows).toBe(3);
  });
});

describe('section layout', () => {
  const s = { head: true, knobs: [1, 2, 3, 4, 5, 6, 7], swW: [90, 70], faders: [] };
  test('one knob row when it fits next to the switches, else two', () => {
    expect(gSecLayout(s, 1000).rows).toBe(1);
    expect(gSecLayout(s, 500).rows).toBe(2);
    expect(gSecLayout(s, 500).wrapped).toBe(false);
  });
  test('room for the panel: unmeasured 1100px; beside pedals when there is room', () => {
    expect(layoutWidth(null, 0, false)).toBe(1100);
    expect(layoutWidth(1280, 0, false)).toBe(1280 - 48 - 112 - 46);
    expect(layoutWidth(1280, 300, true)).toBe(1280 - 48 - 68 - 300 - 46 - 46);
    expect(layoutWidth(900, 400, true)).toBe(900 - 48 - 112 - 46); // too narrow beside the pedals
  });
});
