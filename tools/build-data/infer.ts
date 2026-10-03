// Generic gear: a definition inferred from the settings its captures record.
import type {
  Channel,
  Control,
  ControlValue,
  GearDef,
  GearDefaults,
  SwitchOption,
  ValueAliases,
} from '../../shared/schema';
import { isDigits, norm, valueLabel } from '../lib/text';
import { channelOrder } from './channels';
import { settingLines, valueAliaser, valueOf } from './settings';
import type { Identity, Row } from './types';

const ONOFF: SwitchOption[] = [
  { v: true, label: 'ON' },
  { v: false, label: 'OFF' },
];

interface Observation {
  value: ControlValue;
  channel: string | null;
  pos: number;
}
interface LabelInfo {
  label: string;
  obs: Observation[];
  together: string[][];
  slots: number;
  numSlots: number;
}
interface Part {
  number: boolean;
  slot?: number;
  obs: Observation[];
}
// The control being built: its kind-specific fields are filled in below.
type Draft = Control & Record<string, unknown>;

/** Generic gear definition from the settings its captures record.
 *  One label can stand for several controls (e.g. a 0–10 "Gain" knob and a Lo/Hi "Gain" switch,
 *  both written "Gain: …" in the same capture). Numbers under a label form the knob; text values
 *  form switches, and text values that appear together in one capture belong to different
 *  switches. A label repeated with numbers, or with on/off values, in one capture is several
 *  controls numbered by position (e.g. "Volume 1"/"Volume 2", "Pull Bright 1"/"Pull Bright 2").
 *  Each control only applies to the channels it was recorded on, and switches keep the options
 *  each channel actually uses (channelOptions) when channels differ. */
