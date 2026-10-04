// Custom Audio Amplifiers 3+SE: the brushed silver 2U rack face. Three outlined channel rows, each with its
// own BRIGHT mini toggle and GAIN · BASS · MIDDLE · TREBLE · MASTER (black knobs on printed 0–10 scales,
// labels under them), ending in the channel's LED (the channel selector here; the selected channel's LED
// is lit, the other rows are dimmed). The L-shaped EQ box to the right holds LEVEL, TREB and BASS (never
// recorded: shown, not matched); the name sits beside it in plain text. The input jack, screws and the EQ
// LED are left out. The 2:90 combo stacks the Simul-Class 2:90 face under it.
import type { ComponentChildren } from 'preact';
import type { GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { chName } from '../../../domain/channels';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { ChannelButton, KnobControl, NotMatched, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Lever } from '../../primitives/Toggle';
import { Cab, KNOB_PATH, Simul290, ctl, num, type PanelProps } from '../shared';

const X: Record<string, number> = { bright: 84, gain: 132, bass: 226, middle: 312, treble: 398, master: 485 };
const Y = [30, 86, 142];
const at = (v: number, r: number) => {
  const a = ((-150 + v * 30) * Math.PI) / 180;
  return { left: (18 + r * Math.sin(a)).toFixed(1) + 'px', top: (18 - r * Math.cos(a)).toFixed(1) + 'px' };
};
/** The printed 0–10 scale around a knob. */
const Numbers = () => (
  <>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
      <span class="c3n" style={at(v, 23)}>
        {v}
      </span>
    ))}
  </>
);
/** The dotted − … + scale of the EQ's treble and bass. */
const Dots = () => (
  <>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
      <span class="c3d" style={at(v, 23)} />
    ))}
    <span class="c3n pm" style={{ left: '-6px', top: '20px' }}>
      −
    </span>
    <span class="c3n pm" style={{ left: '42px', top: '20px' }}>
      +
    </span>
  </>
);

function Knob({
  as,
  c,
  n,
  x,
  y,
  lab,
  aria,
  scale,
}: {
  as: GearSettings;
  c: RangeControl;
  n: number | null;
  x: number;
  y: number;
  lab: string;
  aria: string;
  scale: ComponentChildren;
}) {
  const v = num(n == null ? as.global[c.key] : as.ch[n]![c.key]),
    off = n != null && n !== as.channel ? ' c3off' : '';
  return (
    <div class={'c3k' + off} style={{ left: x + 'px', top: y + 'px' }}>
      <span aria-hidden="true">{scale}</span>
      <KnobControl c={c} n={n} value={v} label={aria + (c.weight > 0 ? '' : ' (not used for matching)')} size={36}>
        <svg viewBox="0 0 60 60" width="36" height="36" aria-hidden="true">
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 30 30)`}>
            <path d={KNOB_PATH} fill="#121212" stroke="#000" stroke-width="1.2" />
            <circle cx="30" cy="30" r="19" fill="#1b1b1b" stroke="#2c2c2c" stroke-width="1" />
            <path d="M30 25 L30 6" stroke="#f4f4f4" stroke-width="3.2" stroke-linecap="round" />
          </g>
        </svg>
      </KnobControl>
      <span class="c3lab" aria-hidden="true">
        <NotMatched c={c} />
        {lab}
      </span>
      <Readout v={v} />
    </div>
  );
}

const EQ: [string, string, () => ComponentChildren][] = [
  ['eqlevel', 'LEVEL', Numbers],
  ['eqtreble', 'TREB', Dots],
  ['eqbass', 'BASS', Dots],
];

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const sel = as.channel,
    bright = ctl<SwitchControl>(def, 'bright');
  return (
    <div class="c3face" role="group" aria-label="Custom Audio Amplifiers 3+SE front panel">
      <span class="c3ears" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <svg class="c3lines" viewBox="0 0 850 176" width="850" height="176" aria-hidden="true">
        <g fill="none" stroke="#2e2f30" stroke-width="1.1">
          <rect x="52" y="3.5" width="538" height="56" rx="7" />
          <rect x="52" y="59.5" width="538" height="56" rx="7" />
          <rect x="52" y="115.5" width="538" height="56" rx="7" />
          <path d="M601 3.5 H705 a7 7 0 0 1 7 7 V52.5 a7 7 0 0 1 -7 7 H680 V164.5 a7 7 0 0 1 -7 7 H601 a7 7 0 0 1 -7 -7 V10.5 a7 7 0 0 1 7 -7 Z" />
        </g>
      </svg>
      {def.channels!.map((chn, r) => {
        const n = chn.n,
          y = Y[r]!,
          cs = as.ch[n]!,
          on = n === sel,
          off = on ? '' : ' c3off',
          not = on ? '' : ', not used on channel ' + sel + ' ' + chName(def, sel);
        const bon = cs.bright === true;
        return (
          <>
            <PickButton
              id={scope.prefix + 'p-bright-' + n}
              class={'c3tog' + off}
              style={{ left: X.bright + 'px', top: y - 7 + 'px' }}
              aria-pressed={bon}
              aria-label={'Channel ' + n + ' ' + chn.name + ' bright: ' + (bon ? 'on' : 'off') + not}
              c={bright}
              n={n}
              v={!bon}
            >
              <Lever pos={bon ? 'up' : 'down'} />
              <span class="c3lab">
                {bright.weight === 0 ? <span class="nsmark">⊘</span> : null}
                BRIGHT
              </span>
              <span class="c3st">{bon ? 'ON' : 'OFF'}</span>
            </PickButton>
            {['gain', 'bass', 'middle', 'treble', 'master'].map((k) => {
              const c = ctl(def, k);
              return (
                <Knob
                  as={as}
                  c={c}
                  n={n}
                  x={X[k]!}
                  y={y}
                  lab={c.label}
                  aria={'Channel ' + n + ' ' + chn.name + ' ' + nice(c.label) + not}
                  scale={<Numbers />}
                />
              );
            })}
            <ChannelButton
              id={scope.prefix + 'cs-' + n}
              class={'c3ch' + (on ? ' on' : '')}
              style={{ top: y + 'px' }}
              aria-pressed={on}
              aria-label={'Channel ' + n + ' ' + chn.name + (on ? ', selected' : '')}
              n={n}
            >
              <span class="c3led" aria-hidden="true" />
              {'CH' + n}
            </ChannelButton>
          </>
        );
      })}
      {EQ.map(([k, lab, Scale], r) => (
        <Knob
          as={as}
          c={ctl(def, k)}
          n={null}
          x={624}
          y={Y[r]!}
          lab={lab}
          aria={'EQ ' + nice(lab === 'TREB' ? 'TREBLE' : lab)}
          scale={<Scale />}
        />
      ))}
      <span class="c3eq" aria-hidden="true">
        EQ
      </span>
      <span class="c3name" aria-hidden="true">
        CUSTOM
        <br />
        AUDIO
        <br />
        AMPLIFIERS<span>3+ SE Tube Preamp</span>
      </span>
    </div>
  );
}

/** Rack units: the 3+SE (and the Simul-Class 2:90 it was captured through, stacked under it). */
export function Ca3sePanel({ def, as }: PanelProps) {
  return (
    <Cab variant="txcab">
      <Face def={def} as={as} />
      {def.panel === 'ca3se290' ? <Simul290 def={def} as={as} /> : null}
    </Cab>
  );
}
