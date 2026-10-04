// Unit tests for tools/build-data (vitest). Uses the real data/custom-amps.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import type { GearDef } from '../../../shared/schema';
import { SOURCE_DIR } from '../../../tools/lib/paths';
import {
  ampIdentity,
  brandInfo,
  channelsFromDescription,
  inferAmp,
  parseSettings,
  settingLines,
  sourceAmpName,
  toCapture,
  channelOrder,
  downloadDefaults,
  pedalBlocks,
} from '../../../tools/build-data';

const CUSTOMS: GearDef[] = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'custom-amps.json'), 'utf8'));
const CUSTOM = Object.fromEntries(CUSTOMS.map((d) => [d.id, d]));
const row = (description = '', { name = 'Capture', kind = 'amp_head', tags = [] } = {}) => ({
  capture_id: 'test',
  name,
  type_code: kind,
  description,
  tags,
});

test('JP-2C parses numbers, switches and N/A; unstated EQ on/off is assumed on and marked', () => {
  const [parsed, rejected] = parseSettings(
    row(
      'This is a capture of Mesa Boogie® JP2C® amp channel 2.\nSettings:\nGain: 5.5\nPull Gain: OFF\nPull Presence: ON\n80Hz: 7\nMaster: N/A\nShred: MD',
    ),
    CUSTOM.jp2c,
  );
  assert.equal(parsed.channel, 2);
  assert.equal(parsed.values.gain, 5.5);
  assert.equal(parsed.values.pullGain, false);
  assert.equal(parsed.values.pullPres, true);
  assert.equal(parsed.values.shred, 'off');
  assert.equal(parsed.values.eqOn, true);
  assert.deepEqual(parsed.assumed, ['eqOn']);
  assert.ok(!('master' in parsed.values));
  assert.deepEqual(parsed.notApplicable, [{ key: 'master', channel: 2 }]);
  assert.deepEqual(rejected, []);
});

test('a stated value wins over an assumption; unreadable captures get nothing assumed', () => {
  const [parsed] = parseSettings(row('Settings:\nChannel: 2\nGain: 5\nEQ: Off'), CUSTOM.jp2c);
  assert.equal(parsed.values.eqOn, false);
  assert.equal(parsed.assumed, undefined);
  assert.equal(parseSettings(row('Nothing readable here'), CUSTOM.jp2c)[0], null);
});

test('JP-2C label and value spellings come from aliases in custom-amps.json', () => {
  const [parsed] = parseSettings(row('Settings:\nChannel: 3\n240: 5\nPull Press: ON\nShred Mode: 2+3'), CUSTOM.jp2c);
  assert.equal(parsed.values.eq240, 5);
  assert.equal(parsed.values.pullPres, true);
  assert.equal(parsed.values.shred, 'ch23');
  assert.equal(parseSettings(row('Settings:\nChannel: 2\nShred: Shred 2'), CUSTOM.jp2c)[0].values.shred, 'ch2');
});

test('JCM800 1987 identity, inputs and patch routes; pedal controls are excluded', () => {
  const r = row(
    'Captured Devices: Marshall® JCM800® 1987, Boss® SD-1®\nSettings:\nInput: 2 High\nPatchcable: 2 Low to 1 Low\nVolume II: 1.5\nVolume I: 1.8\nTreble: 7.5\n\nBoss® SD-1®\nSettings:\nLevel: 10\nGain: 2\nTone: 8',
  );
  assert.equal(ampIdentity(r, CUSTOMS).id, 'marshall-jcm800-1987');
  const [settings, rejected] = parseSettings(r, CUSTOM['marshall-jcm800-1987']);
  assert.equal(settings.values.volumeI, 1.8);
  assert.equal(settings.values.patchcable, '2 Low to 1 Low');
  assert.ok(!('gain' in settings.values));
  assert.deepEqual(rejected, []);
});

