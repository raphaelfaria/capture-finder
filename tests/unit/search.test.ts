// Fuzzy search in both pickers (ported from the legacy tests): across punctuation, letters in order,
// typos; exact matches first, and typo matches only when nothing matches properly.
import { describe, expect, test } from 'vitest';
import { captureEntries, gearEntries } from '../../src/data/pickers';
import { catalog } from './fixtures';

const gearFor = (q: string) => gearEntries(catalog(), [], q).map((e) => (e.kind === 'amp' ? e.a.id : ''));
const capsFor = (q: string) => captureEntries(catalog(), [], q).map((e) => (e.kind === 'cap' ? e.e.c.name.trim() : ''));

describe('gear search', () => {
  test('punctuation, typos and letters in order', () => {
    expect(gearFor('jp2c')[0]).toBe('jp2c');
    expect(gearFor('ecstacy')[0]).toBe('bogner-ecstasy-100b');
    expect(gearFor('ecsty')[0]).toBe('bogner-ecstasy-100b');
    expect(gearFor('trixis')).toContain('mesa-boogie-triaxis-preamp');
    expect(gearFor('marshal 1987')[0]).toBe('marshall-jcm800-1987');
    expect(gearFor('tube scremer')[0]).toBe('ibanez-ts9-tube-screamer');
    expect(gearFor('mark 3')).toEqual(['mesa-boogie-mark3-red-stripe', 'markbass-little-mark-iii']);
    expect(gearFor('qqqqzz')).toEqual([]);
  });
  test.each(['mkiic+', 'mk2c', 'markiic', 'mk iic'])('shorthand %s finds the Mark IIC+', (q) => {
    expect(gearFor(q)[0]).toBe('mesa-boogie-mark2c');
  });
  test('Roman numerals', () => {
    expect(gearFor('mkiii')[0]).toBe('mesa-boogie-mark3-red-stripe');
  });
});

describe('capture search', () => {
  test('words match whole tokens; exact names come first', () => {
    expect(capsFor('bogna ch2').length).toBe(47); // "ch2" doesn't match "Ch1 2"
    expect(capsFor("CA John's Ch1 1")[0]).toBe("CA John's Ch1 1");
    expect(capsFor('brit 1987 2')).toEqual(['Brit 1987 2']);
    expect(capsFor('hrdlx cha').length).toBe(34);
  });
});

describe('browsing levels', () => {
  test('gear: categories, then instruments, then gear', () => {
    const top = gearEntries(catalog(), [], '');
    expect(top.filter((e) => e.kind === 'drill').length).toBe(catalog().categories.length);
    expect(top.at(-1)).toMatchObject({ kind: 'amp', a: { id: 'unmapped' } });
    const inst = gearEntries(catalog(), ['Amps'], '');
    expect(inst[0]!.kind).toBe('back');
    expect(inst.slice(1).map((e) => (e.kind === 'drill' ? e.key : ''))).toEqual(['Guitar', 'Bass', 'Other']);
    const amps = gearEntries(catalog(), ['Amps', 'Guitar'], '');
    expect(amps.length).toBeGreaterThan(20);
    expect(
      amps
        .slice(1)
        .every(
          (e) =>
            e.kind === 'amp' && catalog().gearCategory(e.a) === 'Amps' && catalog().gearInstrument(e.a) === 'Guitar',
        ),
    ).toBe(true);
  });
  test('captures: a gear level lists its captures', () => {
    const gear = captureEntries(catalog(), ['Amps', 'Guitar'], '');
    const jp = gear.find((e) => e.kind === 'drill' && e.key === 'jp2c');
    expect(jp && jp.kind === 'drill' && jp.label).toBe('CA John');
    expect(captureEntries(catalog(), ['Amps', 'Guitar', 'jp2c'], '').length).toBe(161);
  });
  test('device names come from capture names', () => {
    expect(catalog().deviceName(catalog().pickable('jp2c'))).toBe('CA John');
    expect(catalog().deviceName(catalog().pickable('bogner-ecstasy-100b'))).toBe('Bogna X100B');
  });
});
