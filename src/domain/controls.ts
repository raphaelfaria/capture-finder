// Controls and the values set on them.
import type { Control, ControlValue, GearDef, RangeControl, SwitchControl, SwitchOption } from '../../shared/schema';
import type { GearSettings } from './types';

/** Whether a control is used on channel n (controls without `channels` are used on all). */
export const available = (c: Control, n: number | null): boolean =>
  !c.channels || (n != null && c.channels.includes(n));

/** Gear with more than one channel (channel tabs, per-channel matching). */
export const multiCh = (def: GearDef): boolean => !!def.channels && def.channels.length > 1;

/** A knob/fader value on its step grid, inside its range. */
export const snap = (c: RangeControl, v: number): number =>
  Math.min(c.max, Math.max(c.min, Math.round(v / c.step) * c.step));

/** The positions of a switch on channel n: channels can use different positions of the same switch
 *  (channelOptions from the build); otherwise all options apply. */
export function optionsFor(c: SwitchControl, n: number | null): SwitchOption[] {
  const only = n != null && c.channelOptions ? c.channelOptions[n] : undefined;
  return only ? c.options.filter((o) => only.includes(o.v)) : c.options;
}

/** A control's value in some settings (channel controls read the given channel). */
export function getValue(as: GearSettings, c: Control, n: number | null): ControlValue | undefined {
  return c.scope === 'channel' ? (n == null ? undefined : (as.ch[n] || {})[c.key]) : as.global[c.key];
}

/** A stored value that is still valid for the control, or undefined (snapped onto the knob's grid). */
export function cleanValue(c: Control, v: unknown): ControlValue | undefined {
  if (c.kind === 'switch') return c.options.some((o) => o.v === v) ? (v as ControlValue) : undefined;
  return typeof v === 'number' && isFinite(v) && v >= c.min && v <= c.max ? snap(c, v) : undefined;
}

/** A control's starting value (what Reset and double-click restore), per channel for channel controls. */
export function defaultValue(def: GearDef, c: Control, n: number | null): ControlValue | undefined {
  const d = def.defaults;
  return c.scope === 'channel' ? (n == null ? undefined : (d.ch[n] || {})[c.key]) : d.global[c.key];
}

/** Settings set to a definition's starting values (a deep copy). */
export const initialSettings = (def: GearDef): GearSettings => JSON.parse(JSON.stringify(def.defaults)) as GearSettings;

/** The rotation of a knob's pointer for a value: −150° at the minimum to +150° at the maximum. */
export const knobAngle = (c: RangeControl, v: number): number => -150 + ((v - c.min) / (c.max - c.min)) * 300;
