// Bogner Fish: the light-blue 2U rack face, traced from the front (0.7 scale). Top row (Brown and
// Strato): BROWN VOL. · STRATO VOL. · TREBLE · MIDDLE · BASS · BROWN · STRATO; bottom row: Shark (M. VOL. ·
// TREBLE · BASS · BRIGHT/DARK · BALLS) and Country (TREBLE · MIDDLE · BASS · JAZZ/FUNK · VOLUME). White
// chicken-head knobs over white label plates. The printed channel labels (STRATO ▶, BROWN ▶, SHARK ▶,
// ◀ COUNTRY) pick the channel, and the small triangle LEDs by each channel's level knobs light for it;
// controls the channel doesn't use are dimmed. The logo becomes plain text; the power switch, fish
// artwork and input jack are left out. Presence and Master, recorded by the Fish-alone captures, sit on
// the rear panel: they are shown where the power switch is. The Fish + 2:Ninety entry stacks the
// Simul-Class 2:Ninety face under it.
import type { Control, GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { available, knobAngle } from '../../../domain/controls';
import { chName } from '../../../domain/channels';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { ChannelButton, KnobControl, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Toggle } from '../../primitives/Toggle';
import { Cab, Simul290, ctl, maybeCtl, num, type PanelProps } from '../shared';

const KNOBS: [string, number, number][] = [
  ['brownvol', 97, 35],
  ['stratovol', 154, 35],
  ['treble24', 209, 35],
  ['middle24', 263, 35],
  ['bass24', 318, 35],
  ['browngain', 373, 35],
  ['stratogain', 427, 35],
  ['sharkvol', 99, 101],
  ['sharktreble', 155, 101],
  ['sharkbass', 209, 101],
  ['balls', 318, 101],
  ['countrytreble', 398, 101],
  ['countrymiddle', 451, 101],
  ['countrybass', 505, 101],
  ['countryvol', 617, 101],
  ['presence', 640, 35],
  ['mastervol', 700, 35],
];
const SELECT: [number, string, number, number, string][] = [
  [4, 'STRATO', 27, 30, '▶'],
  [2, 'BROWN', 27, 50, '▶'],
  [3, 'SHARK', 27, 99, '▶'],
  [1, 'COUNTRY', 724, 99, '◀'],
];
const LEDS: [number, number, number][] = [
  [2, 125, 15],
  [4, 179, 15],
  [2, 396, 15],
  [4, 451, 15],
  [3, 126, 81],
  [1, 424, 81],
];
const LIT: Record<number, string> = { 1: '#4cdc5a', 2: '#ff7a2e', 3: '#ff3b30', 4: '#3fb7ff' };
const TOGGLES: [string, number, string, { x: number; y: number }[]][] = [
  [
    'brightdark',
    263,
    'Bright or dark (Shark)',
    [
      { x: 263, y: 84 },
      { x: 263, y: 132 },
    ],
  ],
  [
    'jazzfunk',
    557,
    'Jazz, middle or funk (Country)',
    [
      { x: 557, y: 84 },
      { x: 584, y: 108 },
      { x: 557, y: 132 },
    ],
  ],
];
const off = (c: Control, as: GearSettings) => (available(c, as.channel) ? '' : ' fsoff');
const offAria = (def: GearDef, c: Control, as: GearSettings) =>
  available(c, as.channel) ? '' : ', not used on the ' + chName(def, as.channel) + ' channel';

function Knob({ def, as, c, x, y }: { def: GearDef; as: GearSettings; c: RangeControl; x: number; y: number }) {
  const v = num(as.global[c.key]),
    o = off(c, as);
  return (
    <>
      <span class={'fsplate' + o} style={{ left: x + 'px', top: y + 'px' }}>
        {c.label}
      </span>
      <div class={'fsk' + o} style={{ left: x + 'px', top: y + 'px' }}>
        <KnobControl
          c={c}
          n={null}
          value={v}
          label={
            nice(c.label) +
            (c.channels ? ' (' + c.channels.map((n) => chName(def, n)).join(' and ') + ')' : ' (rear panel)') +
            offAria(def, c, as)
          }
          size={40}
        >
          <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
            <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 20 20)`}>
              <circle cx="20" cy="20" r="11.5" fill="#eef1f3" stroke="#56646c" stroke-width="1.2" />
              <path
                d="M20 1.5 L25 20 L20 31 L15 20 Z"
                fill="#fbfcfc"
                stroke="#56646c"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
              <path d="M20 4 L20 15" stroke="#1e2a30" stroke-width="1.5" stroke-linecap="round" />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
    </>
  );
}

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const n = as.channel;
  return (
    <div class="fsrack" role="group" aria-label="Bogner Fish front panel">
      <span class="fsears" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {SELECT.map(([m, name, x, y, arrow]) => {
        const on = m === n;
        return (
          <ChannelButton
            id={scope.prefix + 'fs-ch-' + m}
            class={'fssel' + (on ? ' on' : '') + (arrow === '◀' ? ' rev' : '')}
            style={{ left: x + 'px', top: y + 'px' }}
            aria-pressed={on}
            aria-label={chName(def, m) + ' channel' + (on ? ', selected' : '')}
            n={m}
          >
            {arrow === '◀' ? arrow + ' ' + name : name + ' ' + arrow}
          </ChannelButton>
        );
      })}
      {LEDS.map(([m, x, y]) => (
        <span
          class="fsled"
          style={{ left: x + 'px', top: y + 'px', ...(m === n ? { borderTopColor: LIT[m] } : {}) }}
          aria-hidden="true"
        />
      ))}
      {KNOBS.map(([k, x, y]) => {
        const c = maybeCtl(def, k);
        return c ? <Knob def={def} as={as} c={c} x={x} y={y} /> : null;
      })}
      {TOGGLES.map(([k, x, aria, pos]) => {
        const c = ctl<SwitchControl>(def, k);
        return (
          <div class={'fstgl' + off(c, as)}>
            <Toggle
              x={x}
              y={108}
              options={c.options}
              current={as.global[k]}
              control={c}
              aria={aria + offAria(def, c, as)}
              labelPos={pos}
            />
          </div>
        );
      })}
      <span class="fsname" aria-hidden="true">
        BOGNER<span>ALL TUBE PRE-AMP.</span>
      </span>
      {maybeCtl(def, 'presence') ? <span class="fsrear">REAR PANEL</span> : null}
    </div>
  );
}

/** Rack units: the Fish (and the Simul-Class 2:Ninety it was captured through, stacked under it). */
export function FishPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="txcab">
      <Face def={def} as={as} />
      {def.panel === 'fish290' ? <Simul290 def={def} as={as} /> : null}
    </Cab>
  );
}
