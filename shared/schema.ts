// The data model shared by the data tools (which write it) and the app (which reads it):
// public/data/gear.json is a GearDef[], public/data/captures.json a Capture[].

/** A switch position's value: on/off, a number (stepped knobs) or a word. */
export type SwitchValue = boolean | number | string;
/** Any control's value: knobs and faders hold numbers, switches one of their options' values. */
export type ControlValue = SwitchValue;
/** Control values by control key. */
export type Values = Record<string, ControlValue>;

export interface SwitchOption {
  v: SwitchValue;
  label: string;
  /** Other spellings of this position in descriptions. */
  aliases?: string[];
}

interface ControlBase {
  key: string;
  label: string;
  /** Other spellings of the label in descriptions. */
  aliases?: string[];
  /** 'channel': one value per channel (state.ch[n]); 'global': one value for the gear. */
  scope: 'channel' | 'global';
  /** Only used on these channels (still drawn, dimmed, on the others). */
  channels?: number[];
  /** Matching weight; 0 = shown but not matched. */
  weight: number;
  /** The channel's main gain/drive/volume control. */
  primary?: boolean;
  /** e.g. 'eq': grouped in the comparison summary. */
  group?: string;
  /** Key of an on/off switch that enables this control. */
  requires?: string;
}

export interface RangeControl extends ControlBase {
  kind: 'knob' | 'fader';
  min: number;
  max: number;
  step: number;
}

export interface SwitchControl extends ControlBase {
  kind: 'switch';
  /** Positions, top → bottom (or left → right). */
  options: SwitchOption[];
  /** The positions each channel uses, when channels differ (generic gear). */
  channelOptions?: Record<string, SwitchValue[]>;
}

export type Control = RangeControl | SwitchControl;

export interface Channel {
  n: number;
  name: string;
  aliases?: string[];
}

/** A pedal with the gear, in signal order: in front of it, or in its effects loop. */
export interface ChainItem {
  /** Gear id of the pedal's definition, or null when the pedal isn't identified. */
  id: string | null;
  name: string;
  /** The pedal's stated settings (null when its block couldn't be read). */
  values?: Values | null;
  loop?: boolean;
}

export interface GearDefaults {
  /** Starting channel (null for single-channel gear). */
  channel: number | null;
  /** Channel-scoped values by channel number (as a string key). */
  ch: Record<string, Values>;
  global: Values;
  /** The starting capture's pedal chain, if any. */
  chain?: ChainItem[];
}

/** Where the starting settings come from: per channel, its most downloaded capture. */
export interface DefaultsSource {
  channel: number | null;
  name: string;
  downloads: number | null;
}

export interface MatchRule {
  source?: string;
  tags?: string[];
  name?: string;
}

export interface ParseRules {
  channelFromRows?: string[];
  ignoreWhenNA?: string[];
  sections?: { startsAt: string; rename?: Record<string, string> }[];
  assumeWhenMissing?: Values;
  readOn?: string[];
}

/** Other spellings of a control's values: {label: {spelling: value}}. */
export type ValueAliases = Record<string, Record<string, ControlValue>>;

export interface GearDef {
  id: string;
  brand: string;
  model: string;
  /** Custom panel id, or 'generic'. */
  panel: string;
  /** Amps, Pedals, Compressors, Fuzz, Overdrive… */
  category?: string;
  fullName?: string;
  definitionSource?: string;
  /** Section title for global controls on a generic panel. */
  globalTitle?: string;
  match?: MatchRule;
  parse?: ParseRules;
  valueAliases?: ValueAliases;
  channels: Channel[] | null;
  controls: Control[];
  /** Drawing order of the controls on custom panels. */
  panelOrder?: string[];
  defaults: GearDefaults;
  defaultsNote?: string;
  defaultsFrom?: DefaultsSource[];
  captureCount?: number;
  /** Only ever seen as a pedal in front of other gear: drawn in chains, not offered in pickers. */
  chainOnly?: boolean;
  /** How the identity was found (generic gear). */
  source?: string;
  /** App only: the "Unmapped captures" library entry, which browses captures without settings. */
  browseOnly?: boolean;
}

export interface NotApplicable {
  key: string;
  channel: number | null;
}

export interface CaptureSettings {
  /** The recorded channel, or null (single-channel gear, or several channels recorded). */
  channel: number | null;
  values: Values;
  /** Per-channel values when the description lists channels. */
  byChannel: Record<string, Values>;
  notApplicable: NotApplicable[];
  /** Keys whose values were assumed (parse.assumeWhenMissing), not stated. */
  assumed?: string[];
}

export interface Capture {
  id: string;
  productId: string;
  hash: string;
  ampId: string | null;
  mappingSource: string;
  name: string;
  captureType: string;
  deviceType: string;
  deviceTypeCode: string;
  instrument: string;
  gainType: string;
  tags: string[];
  author: { username: string };
  creator: { type: string; version: string };
  published: boolean | null;
  likes: number | null;
  stars: number | null;
  downloads: number | null;
  description: string;
  settings: CaptureSettings | null;
  uninterpretedSettings: string[];
  chain?: ChainItem[];
}

export interface MappingReport {
  summary: { captures: number; amps: number; mapped: number; parsed: number; unmapped: number };
  unmapped: { id: string; name: string; type: string }[];
  needsReview: { id: string; name: string; lines: string[] }[];
}

export const isSwitch = (c: Control): c is SwitchControl => c.kind === 'switch';
export const isRange = (c: Control): c is RangeControl => c.kind !== 'switch';
