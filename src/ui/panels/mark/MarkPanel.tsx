// Mesa/Boogie Mark IIC+ (also the Mark III, panel 'markiii': PULL RHYTHM 2 on Middle, the EQ AUTO / IN
// toggle, a dark EQ plate): the black faceplate above the grille (the Boogie logo plate and the input
// jacks are left out), in three fixed-size sections that wrap on narrow screens: the seven knobs
// (VOLUME 1 … LEAD MASTER), the five-band slider EQ, and the recorded rear-panel controls (PRESENCE and
// the SIMUL-CLASS / CLASS A switch) where the EQ, standby and power switches sit. The numbers are on each
// knob's skirt and turn under the printed index line, so the value is the number at the top; the PULL
// labels on either side of the line are the pull switches. Lead Drive, Lead Master and its Pull Bright
// only count with Pull Lead on, so they are dimmed (still adjustable) while it's off.
import type { Control, GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { f1, nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { FaderTrack, KnobControl, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Toggle } from '../../primitives/Toggle';
import { Cab, FaderInput, ctl, maybeCtl, num, type PanelProps } from '../shared';

const KNOBS: [string, number, string, string][] = [
  ['volume', 34, 'pullbright1', 'BRIGHT'],
  ['treble', 102, 'pullshifttreble', 'SHIFT'],
  ['bass', 170, 'pullshiftbass', 'SHIFT'],
  ['middle', 238, 'pullrhythm2', 'RHYTHM2'],
  ['master1', 306, 'pulldeep', 'DEEP'],
  ['leaddrive', 374, 'pulllead', 'LEAD'],
  ['leadmaster', 442, 'pullbright2', 'BRIGHT'],
];
const EQ = ['eq80', 'eq240', 'eq750', 'eq2200', 'eq6600'];
const TRAVEL = 70; // fader cap top: 0 at 10 … 70 at 0, in an 80px track (FADER_GEOMETRY.mk)
// skirt numbers 0…10 counter-clockwise from the top, each facing outwards (as printed on the knob)
const Numbers = () => (
  <>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
      <text
        transform={`rotate(${-30 * v} 25 25)`}
        x="25"
        y="8.6"
        text-anchor="middle"
        font-size={v === 10 ? 6 : 7}
        font-family="Barlow Semi Condensed,Arial Narrow,sans-serif"
        font-weight="600"
        fill="#e9e1c6"
      >
        {v}
      </text>
    ))}
  </>
);
const isOff = (as: GearSettings, c: Control) => !!c.requires && as.global[c.requires] !== true;

