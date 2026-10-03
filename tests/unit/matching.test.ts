// Matching (ported from the legacy tests/legacy/test_app.cjs): starting settings, scoring, coverage,
// channels, EQ, Shred, pedal chains, and every gear's scores in range.
import { describe, expect, test } from 'vitest';
import type { Capture } from '../../shared/schema';
import { captureValues, comparisonStatus, settingsSimilarity, switchValue } from '../../src/domain/similarity';
import type { GearSettings } from '../../src/domain/types';
import { CAPTURES, GEAR, capture, catalog, startScore, storeOn } from './fixtures';

const fake = (settings: object | null) => ({ settings }) as unknown as Capture;
const scoreOf = (s: ReturnType<typeof storeOn>, c: Capture, as: GearSettings = s.settings.value) => {
  const r = settingsSimilarity(c, s.def.value, as, catalog().gearById);
  return r.status === 'scored' ? r.score : r.status;
};

describe('data', () => {
  test('real captures only, unique ids, custom panels', () => {
    expect(CAPTURES.length).toBe(2190);
    expect(new Set(CAPTURES.map((c) => c.id)).size).toBe(2190);
    expect(CAPTURES.some((c) => c.name.startsWith('DEMO'))).toBe(false);
    expect(catalog().gear.filter((a) => a.panel !== 'generic').length).toBe(25);
    expect(catalog().gear.some((a) => a.id === 'marshall-jcm800-2203')).toBe(false);
  });
});

describe('JCM800 1987', () => {
  test('starting capture scores 100; changes lower it; unreadable settings are unparsed', () => {
    const s = storeOn('marshall-jcm800-1987');
    expect(catalog().capturesFor(s.def.value).length).toBe(10);
    expect(startScore(s)).toBe(100);
    s.setControl(s.def.value.controls.find((c) => c.key === 'volumeI')!, null, 0);
    expect(scoreOf(s, capture('Brit 1987 1'))).toBeLessThan(100);
    expect(scoreOf(s, fake(null))).toBe('unparsed');
    expect(scoreOf(s, fake({ values: {} }))).toBe('unparsed');
    expect(scoreOf(s, fake({ values: { volumeI: 0 } }))).toBeLessThan(60);
  });
});

describe('JP-2C', () => {
  const s = storeOn('jp2c');
  const ctrl = (k: string) => s.def.value.controls.find((c) => c.key === k)!;
  test('captures, assumed EQ and Shred', () => {
    expect(catalog().capturesFor(s.def.value).length).toBe(160);
    expect(capture("CA John's Ch1 1").settings).toBe(null);
    expect(capture('CA John Ch2 1').settings!.values.eqOn).toBe(true);
    expect(capture('CA John Ch2 1').settings!.assumed).toEqual(['eqOn']);
    expect(comparisonStatus(capture('CA John Ch3 1'), s.def.value, s.settings.value, ctrl('eq80'), 3).note).toBe('');
    expect(switchValue(ctrl('shred'), 'ch2', 2)).toBe(switchValue(ctrl('shred'), 'ch23', 2));
    expect(switchValue(ctrl('shred'), 'ch2', 3)).not.toBe(switchValue(ctrl('shred'), 'ch23', 3));
    expect(captureValues(fake({ values: {}, byChannel: { 1: { gain: 2 }, 2: { gain: 8 } } }), 1).gain).toBe(2);
    expect(captureValues(fake({ values: {}, byChannel: { 1: { gain: 2 }, 2: { gain: 8 } } }), 3).gain).toBe(undefined);
  });
  test('an unstated channel costs less than a different one; N/A is excluded from coverage', () => {
    s.setControl(ctrl('gain'), 3, 7.5);
    expect(scoreOf(s, fake({ channel: null, values: { gain: 7.5 } }))).toBeGreaterThan(
      scoreOf(s, fake({ channel: 2, values: { gain: 7.5 } })) as number,
    );
    const cov = (st: object) => {
      const r = settingsSimilarity(fake(st), s.def.value, s.settings.value, catalog().gearById);
      return r.status === 'scored' ? r.coverage : 0;
    };
    expect(cov({ channel: 3, values: { gain: 7.5 }, notApplicable: [{ key: 'treble', channel: 3 }] })).toBeGreaterThan(
      cov({ channel: 3, values: { gain: 7.5 } }),
    );
  });
});