test('missing descriptions can map by custom tags/name rules but never get settings', () => {
  assert.equal(ampIdentity(row('', { tags: ['JP2C', 'Mesa'] }), CUSTOMS).id, 'jp2c');
  assert.equal(ampIdentity(row('', { name: "CA John's Ch1 1" }), CUSTOMS).source, 'capture-family/tags');
  assert.equal(parseSettings(row('', { tags: ['JP2C'] }), CUSTOM.jp2c)[0], null);
});

test('TriAxis: the one non-N/A RHY/LD1/LD2 row is the mode; SW N/A is ignored', () => {
  const [parsed, rejected] = parseSettings(
    row(
      'This is a capture of Mesa Boogie® Triaxis® preamp.\nSettings:\nRHY: N/A\nLD1: Red\nLD2: N/A\nSW: N/A\nGain: 6\nLead1 Drive: 6\nLead2 Drive: N/A',
    ),
    CUSTOM['mesa-boogie-triaxis-preamp'],
  );
  assert.equal(parsed.channel, 5);
  assert.equal(parsed.values.lead1drive, 6);
  assert.deepEqual(parsed.notApplicable, [{ key: 'lead2drive', channel: null }]);
  assert.deepEqual(rejected, []);
  const [, conflict] = parseSettings(
    row('Settings:\nRHY: Green\nLD1: Red\nGain: 5'),
    CUSTOM['mesa-boogie-triaxis-preamp'],
  );
  assert.ok(conflict.some((l) => l.includes('Conflicting RHY/LD1/LD2')));
});

test('TriAxis + 2:90: rows after "Simul-Class 2" are the power amp; Presence is renamed, not conflicted', () => {
  const [parsed, rejected] = parseSettings(
    row(
      'Settings:\nRHY: Yellow\nGain: 6\nPresence: 3.5\nSimul-Class 2: Ninety\nLevel: 5.5\nPresence: 0\nDeep: ON\n1/2 Drive: Off',
    ),
    CUSTOM['mesa-boogie-triaxis-preamp-mesa-boogie-2-90-simulclass'],
  );
  assert.equal(parsed.channel, 2);
  assert.equal(parsed.values.presence, 3.5);
  assert.equal(parsed.values.powerPresence, 0);
  assert.equal(parsed.values.halfDrive, false);
  assert.deepEqual(rejected, []);
});

test('ambiguous model is not mapped by manufacturer alone', () => {
  assert.equal(ampIdentity(row('', { tags: ['Mesa', 'Boogie'] }), CUSTOMS), null);
  assert.equal(
    ampIdentity(row('This is a capture of Mesa Boogie® M6 Carbine® amp.\nAmp: Big Block 750®\nGain: 6'), CUSTOMS),
    null,
  );
});

test('conflicting values are rejected instead of the last one winning', () => {
  const [parsed, rejected] = parseSettings(row('Settings:\nChannel: 2\nGain: 4\nGain: 8\nTreble: 6'), CUSTOM.jp2c);
  assert.ok(!('gain' in parsed.values));
  assert.equal(parsed.values.treble, 6);
  assert.ok(rejected.some((l) => l.includes('Conflicting')));
});

test('out-of-range numbers and unknown switch values are not clamped or guessed', () => {
  const [parsed, rejected] = parseSettings(row('Settings:\nChannel: 2\nGain: 200\nShred: Shred 2x'), CUSTOM.jp2c);
  assert.equal(parsed, null);
  assert.equal(rejected.length, 2);
});

test('multiple channels retain separate values', () => {
  const [parsed] = parseSettings(row('Settings:\nChannel: 1\nGain: 2\nTreble: 3\nChannel: 2\nGain: 8'), CUSTOM.jp2c);
  assert.equal(parsed.channel, null);
  assert.equal(parsed.byChannel[1].gain, 2);
  assert.equal(parsed.byChannel[2].gain, 8);
  assert.ok(!('treble' in parsed.byChannel[2]));
  assert.deepEqual(parsed.values, { eqOn: true }); // only the shared assumption; it applies to every channel
});

