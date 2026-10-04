// The round buttons beside the gear, each with a tooltip: the power amp version (when the preamp has
// one), matching weights, and the (i) matching details.
import { powerAmpOf } from '../../domain/catalog/variants';
import { useStore } from '../context';
import { InfoIcon, SlidersIcon, TubeIcon } from '../primitives/icons';
import { MenuList, menuButtonProps, useMenuKeys } from './HeaderMenu';

/** A preamp ⇄ its power amp version(s): straight to the other version of a two-entry family, or a small
 *  list of the family's entries. A power tube on the preamp, a 12AX7 on a power amp version. */
function VersionButton() {
  const store = useStore();
  const s = store.state.value,
    def = store.baseDef.value,
    fam = store.catalog.family(def);
  const items = store.menuItems('variant');
  const onKey = useMenuKeys('variant', items);
  if (!fam.length) return null;
  const onPower = def !== fam[0],
    name = (d: typeof def) => d.brand + ' ' + d.model;
  if (fam.length === 2) {
    const to = onPower ? fam[0]! : fam[1]!,
      tip = onPower ? 'Preamp only (without the power amp)' : 'With the ' + powerAmpOf(fam, to) + ' power amp';
    return (
      <button
        id="var-btn"
        class="infobtn"
        data-tip={tip}
        aria-label={tip + ': open ' + name(to)}
        data-act="amp"
        data-id={to.id}
        onClick={() => store.pickAmp(to.id)}
      >
        <TubeIcon power={!onPower} />
      </button>
    );
  }
  const open = s.menu === 'variant',
    active = Math.max(0, Math.min(s.menuActive, items.length - 1));
  return (
    <div class="hmenu varmenu">
      <button
        {...menuButtonProps('variant', open, active)}
        class="infobtn varbtn"
        data-tip="Preamp and power amp versions"
        aria-label="Preamp and power amp versions"
        onClick={() => store.toggleMenu('variant')}
        onKeyDown={onKey}
      >
        <TubeIcon power={!onPower} />
      </button>
      {open ? (
        <MenuList kind="variant" items={items} aria="Preamp and power amp versions" class="amppop varpop" />
      ) : null}
    </div>
  );
}

export function BenchActions() {
  const store = useStore();
  const s = store.state.value,
    def = store.baseDef.value,
    custom = !!s.weights[def.id];
  return (
    <div class="infowrap">
      <VersionButton />
      <button
        id="wt-btn"
        class={'infobtn' + (custom ? ' custom' : '')}
        data-tip={s.weightsOpen ? 'Done editing weights' : 'Edit matching weights' + (custom ? ' (edited)' : '')}
        aria-label={'Matching weights' + (custom ? ' (edited for this gear)' : '')}
        aria-pressed={s.weightsOpen}
        data-act="weights"
        onClick={() => {
          const closing = s.weightsOpen;
          store.toggleWeights();
          if (closing) requestAnimationFrame(() => document.getElementById('wt-btn')?.focus());
        }}
      >
        <SlidersIcon />
      </button>
      <button
        id="info-btn"
        class="infobtn"
        data-tip="Matching details and notes"
        aria-label="Matching details and notes"
        aria-haspopup="dialog"
        aria-expanded={s.infoOpen}
        {...(s.infoOpen ? { 'aria-controls': 'info-pop' } : {})}
        data-act="info"
        onClick={() => store.toggleInfo()}
      >
        <InfoIcon />
      </button>
    </div>
  );
}