describe('TriAxis', () => {
  test('modes are channels; lead drives count only in their modes', () => {
    const s = storeOn('mesa-boogie-triaxis-preamp');
    expect(
      catalog()
        .capturesFor(s.def.value)
        .map((c) => c.settings!.channel)
        .join(),
    ).toBe('1,2,3,4,5,6,7,8');
    expect(startScore(s)).toBe(100);
    expect(scoreOf(s, capture('CA 3Axe 2'))).toBeLessThan(60);
    s.setChannel(5);
    const r = settingsSimilarity(capture('CA 3Axe 5'), s.def.value, s.settings.value, catalog().gearById);
    expect(r.status === 'scored' && r.reasons[0]!.kind).toBe('match');
    s.pickAmp('mesa-boogie-triaxis-preamp-mesa-boogie-2-90-simulclass');
    expect(startScore(s)).toBe(100);
    expect(capture('CA 3Axe+290 1').settings!.values.presence).toBe(3.5);
    expect(capture('CA 3Axe+290 1').settings!.values.powerPresence).toBe(0);
  });
});

describe('custom pedals and heads', () => {
  test.each([
    'aguilar-tone-hammer-500',
    'ibanez-ts9-tube-screamer',
    'origin-effects-cali76',
    'neural-dsp-darkglass-ultra',
    'neural-dsp-darkglass-ultimate',
    'bogner-ecstasy-100b',
    'bogner-ecstasy-100b-power-amp-section',
    'mesa-boogie-mark2c',
    'mesa-boogie-mark3-red-stripe',
    'fender-hot-rod-deluxe',
    'fender-hot-rod-deluxe-power-amp-section',
    'bogner-fish-preamp',
    'bogner-fish-preamp-mesa-boogie-2-ninety-simul-class',
    'bogner-uberschall-first-edition',
    'paul-reed-smith-mt15',
    'bbe-sonic-stomp',
    'orange-thunderverb-50',
    'custom-audio-amplifiers-3-se-preamp',
    'custom-audio-amplifiers-3-se-preamp-mesa-boogie-2-90-simulclass',
  ])('%s: the starting capture scores 100', (id) => {
    expect(startScore(storeOn(id))).toBe(100);
  });
  test('the Ecstasy preamp section starts from a capture that never states Gain Lo/Hi', () => {
    expect(startScore(storeOn('bogner-ecstasy-100b-preamp-section'))).toBe(90);
  });
  test('Cali76: Dry is not matched', () => {
    const s = storeOn('origin-effects-cali76');
    s.setControl(s.def.value.controls.find((c) => c.key === 'dry')!, null, 7);
    expect(startScore(s)).toBe(100);
  });
  test('Mark IIC+: loading a capture scores it 100', () => {
    const s = storeOn('mesa-boogie-mark2c');
    s.loadCapture(capture('CA MkCC+ 3').id);
    expect(scoreOf(s, capture('CA MkCC+ 3'))).toBe(100);
  });
});

describe('pedal chains', () => {
  test('the chain is part of the score', () => {
    const s = storeOn('bogner-uberschall-first-edition');
    s.loadCapture(capture('Bogna Uber 3').id);
    const c = capture('Bogna Uber 3');
    expect(scoreOf(s, c)).toBe(100);
    expect(scoreOf(s, c, { ...s.settings.value, chain: [] })).toBe(60); // no pedal on your side: at most partial
    const r = settingsSimilarity(c, s.def.value, s.settings.value, catalog().gearById);
    expect(r.status === 'scored' && r.reasons.some((x) => /Same pedal · /.test(x.text))).toBe(true);
    s.setPedalControl(0, 'gain', 10);
    expect(s.chain.value[0]!.values!.gain).toBe(10);
    expect(scoreOf(s, c)).toBeLessThan(100); // the pedal's knobs count too
  });
  test('chain-only pedals stay out of the pickers', () => {
    expect(catalog().gear.some((d) => d.chainOnly)).toBe(false);
    expect(catalog().gearById('boss-sd-1')?.chainOnly).toBe(true);
    expect(catalog().gearById('boss-ge-7')?.panel).toBe('ge7');
  });
});

describe('unmapped library and every gear', () => {
  test('the library lists only unmapped captures, never scored', () => {
    const s = storeOn('unmapped');
    const caps = catalog().capturesFor(s.def.value);
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => !c.ampId)).toBe(true);
    expect(
      caps.every((c) => settingsSimilarity(c, s.def.value, s.settings.value, catalog().gearById).status === 'unparsed'),
    ).toBe(true);
  });
  test('every gear scores its captures with integers from 0 to 100', () => {
    for (const amp of GEAR.filter((d) => !d.chainOnly)) {
      const s = storeOn(amp.id);
      for (const c of catalog().capturesFor(s.def.value)) {
        const r = settingsSimilarity(c, s.def.value, s.settings.value, catalog().gearById);
        if (r.status === 'scored')
          expect(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, amp.id).toBe(true);
      }
    }
  });
});