test('a graphic EQ value is not mistaken for a section heading', () => {
  const [entries] = settingLines(
    row('Captured Device: Ampeg® SVT-2® Pro\nSettings:\nGain: 3.5\nGraphic EQ: on\n40:0\n1kHz: 2'),
  );
  assert.deepEqual(
    entries.map((e) => e.label),
    ['Gain', 'Graphic EQ', '40', '1kHz'],
  );
});

test('generic amps keep the recorded channel number and negative ranges', () => {
  const r = row('Settings:\nChannel: 3\nGain: 7\nMid: -4');
  const definition = inferAmp({ id: 'test', brand: 'Test', model: 'Test', source: 'test' }, [r]);
  assert.equal(definition.channels[0].n, 3);
  const [parsed] = parseSettings(r, definition);
  assert.equal(parsed.channel, 3);
  assert.equal(parsed.values.mid, -4);
  assert.equal((definition.controls as any[]).find((c) => c.key === 'mid').min, -4);
});

test('one label used for a knob and a switch becomes two controls, and each line goes to the right one', () => {
  const rows = [
    row('Settings:\nCH: 2\nGain: 9\nAir: Lo\nGain: Lo\nPre. EQ: Dark'),
    row('Settings:\nCH: 1\nGain: 6\nPre. EQ: Neutral'),
    row('Settings:\nCH: 2\nGain: 4\nGain: Hi\nPre. EQ: Mid'),
  ];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X', source: 'test' }, rows);
  const gain = (def.controls as any[]).filter((c) => c.aliases.includes('Gain'));
  assert.deepEqual(
    gain.map((c) => [c.key, c.kind, c.label]),
    [
      ['gain', 'knob', 'Gain'],
      ['gain_lohi', 'switch', 'Gain (Lo/Hi)'],
    ],
  );
  assert.deepEqual(gain[1].channels, [2]);
  const [parsed, rejected] = parseSettings(rows[0], def);
  assert.equal(parsed.values.gain, 9);
  assert.equal(parsed.values.gain_lohi, 'Lo');
  assert.deepEqual(rejected, []);
  // Channels keep their own switch positions.
  assert.deepEqual((def.controls as any[]).find((c) => c.key === 'preeq').channelOptions, {
    1: ['Neutral'],
    2: ['Dark', 'Mid'],
  });
  assert.equal(def.defaults.ch['1'].preeq, 'Neutral');
});

test('text values seen together in one capture are different switches; on/off and numbers repeated in one capture are numbered', () => {
  const rows = [
    row('Settings:\nCH: 3\nGain: 4.5\nGain: Lead\nGain: Lo'),
    row('Settings:\nCH: 3\nGain: 3.5\nGain: Plexi'),
    row('Settings:\nCH: 3\nGain: 6\nGain: Hi\nGain: Lead'),
  ];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X', source: 'test' }, rows);
  assert.deepEqual(
    (def.controls as any[])
      .filter((c) => c.kind === 'switch')
      .map((c) => c.options.map((o) => o.v))
      .sort(),
    [
      ['Lead', 'Plexi'],
      ['Lo', 'Hi'],
    ].sort(),
  );
  const [parsed, rejected] = parseSettings(rows[0], def);
  assert.deepEqual([parsed.values.gain, parsed.values.gain_leadplexi, parsed.values.gain_lohi], [4.5, 'Lead', 'Lo']);
  assert.deepEqual(rejected, []);
  const twice = [
    row('Settings:\nVolume: 7.8\nPull Bright: OFF\nMaster: 4\nPull Bright: ON'),
    row('AMP:\nVolume: 6.4\nBass: 8\nVolume: 6'),
  ];
  const d2 = inferAmp({ id: 'y', brand: 'Y', model: 'Y', source: 'test' }, twice);
  assert.deepEqual(
    (d2.controls as any[]).map((c) => c.key).filter((k) => /pullbright|volume/.test(k)),
    ['volume_1', 'volume_2', 'pullbright_1', 'pullbright_2'],
  );
  const [p2, r2] = parseSettings(twice[0], d2);
  assert.deepEqual([p2.values.pullbright_1, p2.values.pullbright_2], [false, true]);
  assert.deepEqual(r2, []);
});

