// Mesa/Boogie TriAxis: nine programmable parameters on 2-digit LED displays with ◀ ▶ keys, and eight
// preamp modes (RHY G/Y, LD1 G/Y/R, LD2 G/Y/R) used as channels. Lead drives apply only in their lead
// modes. Optionally followed by the Simul-Class 2:Ninety power amp.
import type { GearDef, RangeControl } from '../../../../shared/schema';
import { available } from '../../../domain/controls';
import { chName } from '../../../domain/channels';
import { f1, nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { ChannelButton, KnobControl, StepButton } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Cab, Rack, Simul290, ctl, num, type PanelProps } from '../shared';

const SEG: Record<string, [number, number, number, number]> = {
  a: [2, 0, 10, 2.4],
  b: [11.6, 2, 2.4, 9],
  c: [11.6, 13, 2.4, 9],
  d: [2, 21.6, 10, 2.4],
  e: [0, 13, 2.4, 9],
  f: [0, 2, 2.4, 9],
  g: [2, 10.8, 10, 2.4],
};
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const MODES: [string, number[]][] = [
  ['RHY', [1, 2]],
  ['LD1', [3, 4, 5]],
  ['LD2', [6, 7, 8]],
];
const LED = ['#3fd24a', '#f2c230', '#ff3b2a']; // green, yellow, red by position in the row

const Digit = ({ d, x, dp }: { d: number; x: number; dp: boolean }) => (
  <g transform={`translate(${x} 1) skewX(-6)`}>
    {Object.keys(SEG).map((k) => {
      const [sx, sy, w, h] = SEG[k]!;
      return <rect x={sx} y={sy} width={w} height={h} rx="1" fill={DIGITS[d]!.includes(k) ? '#ff3b2a' : '#1e0907'} />;
    })}
    <circle cx="16.5" cy="23" r="1.4" fill={dp ? '#ff3b2a' : '#1e0907'} />
  </g>
);
/** A value on the two-digit display ("5.5", "10"). */
function Display({ v }: { v: number }) {
  const t = Math.round(v * 10),
    i = Math.floor(t / 10);
  return (
    <svg viewBox="0 0 38 26" width="46" height="31" aria-hidden="true">
      {i >= 10 ? (
        <>
          <Digit d={1} x={3} dp={false} />
          <Digit d={0} x={21} dp={false} />
        </>
      ) : (
        <>
          <Digit d={i} x={3} dp={true} />
          <Digit d={t % 10} x={21} dp={false} />
        </>
      )}
    </svg>
  );
}

const KEYS: [1 | -1, string, string, string][] = [
  [-1, 'Decrease', 'M10 3 L4 8 L10 13Z', 'dn'],
  [1, 'Increase', 'M6 3 L12 8 L6 13Z', 'up'],
];
function Param({ def, as, c }: { def: GearDef; as: GearSettings; c: RangeControl }) {
  const scope = useScope();
  const n = as.channel,
    v = num(as.global[c.key]),
    on = available(c, n),
    off = on ? '' : ' (not used in ' + chName(def, n) + ')';
  return (
    <div class={'txp' + (on ? '' : ' txoff')}>
      <KnobControl c={c} n={null} value={v} label={nice(c.label) + off} labelClass="txctl" surfaceClass="txdisp">
        <Display v={v} />
      </KnobControl>
      <span class="txlab">{c.label}</span>
      <span class="txkeys">
        {KEYS.map(([d, word, path, id]) => (
          <StepButton
            id={scope.prefix + 'tx-' + id + '-' + c.key}
            class="txkey"
            aria-label={word + ' ' + nice(c.label) + ', now ' + f1(v) + off}
            c={c}
            n={null}
            by={d}
          >
            <span class="txcap">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d={path} fill="#1b1b1a" />
              </svg>
            </span>
          </StepButton>
        ))}
      </span>
      {on ? null : <span class="txna">not in mode</span>}
    </div>
  );
}

function Modes({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const n = as.channel;
  return (
    <div class="txmodes" role="group" aria-label="Preamp mode">
      {MODES.map(([row, ns]) => (
        <>
          <span class="txrow">{row}</span>
          {ns.map((m, i) => {
            const on = m === n;
            return (
              <ChannelButton
                id={scope.prefix + 'mode-' + m}
                class={'txled' + (on ? ' on' : '')}
                style={'--c:' + LED[i]}
                aria-pressed={on}
                aria-label={'Mode ' + chName(def, m)}
                n={m}
              >
                <span class="txdot" aria-hidden="true" />
              </ChannelButton>
            );
          })}
          {ns.length < 3 ? <span /> : null}
        </>
      ))}
      <span class="txnow" aria-hidden="true">
        {'MODE · ' + chName(def, n)}
      </span>
    </div>
  );
}

/** Rack units: no cabinet or grille; the TriAxis sits above the Simul-Class 2:Ninety. */
export function TriaxisPanel({ def, as }: PanelProps) {
  const scope = useScope();
  return (
    <Cab variant="txcab">
      <Rack label="Mesa/Boogie TriAxis front panel">
        <div class="txinner">
          <div class="txparams">
            {def.panelOrder!.map((key) => (
              <Param def={def} as={as} c={ctl(def, key)} />
            ))}
          </div>
          <div class="txside">
            <div class="txname">
              <ChannelButton
                id={scope.prefix + 'tx-modekey'}
                class="txkey"
                aria-label={'Mode: next preamp mode, now ' + chName(def, as.channel)}
                cycle
              >
                <span class="txcap">MODE</span>
              </ChannelButton>
              <span class="txmodel">TRIAXIS</span>
              <span class="txbrand">MESA/BOOGIE</span>
              <span class="txsub">ALL TUBE PREAMPLIFIER</span>
            </div>
            <Modes def={def} as={as} />
          </div>
        </div>
      </Rack>
      {def.panel === 'triaxis290' ? <Simul290 def={def} as={as} /> : null}
    </Cab>
  );
}
