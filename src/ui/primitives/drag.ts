// Pointer dragging for knobs (vertical movement) and faders (absolute position on the track).
import type { RangeControl } from '../../../shared/schema';
import { snap } from '../../domain/controls';

/** A fader track's geometry: where the cap sits for a fraction f of the range, and back. */
export interface FaderGeometry {
  capTop(f: number, h: number): number;
  inv(y: number, h: number): number;
}

export const FADER_GEOMETRY = {
  // JP-2C: 146px track with its center line at 77 (±62)
  jp: { capTop: (f: number) => 77 - (f * 2 - 1) * 62 - 6, inv: (y: number) => ((77 - y) / 62 + 1) / 2 },
  // generic: 120px track
  gen: { capTop: (f: number) => (1 - f) * 108, inv: (y: number) => 1 - (y - 6) / 108 },
  // Mark IIC+ sliders: 80px track, 10px cap
  mk: { capTop: (f: number) => (1 - f) * 70, inv: (y: number) => 1 - (y - 5) / 70 },
  // GE-7: the cap is 12% of the track, any track height
  ge: {
    capTop: (f: number, h: number) => (1 - f) * h * 0.88,
    inv: (y: number, h: number) => 1 - (y - h * 0.06) / (h * 0.88),
  },
} satisfies Record<string, FaderGeometry>;
export type FaderGeometryName = keyof typeof FADER_GEOMETRY;

/** Start dragging a knob: 14px of vertical movement is a tenth of its range. */
export function dragKnob(e: PointerEvent, c: RangeControl, from: number, onValue: (v: number) => void): void {
  const y0 = e.clientY,
    span = c.max - c.min;
  let last = from;
  track((ev) => {
    const v = snap(c, from + ((y0 - ev.clientY) / 14) * (span / 10));
    if (v !== last) onValue((last = v));
  });
}

/** Start dragging a fader: the cap follows the pointer along the track. */
export function dragFader(
  e: PointerEvent,
  el: Element,
  c: RangeControl,
  geo: FaderGeometry,
  from: number,
  onValue: (v: number) => void,
): void {
  const rect = el.getBoundingClientRect(),
    span = c.max - c.min;
  let last = from;
  const move = (ev: PointerEvent) => {
    const v = snap(c, c.min + geo.inv(ev.clientY - rect.top, rect.height) * span);
    if (v !== last) onValue((last = v));
  };
  move(e);
  track(move);
}

/** Follow the pointer until it is released. */
function track(move: (e: PointerEvent) => void): void {
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
