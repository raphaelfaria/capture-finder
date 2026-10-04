// Rows shared by both pickers: a level that opens the next one, the back row with the current path, and
// the category / instrument headers of search results.
import { pathLabel, type DrillRow } from '../../data/pickers';
import type { Catalog } from '../../data/catalog';
import type { PickerKind } from '../../state/store';
import { useStore } from '../context';
import { CHEV_LEFT, CHEV_RIGHT, Chevron } from '../primitives/icons';

export const prefixOf = (which: PickerKind) => (which === 'gear' ? 'gear' : 'cap');
const keyId = (k: string) =>
  String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

export function DrillOption({ which, e, active }: { which: PickerKind; e: DrillRow; active: boolean }) {
  const store = useStore();
  const prefix = prefixOf(which);
  return (
    <button
      id={prefix + '-drill-' + keyId(e.key)}
      class={'ampopt' + (active ? ' active' : '')}
      role="option"
      tabIndex={-1}
      aria-selected={which === 'capture' && active}
      aria-label={e.label + ', ' + e.count + (prefix === 'cap' ? ' captures' : ' items')}
      data-act={prefix + '-drill'}
      data-key={e.key}
      onClick={() => store.stepPicker(which, e)}
    >
      <span
        class="cond"
        style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '.03em', lineHeight: 1.1, flexGrow: 1 }}
      >
        {e.label}
      </span>
      <span style={{ fontSize: '11.5px', color: 'var(--dim)' }}>{e.count}</span>
      <Chevron d={CHEV_RIGHT} />
    </button>
  );
}

export function BackOption({
  which,
  path,
  active,
  catalog,
}: {
  which: PickerKind;
  path: string[];
  active: boolean;
  catalog: Catalog;
}) {
  const store = useStore();
  const prefix = prefixOf(which);
  const crumbs = path.map((k) => pathLabel(catalog, k)),
    up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : 'all categories';
  return (
    <button
      id={prefix + '-back'}
      class={'ampopt' + (active ? ' active' : '')}
      role="option"
      tabIndex={-1}
      aria-selected={which === 'capture' && active}
      aria-label={'Back to ' + up + ' (now ' + crumbs.join(' › ') + ')'}
      data-act={prefix + '-back'}
      onClick={() => store.stepPicker(which, { kind: 'back' })}
    >
      <Chevron d={CHEV_LEFT} />
      <span class="crumbs">
        {crumbs.map((c, i) => (
          <>
            {i ? <span aria-hidden="true">›</span> : null}
            <span class={i === crumbs.length - 1 ? 'here' : undefined}>{c}</span>
          </>
        ))}
      </span>
    </button>
  );
}

export const GroupHead = ({ label }: { label: string }) => (
  <div class="gearhead" role="presentation">
    {label}
  </div>
);
export const GroupSub = ({ label }: { label: string }) => (
  <div class="gearsub" role="presentation">
    {label}
  </div>
);

/** Keep the highlighted option in view inside the scrolling list. */
export function scrollIntoList(pop: HTMLElement, opt: HTMLElement) {
  if (opt.offsetTop < pop.scrollTop) pop.scrollTop = opt.offsetTop;
  else if (opt.offsetTop + opt.offsetHeight > pop.scrollTop + pop.clientHeight)
    pop.scrollTop = opt.offsetTop + opt.offsetHeight - pop.clientHeight;
}
