// Small pieces of capture cards and the drawer.
import type { Capture } from '../../../shared/schema';
import { captureTypeLabel, cloudUrl } from '../../domain/captures';
import type { Reason } from '../../domain/types';
import { ExternalIcon } from '../primitives/icons';

const MARK = { match: '=', near: '≈', off: '≠', none: '–' } as const;
const SAID = { match: 'Same: ', near: 'Close: ', off: 'Different: ', none: 'Not stated: ' } as const;

/** One = / ≈ / ≠ / – mark, with its meaning for screen readers. */
export const Mark = ({ kind }: { kind: Reason['kind'] }) => (
  <span class={'mk ' + kind} aria-hidden="true">
    {MARK[kind]}
  </span>
);
export const markWord = (kind: Reason['kind']) => SAID[kind];

export const Reasons = ({ list }: { list: Reason[] }) => (
  <ul class="reasons">
    {list.map((z) => (
      <li>
        <Mark kind={z.kind} />
        <span>
          <span class="sr">{SAID[z.kind]}</span>
          {z.text}
        </span>
      </li>
    ))}
  </ul>
);

/** The V1 / V2 badge beside a capture's name. */
export function TypeBadge({ c }: { c: Capture }) {
  const label = captureTypeLabel(c),
    v = (label.match(/V\d+$/) || ['V1'])[0];
  return (
    <span class={'ncbadge' + (v === 'V1' ? ' v1' : '')} title={label}>
      <span class="sr">{label.replace(/\s*V\d+$/, '') + ' '}</span>
      {v}
    </span>
  );
}

/** "Cortex Cloud ↗": the capture's page, in a new tab. */
export function CloudLink({ c, id, large }: { c: Capture; id?: string; large?: boolean }) {
  const u = cloudUrl(c);
  return u ? (
    <a
      id={id}
      class={large ? 'btn extlink' : 'btn sm extlink'}
      href={u}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={'Open ' + c.name + ' on Cortex Cloud (opens in a new tab)'}
    >
      Cortex Cloud
      <ExternalIcon />
    </a>
  ) : null;
}
