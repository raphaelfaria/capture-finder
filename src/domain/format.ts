// Value and label formatting.
import type { Control, ControlValue } from '../../shared/schema';

/** One decimal, as every readout shows it ("5.0"). */
export const f1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);

/** An all-caps panel label in normal case for prose ("PRESENCE" → "Presence"); others unchanged. */
export function nice(l: string): string;
export function nice(l: string | null | undefined): string | null | undefined;
export function nice(l: string | null | undefined): string | null | undefined {
  return l && l === l.toUpperCase() ? l.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()) : l;
}

/** A switch value's option label (On/Off for on/off switches). */
export function optLabel(c: Control, v: ControlValue | null | undefined): string | null {
  if (v == null) return null;
  const o = (c.kind === 'switch' ? c.options : []).find((x) => x.v === v);
  return o ? (typeof v === 'boolean' ? (v ? 'On' : 'Off') : o.label) : String(v);
}

/** A control's value as text: the option label for switches, one decimal for knobs and faders. */
export function fmtVal(c: Control, v: ControlValue | null | undefined): string | null {
  if (v == null) return null;
  return c.kind === 'switch' ? optLabel(c, v) : f1(v as number);
}

/** Plain string order for names, case- and accent-insensitive, numbers in numeric order. */
export const byName = (a: unknown, b: unknown): number =>
  String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
