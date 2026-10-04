// Interface icons (stroke icons in the text colour).
import type { SVGAttributes } from 'preact';

type Props = { size?: number };
const stroke = (size: number, extra: SVGAttributes<SVGSVGElement> = {}) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round' as const,
  'aria-hidden': 'true' as const,
  ...extra,
});

/** Chevron (class "chev"): down for dropdowns, right into a level, left back out. */
export const Chevron = ({ d }: { d: string }) => (
  <svg class="chev" {...stroke(14, { 'stroke-linejoin': 'round' })}>
    <path d={d} />
  </svg>
);
export const CHEV_DOWN = 'M6 9l6 6 6-6',
  CHEV_RIGHT = 'M9 6l6 6-6 6',
  CHEV_LEFT = 'M15 6l-6 6 6 6';

export const CloseIcon = ({ size = 14, width = '2' }: Props & { width?: string }) => (
  <svg {...stroke(size, { 'stroke-width': width })}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const ResetIcon = () => (
  <svg {...stroke(14, { 'stroke-linejoin': 'round' })}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);
export const SlidersIcon = () => (
  <svg {...stroke(20)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const InfoIcon = () => (
  <svg {...stroke(20)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5h.01" />
  </svg>
);
export const LoadIcon = () => (
  <svg {...stroke(14, { 'stroke-linejoin': 'round' })}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const ExternalIcon = () => (
  <svg {...stroke(13, { 'stroke-linejoin': 'round' })}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

/** A power tube (6L6: straight glass with a domed top, micas and plate inside, bakelite base, octal pins
 *  round the key post) or a 12AX7 (round top, twin plates, 9-pin miniature leads); both on their pins. */
export const TubeIcon = ({ power }: { power: boolean }) => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {power ? (
      <>
        <path d="M7 15.2V6.6a5 5 0 0 1 10 0v8.6" />
        <path d="M7.6 6.4h8.8M7.6 13.4h8.8" stroke-width="1" />
        <rect x="9.6" y="7.4" width="4.8" height="5.2" rx=".4" stroke-width="1.1" />
        <path d="M6.4 15.2h11.2v2.2l-1 1.8H7.4l-1-1.8z" fill="currentColor" />
        <path d="M8.7 19.2v3M10.3 19.2v3.3M13.7 19.2v3.3M15.3 19.2v3" stroke-width="1.1" />
        <path d="M12 19.2v4" stroke-width="2.2" stroke-linecap="butt" />
      </>
    ) : (
      <>
        <path d="M7.6 17.5V8.6a4.4 4.4 0 0 1 8.8 0v8.9z" />
        <path d="M12 4.2V2.6" />
        <path d="M9.9 9.5v5.5M14.1 9.5v5.5" />
        <path d="M8.8 17.5V21.5M10.4 17.5V22M12 17.5V22M13.6 17.5V22M15.2 17.5V21.5" stroke-width="1.1" />
      </>
    )}
  </svg>
);