export function inferAmp(
  identity: Identity,
  rows: Pick<Row, 'description' | 'name'>[],
  valueAliases: ValueAliases | null = null,
): GearDef {
  const alias = valueAliaser(valueAliases);
  const labels = new Map<string, LabelInfo>(),
    channels: string[] = [];
  for (const row of rows) {
    const inCapture = new Map<string, ControlValue[]>();
    for (const entry of settingLines(row)[0].map(alias)) {
      const token = entry.channel;
      if (token !== null && !channels.some((c) => norm(c) === norm(token))) channels.push(token);
      const value = valueOf(entry.raw);
      if (value === null) continue;
      const key = norm(entry.label);
      if (!labels.has(key)) labels.set(key, { label: entry.label, obs: [], together: [], slots: 1, numSlots: 1 });
      if (!inCapture.has(key)) inCapture.set(key, []);
      const isNum = typeof value === 'number',
        pos = inCapture.get(key)!.filter((v) => (typeof v === 'number') === isNum).length;
      labels.get(key)!.obs.push({ value, channel: token, pos });
      inCapture.get(key)!.push(value);
    }
    for (const [key, vals] of inCapture) {
      const lines = vals.filter((v) => typeof v !== 'number'),
        texts = [...new Set(lines.map(String))];
      const info = labels.get(key)!;
      if (texts.length > 1) info.together.push(texts);
      info.slots = Math.max(info.slots, lines.length);
      info.numSlots = Math.max(info.numSlots, vals.length - lines.length);
    }
  }
  channels.sort(channelOrder);
  const numericChannels = channels.length && channels.every((c) => isDigits(c) && Number(c) >= 1 && Number(c) <= 9);
  // Source aliases are not guaranteed hardware channel counts.
  const channelDefs: Channel[] | null = channels.length
    ? channels.map((c, i) => ({ n: numericChannels ? Number(c) : i + 1, name: c, aliases: [c] }))
    : null;
  const controls: Draft[] = [];
  const defaults: GearDefaults = {
    channel: channelDefs ? channelDefs[0]!.n : null,
    ch: Object.fromEntries((channelDefs || []).map((c) => [String(c.n), {}])),
    global: {},
  };
  for (const [key, { label, obs, together, slots, numSlots }] of labels) {
    const numbers = obs.filter((o) => typeof o.value === 'number'),
      texts = obs.filter((o) => typeof o.value !== 'number');
    let textParts: Part[];
    if (slots > 1 && texts.every((o) => typeof o.value === 'boolean')) {
      // Repeated on/off lines: one switch per position in the capture.
      textParts = Array.from({ length: slots }, (_, i) => ({
        number: false,
        slot: i + 1,
        obs: texts.filter((o) => o.pos === i),
      }));
    } else {
      // Colour the "seen together" graph, most-constrained values first: a value joins the first
      // group it never appeared with (so Lo/Hi and Lead/Plexi end up as two switches).
      const conflicts = (x: string, v: string) => together.some((t) => t.includes(x) && t.includes(v));
      const values = [...new Set(texts.map((o) => String(o.value)))];
      const degree = (v: string) => values.filter((x) => x !== v && conflicts(x, v)).length;
      const groups: string[][] = [];
      for (const v of [...values].sort((a, b) => degree(b) - degree(a))) {
        const g = groups.find((grp) => grp.every((x) => !conflicts(x, v)));
        if (g) g.push(v);
        else groups.push([v]);
      }
      // keep each group's values in first-seen order
      textParts = groups
        .map((g) => ({ number: false, obs: texts.filter((o) => g.includes(String(o.value))) }))
        .sort((a, b) => texts.indexOf(a.obs[0]!) - texts.indexOf(b.obs[0]!));
    }
    const numberParts: Part[] = !numbers.length
      ? []
      : numSlots > 1
        ? Array.from({ length: numSlots }, (_, i) => ({
            number: true,
            slot: i + 1,
            obs: numbers.filter((o) => o.pos === i),
          }))
        : [{ number: true, obs: numbers }];
    const parts = numberParts.concat(textParts);
    const split = parts.length > 1;
    for (const part of parts) {
      const vals = part.obs.map((o) => o.value);
      const control = {
        key,
        label,
        aliases: [label],
        scope: channelDefs ? 'channel' : 'global',
        weight: 1,
      } as unknown as Draft;
      let defFor: (n: number | null) => ControlValue;
      if (part.number) {
        if (part.slot) {
          control.key = key + '_' + part.slot;
          control.label = label + ' ' + part.slot;
        }
        const frequency = /^\d+(?:\.\d+)?\s*(?:k?Hz)$/i.test(label);
        const nums = vals as number[];
        Object.assign(control, {
          kind: frequency ? 'fader' : 'knob',
          min: Math.min(0, ...nums),
          max: Math.max(10, ...nums),
          step: 0.1,
        });
        const range = control as unknown as { min: number; max: number };
        const d = range.min <= 5 && 5 <= range.max ? 5 : range.min;
        defFor = () => d;
      } else {
        let options: SwitchOption[] = [];
        for (const value of vals)
          if (options.every((o) => value !== o.v))
            options.push({ v: value, label: typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : valueLabel(value) });
        if (vals.every((v) => typeof v === 'boolean')) options = ONOFF;
        Object.assign(control, { kind: 'switch', options });
        if (part.slot) {
          control.key = key + '_' + part.slot;
          control.label = label + ' ' + part.slot;
        } else if (split) {
          const names = options.map((o) => o.label);
          control.key = key + '_' + norm(names.join(''));
          control.label =
            label + ' (' + (names.length > 3 ? names.slice(0, 2).join('/') + '/…' : names.join('/')) + ')';
        }
        if (channelDefs) {
          // Options each channel actually uses, kept only when channels differ.
          const per: Record<string, ControlValue[]> = {};
          for (const o of part.obs) {
            const n = channelDefs.find((c) => c.name === o.channel)?.n;
            if (n !== undefined && !(per[n] || (per[n] = [])).includes(o.value)) per[n]!.push(o.value);
          }
          const ordered = Object.fromEntries(
            Object.entries(per).map(([n, vs]) => [n, options.map((o) => o.v).filter((v) => vs.includes(v))]),
          );
          if (Object.values(ordered).some((vs) => vs.length !== options.length)) control.channelOptions = ordered;
        }
        const channelOptions = control.channelOptions as Record<string, ControlValue[]> | undefined;
        defFor = (n) => (channelOptions && n !== null && channelOptions[n] ? channelOptions[n]![0]! : options[0]!.v);
      }
      const recorded = new Set(part.obs.map((o) => o.channel).filter((c) => c !== null));
      if (channelDefs) {
        const applicable = channelDefs.filter((c) => !recorded.size || recorded.has(c.name)).map((c) => c.n);
        control.channels = applicable;
        for (const n of applicable) defaults.ch[String(n)]![control.key] = defFor(n);
      } else defaults.global[control.key] = defFor(null);
      controls.push(control);
    }
  }
  // Main control, one per channel: the first gain/drive/volume knob the channel has, or the effect's
  // own amount (distortion, fuzz, sustain, compression).
  const isMain = (c: Control) =>
    c.kind === 'knob' && /gain|drive|volume|dist|fuzz|sustain|^sus$|compression|input\/comp/i.test(c.label);
  for (const n of channelDefs ? channelDefs.map((c) => c.n) : [null]) {
    const here = controls.filter((c) => n === null || !c.channels || c.channels.includes(n));
    const hasMain = (m: number) => controls.some((c) => c.primary && (!c.channels || c.channels.includes(m)));
    // never one that would give another channel a second main control
    if (!here.some((c) => c.primary)) {
      const main = here.find((c) => isMain(c) && (!c.channels || c.channels.every((m) => m === n || !hasMain(m))));
      if (main) main.primary = true;
    }
  }
  return {
    ...identity,
    panel: 'generic',
    channels: channelDefs,
    controls,
    defaults,
    definitionSource: 'capture descriptions',
    ...(valueAliases ? { valueAliases } : {}),
    defaultsNote:
      'Capture-derived controls; numeric ranges assume 0–10 and expand to include recorded values. Not a verified hardware panel.',
  } as GearDef;
}
