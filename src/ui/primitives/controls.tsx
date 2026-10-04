// Panel control primitives. Every interactive element of a panel is one of these; they own the
// interaction (keyboard, pointer drag, click, double-click back to the starting value) and write through
// the ControlScope, so panels only describe what the gear looks like.
//
// The data-* attributes (data-ctrl, data-key, data-ch, data-act, data-drag) mark which control an
// element belongs to: the weights editor uses them to place its editors over each control, and they are
// the hooks the browser tests and tools/verify-gear use.
import type { ButtonHTMLAttributes, ComponentChildren, CSSProperties, HTMLAttributes } from 'preact';
import type { Control, ControlValue, RangeControl, SwitchControl } from '../../../shared/schema';
import { optionsFor, snap } from '../../domain/controls';
import { f1 } from '../../domain/format';
import { FADER_GEOMETRY, dragFader, dragKnob, type FaderGeometryName } from './drag';
import { chAttr, ctlId, useScope } from './scope';

type ButtonAttrs = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onClick' | 'onDblClick'>;
type SpanAttrs = Omit<HTMLAttributes<HTMLSpanElement>, 'onPointerDown' | 'onDblClick'>;

/** The control key as written in data attributes (with the pedal prefix). */
const keyAttr = (prefix: string, c: Control) => prefix + c.key;
const focusById = (id: string) => (document.getElementById(id) as HTMLElement | null)?.focus({ preventScroll: true });

/** The screen-reader range input behind a knob or fader (keyboard and assistive tech). */
export function RangeInput({
  c,
  n,
  value,
  kind,
  label,
  valueText,
}: {
  c: RangeControl;
  n: number | null;
  value: number;
  kind: 'knob' | 'fader';
  label: string;
  valueText?: string;
}) {
  const scope = useScope();
  return (
    <input
      id={ctlId(scope, kind === 'knob' ? 'k' : 'f', c.key, n)}
      class={'sr ' + (kind === 'knob' ? 'knob-in' : 'fader-in')}
      type="range"
      min={c.min}
      max={c.max}
      step={c.step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText ?? f1(value) + ' of ' + c.max}
      data-ctrl={keyAttr(scope.prefix, c)}
      data-ch={chAttr(n)}
      onInput={(e) => {
        const v = parseFloat((e.currentTarget as HTMLInputElement).value);
        if (!isNaN(v)) scope.set(c, n, snap(c, v));
      }}
    />
  );
}

/** A knob: the hidden range input and the drawn knob, which turns when dragged up or down. */
export function KnobControl({
  c,
  n,
  value,
  label,
  size,
  labelClass = 'kctl',
  surfaceClass = 'kwrap',
  children,
}: {
  c: RangeControl;
  n: number | null;
  value: number;
  /** aria-label of the input */
  label: string;
  /** width/height of the drawn knob when not the default 56px */
  size?: number;
  labelClass?: string;
  surfaceClass?: string;
  children: ComponentChildren;
}) {
  const scope = useScope();
  const box = size ? { width: size + 'px', height: size + 'px' } : undefined;
  return (
    <label class={labelClass} style={box}>
      <RangeInput c={c} n={n} value={value} kind="knob" label={label} />
      <span
        class={surfaceClass}
        style={box}
        data-drag="knob"
        data-ctrl={keyAttr(scope.prefix, c)}
        data-ch={chAttr(n)}
        onPointerDown={(e) => {
          if (e.button != null && e.button !== 0) return;
          e.preventDefault();
          focusById(ctlId(scope, 'k', c.key, n));
          dragKnob(e, c, value, (v) => scope.set(c, n, v));
        }}
        onDblClick={(e) => {
          e.preventDefault();
          scope.reset(c, n);
        }}
      >
        {children}
      </span>
    </label>
  );
}

/** A fader's track (slot and cap): the cap follows the pointer. */
export function FaderTrack({
  c,
  n,
  value,
  geo,
  children,
  ...rest
}: SpanAttrs & {
  c: RangeControl;
  n: number | null;
  value: number;
  geo: FaderGeometryName;
  children: ComponentChildren;
}) {
  const scope = useScope();
  return (
    <span
      {...rest}
      data-drag="fader"
      data-geo={geo}
      data-ctrl={keyAttr(scope.prefix, c)}
      data-ch={chAttr(n)}
      onPointerDown={(e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        focusById(ctlId(scope, 'f', c.key, n));
        dragFader(e, e.currentTarget, c, FADER_GEOMETRY[geo], value, (v) => scope.set(c, n, v));
      }}
      onDblClick={(e) => {
        e.preventDefault();
        scope.reset(c, n);
      }}
    >
      {children}
    </span>
  );
}

