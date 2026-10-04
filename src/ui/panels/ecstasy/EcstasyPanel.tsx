// Bogner Ecstasy 100B: the faceplate under a short grille, in three sections that wrap on narrow screens:
// PRESENCE · EXCURSION · M. VOL. (with the rear-panel SOUND STYLE and VARIAC switches where the standby
// switch and jewel light sit), channel 1 (VOL. 1, TREBLE, MIDDLE, BASS, PRE EQ, GAIN 1) and channels 2/3
// (VOL. 3, VOL. 2, GAIN MODE CH 3, shared TREBLE/AIR/MIDDLE/GAIN/BASS, PRE EQ 3, GAIN 3, PRE EQ 2, GAIN 2).
// Cream chicken-head knobs over label plates; the channel LEDs on the VOL/GAIN plates light for the
// selected channel. Every physical knob is its own control, available only on its channel(s); controls
// that don't belong to the selected channel are dimmed (still adjustable). The preamp- and
// power-amp-section entries use the same faceplate: only the sections and controls a definition has are
// drawn (the badge moves next to the power section when channel 1 is absent).
import type { GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { available, knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { CycleButton, KnobControl, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Lever, posFor } from '../../primitives/Toggle';
import { Cab, maybeCtl, num, type PanelProps } from '../shared';

const LED: Record<number, string> = { 1: '#46d24a', 2: '#f2f2f2', 3: '#ff3b30' };
/** [key, x, plate label, LED channel (0: always lit)] */
type KnobSpec = [string, number, string, number?];
/** [key, x, title, position letters, y offset] */
type ToggleSpec = [string, number, string, string[], number?];
interface Section {
  w: number;
  knobs: KnobSpec[];
  toggles: ToggleSpec[];
  rear?: boolean;
  badge?: boolean;
}
const SECTIONS: Section[] = [
  {
    w: 206,
    knobs: [
      ['presence', 112, 'PRESENCE'],
      ['mastervol', 176, 'M. VOL.', 0],
    ],
    toggles: [
      ['excursion', 144, 'EXCURSION', ['L', 'T']],
      ['soundstyle', 30, 'SOUND STYLE', ['OLD', 'NEW']],
      ['variac', 30, 'VARIAC', ['ON', 'OFF'], 52],
    ],
    rear: true,
  },
  {
    w: 316,
    knobs: [
      ['vol1', 31, 'VOL. 1', 1],
      ['treble1', 93, 'TREBLE'],
      ['middle1', 155, 'MIDDLE'],
      ['bass1', 217, 'BASS'],
      ['gain1', 285, 'GAIN 1', 1],
    ],
    toggles: [['preeq1', 251, 'PRE EQ', ['B1', 'N', 'B2']]],
    badge: true,
  },
  {
    w: 440,
    knobs: [
      ['vol3', 31, 'VOL. 3', 3],
      ['vol2', 93, 'VOL. 2', 2],
      ['treble23', 155, 'TREBLE'],
      ['middle23', 217, 'MIDDLE'],
      ['bass23', 279, 'BASS'],
      ['gain3', 341, 'GAIN 3', 3],
      ['gain2', 405, 'GAIN 2', 2],
    ],
    toggles: [
      ['gainmode', 124, 'GAIN MODE CH 3', ['P', 'L']],
      ['air', 186, 'AIR', ['L', 'H']],
      ['gainsw', 248, 'GAIN', ['L', 'H']],
      ['preeq3', 310, 'PRE EQ 3', ['B', 'M', 'D']],
      ['preeq2', 373, 'PRE EQ 2', ['B', 'M', 'D']],
    ],
  },
];
const off = (c: RangeControl | SwitchControl, as: GearSettings) => (available(c, as.channel) ? '' : ' bgoff');
const offAria = (c: RangeControl | SwitchControl, as: GearSettings) =>
  available(c, as.channel) ? '' : ', not used on channel ' + as.channel;

function Knob({ c, as, x, plate, led }: { c: RangeControl; as: GearSettings; x: number; plate: string; led?: number }) {
  const v = num(as.global[c.key]),
    o = off(c, as);
  const aria =
    nice(plate) +
    (c.channels
      ? ' (channel' + (c.channels.length > 1 ? 's ' : ' ') + c.channels.join(' and ') + offAria(c, as) + ')'
      : '');
  const lit = led === 0 ? '#e4c22a' : led && as.channel === led ? LED[led] : null;
  return (
    <>
      <div class={'bgk' + o} style={{ left: x + 'px' }}>
        <KnobControl c={c} n={null} value={v} label={aria} size={44}>
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
            <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 22 22)`}>
              <circle cx="22" cy="22" r="12.5" fill="#e9e5d8" stroke="#8f8b80" stroke-width="1" />
              <path
                d="M22 2.5 L27 22 L22 34 L17 22 Z"
                fill="#f2efe6"
                stroke="#8f8b80"
                stroke-width="1"
                stroke-linejoin="round"
              />
              <path d="M22 5 L22 17" stroke="#2a2a2a" stroke-width="1.6" stroke-linecap="round" />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
      <span class={'bgplate' + o} style={{ left: x + 'px' }}>
        {led !== undefined ? (
          <span
            class="bled"
            aria-hidden="true"
            style={lit ? { background: lit, boxShadow: '0 0 0 1px #555' } : undefined}
          />
        ) : null}
        {plate}
      </span>
    </>
  );
}

/** Mini toggles are horizontal on this amp: the lever leans to the chosen position, the printed letters
 *  under it pick a position. */
function HToggle({
  c,
  as,
  x,
  title,
  letters,
  dy,
}: {
  c: SwitchControl;
  as: GearSettings;
  x: number;
  title: string;
  letters: string[];
  dy?: number;
}) {
  const scope = useScope();
  const v = as.global[c.key],
    n = c.options.length,
    idx = Math.max(
      0,
      c.options.findIndex((o) => o.v === v),
    ),
    y = dy || 0,
    o = off(c, as);
  return (
    <>
      <span class={'bgtitle' + o} style={{ left: x + 'px', top: 4 + y + 'px' }}>
        {title}
      </span>
      <CycleButton
        class={'bgtgl' + o}
        style={{ left: x + 'px', top: 15 + y + 'px' }}
        tabIndex={-1}
        aria-hidden="true"
        c={c}
        n={null}
        current={v}
      >
        <Lever pos={posFor(idx, n)} horizontal />
      </CycleButton>
      {c.options.map((opt, i) => {
        const lx = x + (n === 2 ? (i ? 9 : -9) : (i - 1) * 12);
        return (
          <PickButton
            id={scope.prefix + 't-' + c.key + '--' + i}
            class={'bglet' + o}
            style={{ left: lx + 'px', top: 37 + y + 'px' }}
            aria-pressed={opt.v === v}
            aria-label={nice(title) + ': ' + opt.label + offAria(c, as)}
            c={c}
            n={null}
            v={opt.v}
          >
            {letters[i]}
          </PickButton>
        );
      })}
    </>
  );
}

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const C = (k: string) => maybeCtl(def, k);
  const shown = SECTIONS.filter((sec) => [...sec.knobs, ...sec.toggles].some(([k]) => C(k)));
  const badge = (
    <span class="bgbadge" aria-hidden="true">
      ECSTASY<span>BY</span>BOGNER
    </span>
  );
  return (
    <div class="bgface" role="group" aria-label={def.brand + ' ' + def.model + ' front panel'}>
      {shown.map((sec) => (
        <div class="bgsec" style={{ width: sec.w + 'px' }}>
          {sec.badge ? badge : null}
          {sec.toggles.map(([k, x, title, letters, dy]) => {
            const c = maybeCtl<SwitchControl>(def, k);
            return c ? <HToggle c={c} as={as} x={x} title={title} letters={letters} dy={dy} /> : null;
          })}
          {sec.knobs.map(([k, x, plate, led]) => {
            const c = maybeCtl(def, k);
            return c ? <Knob c={c} as={as} x={x} plate={plate} led={led} /> : null;
          })}
          {sec.rear ? <span class="bgrear">REAR PANEL</span> : null}
        </div>
      ))}
      {!shown.some((sec) => sec.badge) ? (
        <div class="bgsec" style={{ width: '150px' }}>
          {badge}
        </div>
      ) : null}
    </div>
  );
}

/** Amp head: a short grille over the faceplate (the logo artwork is left out). */
export function EcstasyPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="bgcab">
      <div class="bggrille" aria-hidden="true" />
      <Face def={def} as={as} />
    </Cab>
  );
}