test('value aliases map other spellings onto one switch value before inference and parsing', () => {
  const rows = [
    row('Settings:\nCH: 2\nPre. EQ: Dark'),
    row('Settings:\nCH: 2\nPre. EQ: Normal'),
    row('Settings:\nCH: 2\nPre. EQ: Middle'),
    row('Settings:\nCH: 2\nPre. EQ: Mid'),
  ];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X', source: 'test' }, rows, {
    'Pre. EQ': { Normal: 'Mid', Middle: 'Mid' },
  });
  assert.deepEqual(
    (def.controls as any[]).find((c) => c.key === 'preeq').options.map((o) => o.v),
    ['Dark', 'Mid'],
  );
  assert.equal(parseSettings(rows[1], def)[0].values.preeq, 'Mid');
  assert.equal(parseSettings(rows[2], def)[0].values.preeq, 'Mid');
});

test('pedal + amp chains use the amp identity; pedals get their own gear identity', () => {
  const identity = ampIdentity(
    row('This is a capture of Proco® Rat® distortion pedal with Ampeg® V-4B® amp.'),
    CUSTOMS,
  );
  assert.equal(identity.brand, 'Ampeg');
  assert.equal(identity.model, 'V-4B');
  assert.deepEqual(
    ampIdentity(row('This is a capture of Ibanez® TS9 Tube Screamer® pedal.', { kind: 'pedal' }), CUSTOMS),
    { id: 'ibanez-ts9-tube-screamer', brand: 'Ibanez', model: 'TS9 Tube Screamer', source: 'description' },
  );
  assert.deepEqual(ampIdentity(row('Captured Device: Unsound Circuitry’s Hyper Pozzum', { kind: 'fuzz' }), CUSTOMS), {
    id: 'unsound-circuitry-hyper-pozzum',
    brand: 'Unsound Circuitry',
    model: 'Hyper Pozzum',
    source: 'description',
  });
  // Without a described source, only amp captures are identified (from tags/name rules).
  assert.equal(ampIdentity(row('', { kind: 'pedal', tags: ['JP2C'] }), CUSTOMS), null);
});

test('source names, brands and channels from descriptions', () => {
  assert.equal(
    sourceAmpName('Captured Devices: Mesa® Boogie® Bass 400®, Origin Effects® Cali76®'),
    'Mesa® Boogie® Bass 400®',
  );
  assert.deepEqual(brandInfo('Mesa® Boogie® Bass 400®'), ['Mesa/Boogie', 'Mesa Boogie']);
  assert.deepEqual(brandInfo('Archetype: Tom Morello by Neural DSP®'), ['Neural DSP', '']);
  assert.equal(sourceAmpName('Full rig Capture from Bogna X 101B Ch.2 with a cabinet.'), 'Bogna X 101B');
  assert.deepEqual(
    channelsFromDescription(
      'This is a capture of Hermansson® modded Hiwatt® Custom PA100® amp’s Jose channel preamp section.',
    ),
    ['Jose'],
  );
  assert.deepEqual(
    channelsFromDescription('Captured Device: Fryette® Pittbull Fifty/CL®\nSettings:\nRed Channel\nBoost: Engaged'),
    ['Red'],
  );
});

test('app capture records keep the raw API fields they need', () => {
  const c = toCapture(
    {
      productId: 'p1',
      name: 'Blue',
      hash: 'h',
      authorUsername: 'NeuralDSP',
      published: true,
      likes: 3,
      stars: 0,
      downloads: 163,
      type: 'neural_capture',
      creatorType: 'quad',
      metadata: { instrumentType: 'guitar', deviceType: 'amp_combo', gainType: 2, version: '2' },
      tags: ['x'],
    },
    null,
    null,
  );
  assert.deepEqual(
    [c.id, c.deviceType, c.instrument, c.gainType, c.captureType, c.likes, c.published, c.settings],
    ['p1', 'Amp Combo', 'Guitar', '2', 'Neural Capture V2', 3, true, null],
  );
  assert.deepEqual(c.tags, ['x']);
  assert.ok('description' in c);
});