/** A button that sets a control to one value (a switch position, a pull, a jack, a stepped knob…). */
export function PickButton({
  c,
  n,
  v,
  children,
  ...rest
}: ButtonAttrs & { c: Control; n: number | null; v: ControlValue; children?: ComponentChildren }) {
  const scope = useScope();
  return (
    <button
      {...rest}
      data-act="pick"
      data-target="ctrl"
      data-key={keyAttr(scope.prefix, c)}
      data-ch={chAttr(n)}
      data-v={JSON.stringify(v)}
      onClick={() => scope.set(c, n, v)}
      onDblClick={(e) => {
        e.preventDefault();
        scope.reset(c, n);
      }}
    >
      {children}
    </button>
  );
}

/** A button that steps a knob-like value up or down by one step (the TriAxis ◀ ▶ keys). It steps from
 *  the value as it is when pressed, so quick presses add up, and pressing it twice quickly is two steps,
 *  not a double-click back to the starting value. */
export function StepButton({
  c,
  n,
  by,
  children,
  ...rest
}: ButtonAttrs & { c: RangeControl; n: number | null; by: 1 | -1; children?: ComponentChildren }) {
  const scope = useScope();
  return (
    <button
      {...rest}
      data-act="step"
      data-key={keyAttr(scope.prefix, c)}
      data-ch={chAttr(n)}
      data-d={by}
      onClick={() => {
        const v = scope.current(c, n);
        if (typeof v === 'number') scope.set(c, n, snap(c, v + by * c.step));
      }}
    >
      {children}
    </button>
  );
}

/** A button that steps a switch to its next position (the lever of a toggle, a stepped knob's face). */
export function CycleButton({
  c,
  n,
  current,
  children,
  ...rest
}: ButtonAttrs & {
  c: SwitchControl;
  n: number | null;
  current: ControlValue | undefined;
  children?: ComponentChildren;
}) {
  const scope = useScope();
  return (
    <button
      {...rest}
      data-act="cycle"
      data-target="ctrl"
      data-key={keyAttr(scope.prefix, c)}
      data-ch={chAttr(n)}
      onClick={() => {
        const opts = optionsFor(c, n),
          idx = Math.max(
            0,
            opts.findIndex((o) => o.v === current),
          );
        scope.set(c, n, opts[(idx + 1) % opts.length]!.v);
      }}
      onDblClick={(e) => {
        e.preventDefault();
        scope.reset(c, n);
      }}
    >
      {children}
    </button>
  );
}

/** A button that selects a channel: a channel selector (`n`), a position label of a channel toggle
 *  (`n` with `pick`), or the lever that steps to the next channel (`cycle`). */
export function ChannelButton({
  n,
  cycle,
  pick,
  children,
  ...rest
}: ButtonAttrs & { n?: number; cycle?: boolean; pick?: boolean; children?: ComponentChildren }) {
  const scope = useScope();
  const markers = scope.channelLocked
    ? { 'data-act': 'none' }
    : cycle
      ? { 'data-act': 'cycle', 'data-target': 'channel' }
      : pick
        ? { 'data-act': 'pick', 'data-target': 'channel', 'data-v': JSON.stringify(n) }
        : { 'data-act': 'channel', 'data-n': n };
  return (
    <button
      {...rest}
      {...markers}
      onClick={() => {
        if (scope.channelLocked) return;
        if (cycle) scope.cycleChannel();
        else if (n != null) scope.setChannel(n);
      }}
    >
      {children}
    </button>
  );
}

/** A value readout in amber. */
export const Readout = ({
  v,
  class: cls = 'ro',
  style,
}: {
  v: number;
  class?: string;
  style?: CSSProperties | string;
}) => (
  <span class={cls} style={style} aria-hidden="true">
    {f1(v)}
  </span>
);

/** "⊘" before the label of a control that isn't matched (weight 0). */
export const NotMatched = ({ c, style }: { c: Control; style?: string }) =>
  c.weight === 0 ? (
    <span class="nsmark" aria-hidden="true" style={style}>
      ⊘
    </span>
  ) : null;
