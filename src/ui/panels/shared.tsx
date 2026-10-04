// Pieces shared by several panels: the cabinet wrapper, the standard knob, faders' inputs, rack ears
// and the Simul-Class 2:Ninety power amp face (stacked under the racks captured through it).
import { createContext, type ComponentChildren, type CSSProperties } from 'preact';
import { useContext } from 'preact/hooks';
import type { GearDef, RangeControl, SwitchControl } from '../../../shared/schema';
import { knobAngle } from '../../domain/controls';
import { f1, nice } from '../../domain/format';
import type { GearSettings } from '../../domain/types';
import { KnobControl, PickButton, RangeInput, Readout } from '../primitives/controls';
import { ctlId, useScope } from '../primitives/scope';

/** What every panel gets: the gear's definition and settings; `compact` when drawn in a chain. */
export interface PanelProps {
  def: GearDef;
  as: GearSettings;
  compact: boolean;
}

/** How the cabinet is shown: as a pedal in a chain, and/or locked while weights are edited. */
export interface CabMode {
  chainPedal: boolean;
  weightEdit: boolean;
}
export const CabContext = createContext<CabMode>({ chainPedal: false, weightEdit: false });

/** The drawn gear's outer box ("cab"), with its look (`variant`, e.g. "mtcab"). */
export function Cab({ variant, children }: { variant?: string; children: ComponentChildren }) {
  const { chainPedal, weightEdit } = useContext(CabContext);
  const cls = (weightEdit ? 'wedit ' : '') + 'cab' + (chainPedal ? ' chainpedal' : '') + (variant ? ' ' + variant : '');
  return weightEdit ? (
    <div inert class={cls}>
      {children}
    </div>
  ) : (
    <div class={cls}>{children}</div>
  );
}

/** A control by key (the definition must have it). */
export const ctl = <T extends RangeControl | SwitchControl = RangeControl>(def: GearDef, key: string): T => {
  const c = def.controls.find((x) => x.key === key);
  if (!c) throw new Error(def.id + ' has no control ' + key);
  return c as T;
};
/** A control by key, or undefined (definitions that only have some of a faceplate's controls). */
export const maybeCtl = <T extends RangeControl | SwitchControl = RangeControl>(
  def: GearDef,
  key: string,
): T | undefined => def.controls.find((x) => x.key === key) as T | undefined;

/** A value's number (knob values are numbers). */
export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

// ---------- the standard black knob (JP-2C, generic panels, 3+SE) ----------
export const KNOB_PATH = (function () {
  const N = 180,
    lobes = 10,
    R = 28.6,
    depth = 1.9;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI,
      r = R - depth * (0.5 + 0.5 * Math.cos(lobes * t));
    d += (i ? 'L' : 'M') + (30 + r * Math.sin(t)).toFixed(2) + ' ' + (30 - r * Math.cos(t)).toFixed(2);
  }
  return d + 'Z';
})();

export const KnobSVG = ({ angle }: { angle: number }) => (
  <svg viewBox="0 0 60 60" width="56" height="56" aria-hidden="true">
    <g transform={`rotate(${angle.toFixed(1)} 30 30)`}>
      <path d={KNOB_PATH} fill="#0e0e0e" stroke="#333" stroke-width="1" />
      <circle cx="30" cy="30" r="18" fill="#090909" stroke="#262626" stroke-width="1" />
      <path d="M30 24 L30 5" stroke="#f2f2f2" stroke-width="2.8" stroke-linecap="round" />
    </g>
  </svg>
);

/** The standard knob with its readout, in a 56px box. */
export function KnobBox({
  c,
  n,
  value,
  prefix,
  extraClass = '',
  style,
}: {
  c: RangeControl;
  n: number | null;
  value: number;
  prefix: string;
  extraClass?: string;
  style?: CSSProperties;
}) {
  return (
    <div class={'knobbox' + extraClass} style={style}>
      <KnobControl
        c={c}
        n={n}
        value={value}
        label={prefix + nice(c.label) + (c.weight > 0 ? '' : ' (not used for matching)')}
      >
        <KnobSVG angle={knobAngle(c, value)} />
      </KnobControl>
      <Readout v={value} />
    </div>
  );
}

