// Bogner Überschall: the black faceplate under the grille (the Bogner logo, the play/standby/power switch,
// the LED and the input are left out). The name sits in plain text where the Überschall badge is, then
// M.VOLUME, then one channel: its six knobs (VOLUME · PRESENCE · TREBLE · MIDDLE · BASS · GAIN) under
// their silver label strip. The amp has two such rows; the captures don't name a channel and are treated
// as channel 2, so only that row is drawn. Black chicken-head knobs.
import type { RangeControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, Readout } from '../../primitives/controls';
import { Cab, ctl, num, type PanelProps } from '../shared';

const KNOBS: [string, number][] = [
  ['volume', 236],
  ['presence', 294],
  ['treble', 352],
  ['middle', 410],
  ['bass', 468],
  ['gain', 526],
];

function Knob({ c, v, x }: { c: RangeControl; v: number; x: number }) {
  return (
    <div class="ubk" style={{ left: x + 'px' }}>
      <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={42}>
        <svg viewBox="0 0 42 42" width="42" height="42" aria-hidden="true">
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 21 21)`}>
            <circle cx="21" cy="21" r="11.5" fill="#141414" stroke="#5c5c5c" stroke-width="1.2" />
            <path
              d="M21 2 L26 21 L21 32 L16 21 Z"
              fill="#1b1b1b"
              stroke="#6a6a6a"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
            <path d="M21 5 L21 19" stroke="#d9d9d9" stroke-width="1.8" stroke-linecap="round" />
          </g>
        </svg>
      </KnobControl>
      <Readout v={v} />
    </div>
  );
}

/** Amp head: the faceplate under a plain grille (the logo is left out). */
export function UberschallPanel({ def, as }: PanelProps) {
  const g = as.global;
  return (
    <Cab variant="ubcab">
      <div class="ubgrille" aria-hidden="true" />
      <div class="ubface" role="group" aria-label={def.brand + ' ' + def.model + ' front panel, channel 2'}>
        <span class="ubbadge" aria-hidden="true">
          Überschall<span>BOGNER</span>
        </span>
        <span class="ublab" style={{ left: '150px' }}>
          M.Volume
        </span>
        <Knob c={ctl(def, 'mastervol')} v={num(g.mastervol)} x={150} />
        <span class="ubstrip" aria-hidden="true" />
        {KNOBS.map(([k, x]) => (
          <>
            <span class="ubslab" style={{ left: x + 'px' }}>
              {nice(ctl(def, k).label)}
            </span>
            <Knob c={ctl(def, k)} v={num(g[k])} x={x} />
          </>
        ))}
        <span class="ubch">CH 2</span>
      </div>
    </Cab>
  );
}