test('generic channels run from clean to high gain; explicit numbers and letters win', () => {
  const order = (names) => [...names].sort(channelOrder);
  assert.deepEqual(order(['Lead', 'Rhythm']), ['Rhythm', 'Lead']);
  assert.deepEqual(order(['Lead', 'Crunch', 'Clean']), ['Clean', 'Crunch', 'Lead']);
  assert.deepEqual(order(['Modern', 'Vintage']), ['Vintage', 'Modern']);
  assert.deepEqual(order(['Red', 'Blue', 'Green', 'Purple']), ['Green', 'Blue', 'Red', 'Purple']);
  assert.deepEqual(order(['Shark', 'Brown', 'Strato', 'Clean']), ['Clean', 'Brown', 'Shark', 'Strato']); // unknown names between rhythm and lead
  assert.deepEqual(order(['Lead 2', 'Lead 1', 'Clean']), ['Clean', 'Lead 1', 'Lead 2']);
  assert.deepEqual(order(['VH', '1959', 'Clean']), ['Clean', '1959', 'VH']); // a year is a name, not a number
  assert.deepEqual(order(['3 Lead', '1 Clean', '2 Crunch']), ['1 Clean', '2 Crunch', '3 Lead']);
  assert.deepEqual(order(['2', '10', '1']), ['1', '2', '10']);
  assert.deepEqual(order(['B', 'A']), ['A', 'B']);
});

test('parse.readOn keeps reading past a named device header (paired with sections)', () => {
  const d =
    'This is a capture of Bogner® Fish Preamp® with Mesa Boogie® 2:Ninety® power amp.\n\nSettings:\nChannel: Clean\nVolume: 5\nPresence: 3\n\nPower amp: Mesa Boogie® 2:Ninety Simul-Class®\nPresence: 2.5\nDeep: ON';
  assert.deepEqual(
    settingLines(row(d))[0].map((e) => e.label),
    ['Volume', 'Presence'],
  ); // the ® header ends the block by default
  assert.deepEqual(
    settingLines(row(d), ['Power amp'])[0].map((e) => e.label),
    ['Volume', 'Presence', 'Power amp', 'Presence', 'Deep'],
  );
  const def = {
    id: 'x',
    channels: [{ n: 1, name: 'Clean', aliases: ['Clean'] }],
    parse: { readOn: ['Power amp'], sections: [{ startsAt: 'Power amp', rename: { Presence: 'Power Presence' } }] },
    controls: [
      { key: 'volume', label: 'Volume', kind: 'knob', scope: 'global', min: 0, max: 10, step: 0.1, weight: 1 },
      { key: 'presence', label: 'Presence', kind: 'knob', scope: 'global', min: 0, max: 10, step: 0.1, weight: 1 },
      { key: 'pp', label: 'Power Presence', kind: 'knob', scope: 'global', min: 0, max: 10, step: 0.1, weight: 1 },
      {
        key: 'deep',
        label: 'Deep',
        kind: 'switch',
        scope: 'global',
        weight: 1,
        options: [
          { v: true, label: 'ON' },
          { v: false, label: 'OFF' },
        ],
      },
    ],
  };
  const [s, rejected] = parseSettings(row(d), def as any);
  assert.deepEqual([s.values.volume, s.values.presence, s.values.pp, s.values.deep, rejected], [5, 3, 2.5, true, []]);
});

