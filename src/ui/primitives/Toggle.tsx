// Lever switches (all panels): a recessed slot with the lever tip at the chosen end or in the middle,
// like the mini toggles on a Bogner. Flat fills, thin outlines. A Toggle is the lever plus its printed
// position labels; the labels pick a position, the lever steps to the next one.
import type { ControlValue, SwitchControl, SwitchOption } from '../../../shared/schema';
import { ChannelButton, CycleButton, PickButton } from './controls';
import { chAttr, useScope } from './scope';

export type LeverPos = 'up' | 'mid' | 'down';
export const posFor = (idx: number, count: number): LeverPos => (idx === 0 ? 'up' : idx === count - 1 ? 'down' : 'mid');

export function Lever({ pos, horizontal }: { pos: LeverPos; horizontal?: boolean }) {
  const at = pos === 'up' ? 0 : pos === 'down' ? 2 : 1;
  const W = horizontal ? 32 : 22,
    H = horizontal ? 20 : 32;
  const cx = horizontal ? [9, 16, 23][at]! : 11,
    cy = horizontal ? 10 : [9, 16, 23][at]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {horizontal ? (
        <rect x="3" y="4" width="26" height="12" rx="6" fill="#070707" stroke="#6e6e6e" stroke-width="1.2" />
      ) : (
        <rect x="5" y="3" width="12" height="26" rx="6" fill="#070707" stroke="#6e6e6e" stroke-width="1.2" />
      )}
      {/* the lever's shaft leans from the slot's centre towards the tip (hidden when it's straight) */}
      {at === 1 ? null : (
        <path d={`M${W / 2} ${H / 2} L${cx} ${cy}`} stroke="#3c3c3c" stroke-width="3" stroke-linecap="round" />
      )}
      <circle cx={cx} cy={cy} r="4" fill="#e2e2e2" stroke="#7a7a7a" stroke-width="1" />
      <circle cx={cx - 1} cy={cy - 1} r="1.4" fill="#fafafa" />
    </svg>
  );
}

interface Point {
  x: number;
  y: number;
}
const at = (p: Point) => ({ left: p.x + 'px', top: p.y + 'px' });

/** A toggle placed on a fixed-size panel: the lever at (x, y) and its position labels at labelPos.
 *  It sets a control (target) or the channel (channel). */
export function Toggle({
  x,
  y,
  options,
  current,
  control,
  n = null,
  channel,
  aria,
  labelPos,
  title,
  titleY,
}: {
  x: number;
  y: number;
  options: SwitchOption[];
  current: ControlValue | null | undefined;
  /** the switch it sets (omit for the channel selector) */
  control?: SwitchControl;
  n?: number | null;
  channel?: boolean;
  aria: string;
  labelPos: Point[];
  title?: string;
  titleY?: number;
}) {
  const scope = useScope();
  const idx = Math.max(
    0,
    options.findIndex((o) => o.v === current),
  );
  const targetId = channel ? 'channel' : control!.key + '-' + chAttr(n);
  const lever = <Lever pos={posFor(idx, options.length)} />;
  return (
    <>
      <div class="pos" style={at({ x, y })}>
        {channel ? (
          <ChannelButton class="togbtn" tabIndex={-1} aria-hidden="true" cycle>
            {lever}
          </ChannelButton>
        ) : (
          <CycleButton
            class="togbtn"
            tabIndex={-1}
            aria-hidden="true"
            c={control!}
            n={n}
            current={current ?? undefined}
          >
            {lever}
          </CycleButton>
        )}
      </div>
      {options.map((o, i) =>
        channel ? (
          <ChannelButton
            key={i}
            id={scope.prefix + 't-' + targetId + '-' + i}
            class="tlbl pos"
            style={at(labelPos[i]!)}
            aria-pressed={o.v === current}
            aria-label={aria + ': ' + o.label}
            n={o.v as number}
            pick
          >
            {o.label}
          </ChannelButton>
        ) : (
          <PickButton
            key={i}
            id={scope.prefix + 't-' + targetId + '-' + i}
            class="tlbl pos"
            style={at(labelPos[i]!)}
            aria-pressed={o.v === current}
            aria-label={aria + ': ' + o.label}
            c={control!}
            n={n}
            v={o.v}
          >
            {o.label}
          </PickButton>
        ),
      )}
      {title ? (
        <span class="silk pos" style={at({ x, y: titleY! })}>
          {title}
        </span>
      ) : null}
    </>
  );
}
