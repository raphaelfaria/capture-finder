// Darkglass Microtubes B7K Ultra (the Neural DSP Darkglass Ultra / Ultimate plugins' pedal): the black
// faceplate with MASTER · BLEND | LEVEL · DRIVE over BASS · LO MIDS | HI MIDS · TREBLE, the ATTACK / LO
// MIDS and GRUNT / HI MIDS 3-way toggles between each knob pair (mid toggles labelled with the
// frequencies printed on the pedal, in its order), and the recorded DISTORTION footswitch. Bypass, LEDs,
// jacks and the enclosure are cropped away.
import type { RangeControl, SwitchControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Toggle } from '../../primitives/Toggle';
import { Cab, ctl, num, type PanelProps } from '../shared';

const KNOB: Record<string, [number, number]> = {
  master: [26, 30],
  blend: [122, 30],
  level: [208, 30],
  drive: [304, 30],
  bass: [26, 100],
  lomids: [122, 100],
  himids: [208, 100],
  treble: [304, 100],
};
const TOG: Record<string, [number, number, string]> = {
  attack: [64, 40, 'ATTACK'],
  lomidsswitch: [64, 108, 'LO MIDS'],
  grunt: [246, 40, 'GRUNT'],
  himidsswitch: [246, 108, 'HI MIDS'],
};

function Knob({ c, v }: { c: RangeControl; v: number }) {
  const [x, y] = KNOB[c.key]!,
    r = 23,
    size = r * 2 + 2,
    m = size / 2;
  return (
    <>
      <div class="b7k" style={{ left: x + 'px', top: y + 'px' }}>
        <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={size}>
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
            <g transform={`rotate(${knobAngle(c, v).toFixed(1)} ${m} ${m})`}>
              <circle cx={m} cy={m} r={r - 1} fill="#0f0f0f" stroke="#454545" stroke-width="1.4" />
              <circle cx={m} cy={m} r={r - 7} fill="#1a1a1a" stroke="#2c2c2c" stroke-width="1" />
              <path
                d={`M${m} ${m - r + 4} L${m} ${(m - r * 0.35).toFixed(1)}`}
                stroke="#f2f2f2"
                stroke-width="2.6"
                stroke-linecap="round"
              />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
      <span class="b7lab" style={{ left: x + 'px', top: y + 30 + 'px' }}>
        {c.label}
      </span>
    </>
  );
}

/** Pedal: only the black faceplate with a thin margin of the light enclosure. */
export function B7kUltraPanel({ def, as }: PanelProps) {
  const scope = useScope();
  const g = as.global,
    on = g.distortion === true;
  return (
    <Cab variant="b7cab">
      <div class="b7face" role="group" aria-label="Darkglass Microtubes B7K Ultra controls">
        <div class="b7panel">
          {Object.keys(KNOB).map((k) => (
            <Knob c={ctl(def, k)} v={num(g[k])} />
          ))}
          {Object.entries(TOG).map(([k, [x, y, title]]) => {
            const c = ctl<SwitchControl>(def, k);
            return (
              <Toggle
                x={x}
                y={y}
                options={c.options}
                current={g[k]}
                control={c}
                aria={nice(title) + ' switch'}
                labelPos={[
                  { x: x + 19, y: y - 12 },
                  { x: x + 21, y },
                  { x: x + 19, y: y + 12 },
                ]}
                title={title}
                titleY={y - 26}
              />
            );
          })}
          <PickButton
            id={scope.prefix + 'p-distortion-'}
            class="b7fs"
            style={{ left: '68px', top: '170px' }}
            aria-pressed={on}
            aria-label={'Distortion footswitch: ' + (on ? 'on' : 'off')}
            c={ctl<SwitchControl>(def, 'distortion')}
            n={null}
            v={!on}
          >
            <span class="cap" aria-hidden="true" />
            <span class="led" aria-hidden="true" />
            <span class="txt">
              <span>DISTORTION</span>
              <span>{on ? 'ON' : 'OFF'}</span>
            </span>
          </PickButton>
          {/* Name where the pedal prints it: bottom centre, plain text */}
          <div class="b7name" aria-hidden="true">
            <b>MICROTUBES B7K ULTRA</b>
            <span>DARKGLASS ELECTRONICS</span>
          </div>
        </div>
      </div>
    </Cab>
  );
}