test('starting settings: each channel from its most downloaded capture, gaps from the next one', () => {
  const def = {
    channels: [
      { n: 1, name: 'Clean' },
      { n: 2, name: 'Lead' },
    ],
    controls: [
      { key: 'gain', kind: 'knob', scope: 'channel', min: 0, max: 10, step: 0.1 },
      { key: 'boost', kind: 'switch', scope: 'channel', options: [{ v: true }, { v: false }] },
      { key: 'master', kind: 'knob', scope: 'global', min: 0, max: 10, step: 0.1 },
    ],
    defaults: { channel: 1, ch: { 1: { gain: 5, boost: false }, 2: { gain: 5, boost: false } }, global: { master: 5 } },
  };
  const cap = (name, downloads, channel, values) => ({ name, downloads, settings: { channel, values } });
  const caps = [
    cap('Clean 1', 10, 1, { gain: 2, master: 3 }),
    cap('Clean 2', 50, 1, { gain: 3 }),
    cap('Lead 1', 90, 2, { gain: 8, master: 7 }),
    cap('Lead 2', 20, 2, { gain: 9, boost: true }),
    cap('Broken', 999, 1, null),
  ];
  caps[4].settings = null;
  const { defaults, from } = downloadDefaults(def as any, caps as any);
  assert.equal(defaults.channel, 2); // the channel of the most downloaded capture
  assert.deepEqual(defaults.ch[1], { gain: 3, boost: false }); // Clean 2 (50) beats Clean 1 (10); boost never stated: kept
  assert.deepEqual(defaults.ch[2], { gain: 8, boost: true }); // Lead 1, with boost from the next most downloaded Lead capture
  assert.equal(defaults.global.master, 7); // shared controls from the starting channel's captures
  assert.deepEqual(
    from.map((f) => f.name),
    ['Clean 2', 'Lead 1'],
  );
});

test('pedal blocks: the pedals in front, in order, each with its rows', () => {
  const d =
    'This is a capture of X® amp.\n\nSettings:\nGain: 5\n\nPedal1: Boss® SD-1®\nLevel: 10\nDrive 1.5\n\nPedal2: Boss® GE-7®\n100Hz: 0dB\nPower amp: Mesa® 2:90®\nLevel: 3';
  assert.deepEqual(
    pedalBlocks(d).map((b) => [b.n, b.name, b.source, b.rows]),
    [
      [1, 'Boss SD-1', 'Boss® SD-1®', ['Level: 10', 'Drive 1.5']],
      [2, 'Boss GE-7', 'Boss® GE-7®', ['100Hz: 0dB']],
    ],
  );
  assert.deepEqual(pedalBlocks('Settings:\nGain: 5'), []);
});

test('an N/A line among same-label controls fills the next unused one, whatever its channel', () => {
  const def = {
    id: 'x',
    channels: [
      { n: 1, name: 'Clean', aliases: ['Clean'] },
      { n: 2, name: 'Lead', aliases: ['Lead'] },
    ],
    controls: [
      {
        key: 'cleanbass',
        label: 'CLEAN BASS',
        aliases: ['Bass'],
        kind: 'knob',
        scope: 'global',
        channels: [1],
        min: 0,
        max: 10,
        step: 0.1,
        weight: 1,
      },
      {
        key: 'leadbass',
        label: 'LEAD BASS',
        aliases: ['Bass'],
        kind: 'knob',
        scope: 'global',
        channels: [2],
        min: 0,
        max: 10,
        step: 0.1,
        weight: 1,
      },
    ],
  };
  const [lead] = parseSettings(row('Settings:\nChannel: Lead\nBass: N/A\nBass: 8'), def as any);
  assert.deepEqual([lead.values, lead.notApplicable.map((x) => x.key)], [{ leadbass: 8 }, ['cleanbass']]);
  const [clean] = parseSettings(row('Settings:\nChannel: Clean\nBass: 6\nBass: N/A'), def as any);
  assert.deepEqual(clean.values, { cleanbass: 6 }); // the lead knob's N/A neither steals the value nor marks the clean knob
});

test('a pedal block ending with "In efx loop" is in the effects loop', () => {
  const d =
    'Settings:\nGain: 5\nPedal1: Xotic Effects® BB-Preamp®\nGain: 1\nPedal2: BBE® Sonic Stomp®\nProcess: 0\nIn efx loop';
  assert.deepEqual(
    pedalBlocks(d).map((x) => [x.name, x.rows, !!x.loop]),
    [
      ['Xotic Effects BB-Preamp', ['Gain: 1'], false],
      ['BBE Sonic Stomp', ['Process: 0'], true],
    ],
  );
});
