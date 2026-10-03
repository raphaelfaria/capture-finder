// Unit tests for tools/build-data.mjs (node --test). Uses the real data/custom-amps.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT, ampIdentity, brandInfo, channelsFromDescription, inferAmp, parseSettings, settingLines, sourceAmpName, toCapture } from '../build-data.mjs';

const CUSTOMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/custom-amps.json'), 'utf8'));
const CUSTOM = Object.fromEntries(CUSTOMS.map((d) => [d.id, d]));
const row = (description = '', { name = 'Capture', kind = 'amp_head', tags = [] } = {}) => ({ capture_id: 'test', name, type_code: kind, description, tags });

test('JP-2C parses numbers, switches and N/A; unstated EQ on/off is assumed on and marked', () => {
  const [parsed, rejected] = parseSettings(row('This is a capture of Mesa Boogie® JP2C® amp channel 2.\nSettings:\nGain: 5.5\nPull Gain: OFF\nPull Presence: ON\n80Hz: 7\nMaster: N/A\nShred: MD'), CUSTOM.jp2c);
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
  const r = row('Captured Devices: Marshall® JCM800® 1987, Boss® SD-1®\nSettings:\nInput: 2 High\nPatchcable: 2 Low to 1 Low\nVolume II: 1.5\nVolume I: 1.8\nTreble: 7.5\n\nBoss® SD-1®\nSettings:\nLevel: 10\nGain: 2\nTone: 8');
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
  const [parsed, rejected] = parseSettings(row('This is a capture of Mesa Boogie® Triaxis® preamp.\nSettings:\nRHY: N/A\nLD1: Red\nLD2: N/A\nSW: N/A\nGain: 6\nLead1 Drive: 6\nLead2 Drive: N/A'), CUSTOM['mesa-boogie-triaxis-preamp']);
  assert.equal(parsed.channel, 5);
  assert.equal(parsed.values.lead1drive, 6);
  assert.deepEqual(parsed.notApplicable, [{ key: 'lead2drive', channel: null }]);
  assert.deepEqual(rejected, []);
  const [, conflict] = parseSettings(row('Settings:\nRHY: Green\nLD1: Red\nGain: 5'), CUSTOM['mesa-boogie-triaxis-preamp']);
  assert.ok(conflict.some((l) => l.includes('Conflicting RHY/LD1/LD2')));
});

test('TriAxis + 2:90: rows after "Simul-Class 2" are the power amp; Presence is renamed, not conflicted', () => {
  const [parsed, rejected] = parseSettings(row('Settings:\nRHY: Yellow\nGain: 6\nPresence: 3.5\nSimul-Class 2: Ninety\nLevel: 5.5\nPresence: 0\nDeep: ON\n1/2 Drive: Off'), CUSTOM['mesa-boogie-triaxis-preamp-mesa-boogie-2-90-simulclass']);
  assert.equal(parsed.channel, 2);
  assert.equal(parsed.values.presence, 3.5);
  assert.equal(parsed.values.powerPresence, 0);
  assert.equal(parsed.values.halfDrive, false);
  assert.deepEqual(rejected, []);
});

test('ambiguous model is not mapped by manufacturer alone', () => {
  assert.equal(ampIdentity(row('', { tags: ['Mesa', 'Boogie'] }), CUSTOMS), null);
  assert.equal(ampIdentity(row('This is a capture of Mesa Boogie® M6 Carbine® amp.\nAmp: Big Block 750®\nGain: 6'), CUSTOMS), null);
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
  const [entries] = settingLines(row('Captured Device: Ampeg® SVT-2® Pro\nSettings:\nGain: 3.5\nGraphic EQ: on\n40:0\n1kHz: 2'));
  assert.deepEqual(entries.map((e) => e.label), ['Gain', 'Graphic EQ', '40', '1kHz']);
});

test('generic amps keep the recorded channel number and negative ranges', () => {
  const r = row('Settings:\nChannel: 3\nGain: 7\nMid: -4');
  const definition = inferAmp({ id: 'test', brand: 'Test', model: 'Test' }, [r]);
  assert.equal(definition.channels[0].n, 3);
  const [parsed] = parseSettings(r, definition);
  assert.equal(parsed.channel, 3);
  assert.equal(parsed.values.mid, -4);
  assert.equal(definition.controls.find((c) => c.key === 'mid').min, -4);
});

test('one label used for a knob and a switch becomes two controls, and each line goes to the right one', () => {
  const rows = [row('Settings:\nCH: 2\nGain: 9\nAir: Lo\nGain: Lo\nPre. EQ: Dark'), row('Settings:\nCH: 1\nGain: 6\nPre. EQ: Neutral'), row('Settings:\nCH: 2\nGain: 4\nGain: Hi\nPre. EQ: Mid')];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X' }, rows);
  const gain = def.controls.filter((c) => c.aliases.includes('Gain'));
  assert.deepEqual(gain.map((c) => [c.key, c.kind, c.label]), [['gain', 'knob', 'Gain'], ['gain_lohi', 'switch', 'Gain (Lo/Hi)']]);
  assert.deepEqual(gain[1].channels, [2]);
  const [parsed, rejected] = parseSettings(rows[0], def);
  assert.equal(parsed.values.gain, 9);
  assert.equal(parsed.values.gain_lohi, 'Lo');
  assert.deepEqual(rejected, []);
  // Channels keep their own switch positions.
  assert.deepEqual(def.controls.find((c) => c.key === 'preeq').channelOptions, { 1: ['Neutral'], 2: ['Dark', 'Mid'] });
  assert.equal(def.defaults.ch['1'].preeq, 'Neutral');
});