function Knob({
  def,
  as,
  c,
  x,
  pullKey,
  word,
  tickTop,
  extraAria,
}: {
  def: GearDef;
  as: GearSettings;
  c: RangeControl;
  x: number;
  pullKey: string | null;
  word: string;
  tickTop: number;
  extraAria?: string;
}) {
  const scope = useScope();
  const g = as.global,
    v = num(g[c.key]),
    off = isOff(as, c) ? ' mkoff' : '',
    note = (extraAria || '') + (off ? ', not used while Pull Lead is off' : '');
  const pc = pullKey ? maybeCtl<SwitchControl>(def, pullKey) : undefined,
    pulled = !!pc && g[pullKey!] === true;
  const turn = (((v - c.min) / (c.max - c.min)) * 300).toFixed(1);
  return (
    <>
      <span
        class="mkidx"
        style={{ left: x + 'px', top: tickTop + 'px', height: 35 - tickTop + 'px' }}
        aria-hidden="true"
      />
      {pc ? (
        <PickButton
          id={scope.prefix + 'p-' + pullKey + '-'}
          class={'mkpull' + (isOff(as, pc) ? ' mkoff' : '')}
          style={{ left: x + 'px' }}
          aria-pressed={pulled}
          aria-label={
            pc.label +
            ': ' +
            (pulled ? 'pulled, on' : 'pushed in, off') +
            (isOff(as, pc) ? ', not used while Pull Lead is off' : '')
          }
          c={pc}
          n={null}
          v={!pulled}
        >
          <span class="mkpl">
            <span class="pdot" aria-hidden="true" />
            PULL
          </span>
          <span class={'mkpr' + (word.length > 6 ? ' long' : '')}>{word}</span>
        </PickButton>
      ) : null}
      <div class={'mkk' + off + (pulled ? ' pulled' : '')} style={{ left: x + 'px' }}>
        <KnobControl c={c} n={null} value={v} label={nice(c.label) + note} size={50}>
          <svg viewBox="0 0 50 50" width="50" height="50" aria-hidden="true">
            <g transform={`rotate(${turn} 25 25)`}>
              <circle cx="25" cy="25" r="24" fill="#111" stroke="#2f2f2f" stroke-width="1" />
              <Numbers />
              <circle
                cx="25"
                cy="25"
                r="13.5"
                fill="#0a0a0a"
                stroke="#3a3a3a"
                stroke-width="2"
                stroke-dasharray="1.3 1.3"
              />
              <circle cx="25" cy="25" r="10" fill="#0d0d0d" stroke="#1f1f1f" stroke-width="1" />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
      <span class={'mklab' + off} style={{ left: x + 'px' }}>
        {c.label}
      </span>
    </>
  );
}

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const g = as.global;
  const eq = maybeCtl<SwitchControl>(def, 'eqmode'),
    pm = maybeCtl<SwitchControl>(def, 'powermode'),
    px = eq ? 104 : 40;
  return (
    <div
      class={'mkface' + (def.panel === 'markiii' ? ' m3' : '')}
      role="group"
      aria-label={def.brand + ' ' + def.model + ' front panel'}
    >
      <div class="mksec" style={{ width: '476px' }}>
        <span class="mkbar" aria-hidden="true" />
        {KNOBS.map(([k, x, pull, word]) => (
          <Knob def={def} as={as} c={ctl(def, k)} x={x} pullKey={pull} word={word} tickTop={0} />
        ))}
      </div>
      <div class="mksec" style={{ width: '186px' }} role="group" aria-label="Graphic EQ">
        <span class="mkeqplate" aria-hidden="true">
          <i style={{ top: '22px' }} />
          <i style={{ top: '45px' }} />
          <i style={{ top: '68px' }} />
        </span>
        {EQ.map((k, i) => {
          const c = ctl(def, k),
            v = num(g[k]),
            x = 27 + 33 * i,
            top = (1 - (v - c.min) / (c.max - c.min)) * TRAVEL;
          return (
            <>
              <label class="mkf" style={{ left: x - 11 + 'px' }}>
                <FaderInput c={c} n={null} value={v} prefix="EQ " />
                <FaderTrack class="mktrack" c={c} n={null} value={v} geo="mk">
                  <span class="mkslot" />
                  <span class="fcap mkcap" style={{ top: top.toFixed(1) + 'px' }} />
                </FaderTrack>
              </label>
              <span class="mkfreq" style={{ left: x + 'px' }}>
                {c.label.replace('Hz', '')}
              </span>
              <span class="ro mkfro" style={{ left: x + 'px' }} aria-hidden="true">
                {f1(v)}
              </span>
            </>
          );
        })}
      </div>
      {/* right of the EQ: the EQ AUTO / IN toggle where the amp has it (when recorded), then the recorded
          rear-panel controls (Presence, Simul-Class / Class A) where the standby and power switches sit */}
      <div class="mksec" style={{ width: '160px' }}>
        {eq ? (
          <Toggle
            x={28}
            y={58}
            options={eq.options}
            current={g.eqmode}
            control={eq}
            aria="EQ auto or in"
            labelPos={[
              { x: 28, y: 31 },
              { x: 28, y: 85 },
            ]}
          />
        ) : null}
        <Knob
          def={def}
          as={as}
          c={ctl(def, 'presence')}
          x={px}
          pullKey={null}
          word=""
          tickTop={26}
          extraAria=" (rear panel)"
        />
        {pm ? (
          <Toggle
            x={118}
            y={58}
            options={pm.options}
            current={g.powermode}
            control={pm}
            aria="Simul-Class or Class A (rear panel)"
            labelPos={[
              { x: 118, y: 31 },
              { x: 118, y: 85 },
            ]}
          />
        ) : null}
        <span class="mkrear" style={{ left: px - 34 + 'px' }}>
          REAR PANEL
        </span>
        <span class="mkname">{'MESA/BOOGIE ' + def.model.toUpperCase()}</span>
      </div>
    </div>
  );
}

/** Amp head: the faceplate above the grille (the logo plate is left out). */
export function MarkPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="mkcab">
      <Face def={def} as={as} />
      <div class="mkgrille" aria-hidden="true" />
    </Cab>
  );
}