/** A fader's hidden range input (its label names the band; the center position is announced). */
export const FaderInput = ({
  c,
  n,
  value,
  prefix,
}: {
  c: RangeControl;
  n: number | null;
  value: number;
  prefix: string;
}) => (
  <RangeInput
    c={c}
    n={n}
    value={value}
    kind="fader"
    label={prefix + c.label}
    valueText={f1(value) + ' of ' + c.max + (value === (c.min + c.max) / 2 ? ', center' : '')}
  />
);

// ---------- rack units ----------
const Ear = () => (
  <span class="txear" aria-hidden="true">
    <i />
    <i />
  </span>
);
/** A rack unit: ears on both sides of its face. */
export const Rack = ({ label, children }: { label: string; children: ComponentChildren }) => (
  <div class="txrack" role="group" aria-label={label}>
    <Ear />
    <div class="txface">{children}</div>
    <Ear />
  </div>
);

// ---------- Mesa/Boogie Simul-Class 2:Ninety (stacked under the preamps captured through it) ----------
function S290Knob({ c, v, lab }: { c: RangeControl; v: number; lab: string }) {
  return (
    <div class="s9k">
      <KnobControl c={c} n={null} value={v} label={'Power amp ' + nice(lab)}>
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 28 28)`}>
            <circle cx="28" cy="28" r="19" fill="#0e0e0e" stroke="#3c3c3a" stroke-width="1.2" />
            <circle cx="28" cy="28" r="14.5" fill="none" stroke="#262625" stroke-width="1" />
            <path d="M28 11 L28 17" stroke="#e6e3d8" stroke-width="2.4" stroke-linecap="round" />
          </g>
        </svg>
      </KnobControl>
      <span class="s9lab">{lab}</span>
      <Readout v={v} class="jro" />
    </div>
  );
}
const Vent = () => (
  <svg class="s9vent" viewBox="0 0 170 60" width="170" height="60" aria-hidden="true">
    {Array.from({ length: 15 }, (_, i) => (
      <rect x={2 + i * 11.2} y="2" width="6" height="56" rx="3" fill="#050505" />
    ))}
  </svg>
);
const S290_LEDS: [string, string][] = [
  ['deep', 'DEEP'],
  ['halfDrive', '1/2 DRIVE'],
  ['modern', 'MODERN'],
];
/** The Simul-Class 2:Ninety: its DEEP · 1/2 DRIVE · MODERN switches (indicator LEDs), LEVEL and PRESENCE. */
export function Simul290({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const g = as.global;
  return (
    <Rack label="Mesa/Boogie Simul-Class 2:Ninety front panel">
      <div class="s9face">
        <span class="s9title">Mesa/Boogie Stereo Simul-Class 2:Ninety</span>
        <div class="s9row">
          <Vent />
          <div class="s9mid">
            <div class="s9leds" role="group" aria-label="Power amp switches (indicator LEDs)">
              {S290_LEDS.map(([key, lab]) => {
                const on = g[key] === true;
                return (
                  <PickButton
                    id={ctlId(scope, 'p', key, null)}
                    class="s9led"
                    aria-pressed={on}
                    aria-label={nice(lab) + ': ' + (on ? 'on' : 'off')}
                    c={ctl<SwitchControl>(def, key)}
                    n={null}
                    v={!on}
                  >
                    <span class="s9tag">{lab}</span>
                    <span class="s9dot" aria-hidden="true" />
                    <span class="s9st">{on ? 'ON' : 'OFF'}</span>
                  </PickButton>
                );
              })}
            </div>
            <div class="s9knobs">
              <S290Knob c={ctl(def, 'level')} v={num(g.level)} lab="LEVEL" />
              <S290Knob c={ctl(def, 'powerPresence')} v={num(g.powerPresence)} lab="PRESENCE" />
            </div>
          </div>
          <Vent />
        </div>
      </div>
    </Rack>
  );
}