test('text values seen together in one capture are different switches; on/off and numbers repeated in one capture are numbered', () => {
  const rows = [row('Settings:\nCH: 3\nGain: 4.5\nGain: Lead\nGain: Lo'), row('Settings:\nCH: 3\nGain: 3.5\nGain: Plexi'), row('Settings:\nCH: 3\nGain: 6\nGain: Hi\nGain: Lead')];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X' }, rows);
  assert.deepEqual(def.controls.filter((c) => c.kind === 'switch').map((c) => c.options.map((o) => o.v)).sort(), [['Lead', 'Plexi'], ['Lo', 'Hi']].sort());
  const [parsed, rejected] = parseSettings(rows[0], def);
  assert.deepEqual([parsed.values.gain, parsed.values.gain_leadplexi, parsed.values.gain_lohi], [4.5, 'Lead', 'Lo']);
  assert.deepEqual(rejected, []);
  const twice = [row('Settings:\nVolume: 7.8\nPull Bright: OFF\nMaster: 4\nPull Bright: ON'), row('AMP:\nVolume: 6.4\nBass: 8\nVolume: 6')];
  const d2 = inferAmp({ id: 'y', brand: 'Y', model: 'Y' }, twice);
  assert.deepEqual(d2.controls.map((c) => c.key).filter((k) => /pullbright|volume/.test(k)), ['volume_1', 'volume_2', 'pullbright_1', 'pullbright_2']);
  const [p2, r2] = parseSettings(twice[0], d2);
  assert.deepEqual([p2.values.pullbright_1, p2.values.pullbright_2], [false, true]);
  assert.deepEqual(r2, []);
});

test('value aliases map other spellings onto one switch value before inference and parsing', () => {
  const rows = [row('Settings:\nCH: 2\nPre. EQ: Dark'), row('Settings:\nCH: 2\nPre. EQ: Normal'), row('Settings:\nCH: 2\nPre. EQ: Middle'), row('Settings:\nCH: 2\nPre. EQ: Mid')];
  const def = inferAmp({ id: 'x', brand: 'X', model: 'X' }, rows, { 'Pre. EQ': { Normal: 'Mid', Middle: 'Mid' } });
  assert.deepEqual(def.controls.find((c) => c.key === 'preeq').options.map((o) => o.v), ['Dark', 'Mid']);
  assert.equal(parseSettings(rows[1], def)[0].values.preeq, 'Mid');
  assert.equal(parseSettings(rows[2], def)[0].values.preeq, 'Mid');
});

test('pedal + amp chains use the amp identity; pedals get their own gear identity', () => {
  const identity = ampIdentity(row('This is a capture of Proco® Rat® distortion pedal with Ampeg® V-4B® amp.'), CUSTOMS);
  assert.equal(identity.brand, 'Ampeg');
  assert.equal(identity.model, 'V-4B');
  assert.deepEqual(ampIdentity(row('This is a capture of Ibanez® TS9 Tube Screamer® pedal.', { kind: 'pedal' }), CUSTOMS), { id: 'ibanez-ts9-tube-screamer', brand: 'Ibanez', model: 'TS9 Tube Screamer', source: 'description' });
  assert.deepEqual(ampIdentity(row('Captured Device: Unsound Circuitry’s Hyper Pozzum', { kind: 'fuzz' }), CUSTOMS), { id: 'unsound-circuitry-hyper-pozzum', brand: 'Unsound Circuitry', model: 'Hyper Pozzum', source: 'description' });
  // Without a described source, only amp captures are identified (from tags/name rules).
  assert.equal(ampIdentity(row('', { kind: 'pedal', tags: ['JP2C'] }), CUSTOMS), null);
});

test('source names, brands and channels from descriptions', () => {
  assert.equal(sourceAmpName('Captured Devices: Mesa® Boogie® Bass 400®, Origin Effects® Cali76®'), 'Mesa® Boogie® Bass 400®');
  assert.deepEqual(brandInfo('Mesa® Boogie® Bass 400®'), ['Mesa/Boogie', 'Mesa Boogie']);
  assert.deepEqual(brandInfo('Archetype: Tom Morello by Neural DSP®'), ['Neural DSP', '']);
  assert.equal(sourceAmpName('Full rig Capture from Bogna X 101B Ch.2 with a cabinet.'), 'Bogna X 101B');
  assert.deepEqual(channelsFromDescription('This is a capture of Hermansson® modded Hiwatt® Custom PA100® amp’s Jose channel preamp section.'), ['Jose']);
  assert.deepEqual(channelsFromDescription('Captured Device: Fryette® Pittbull Fifty/CL®\nSettings:\nRed Channel\nBoost: Engaged'), ['Red']);
});

test('app capture records keep the raw API fields they need', () => {
  const c = toCapture({ productId: 'p1', name: 'Blue', hash: 'h', authorUsername: 'NeuralDSP', published: true,
    likes: 3, stars: 0, downloads: 163, type: 'neural_capture', creatorType: 'quad',
    metadata: { instrumentType: 'guitar', deviceType: 'amp_combo', gainType: 2, version: '2' }, tags: ['x'] }, null, null);
  assert.deepEqual([c.id, c.deviceType, c.instrument, c.gainType, c.captureType, c.likes, c.published, c.settings], ['p1', 'Amp Combo', 'Guitar', '2', 'Neural Capture V2', 3, true, null]);
  // the description text and tags are build input only, never shipped to the app
  assert.ok(!('description' in c) && !('tags' in c));
});
