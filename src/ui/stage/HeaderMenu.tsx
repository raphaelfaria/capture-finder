// Header menus: a field-like button and a popup list like the search's (brand, model, count). Used for the
// gear's pedal chains ("Pedals"), the gear a pedal is used with ("Used with") and a preamp's versions.
import type { ComponentChildren, TargetedKeyboardEvent } from 'preact';
import type { MenuKind } from '../../state/appState';
import type { MenuItem } from '../../state/store';
import { useStore } from '../context';
import { CHEV_DOWN, Chevron } from '../primitives/icons';

/** After picking from a menu, focus goes back to its button. */
const refocus = (kind: MenuKind) => requestAnimationFrame(() => document.getElementById(kind + '-btn')?.focus());

/** ↑/↓ open the menu or move in it, Enter or Space picks, Escape closes. */
export function useMenuKeys(kind: MenuKind, items: MenuItem[]) {
  const store = useStore();
  return (e: TargetedKeyboardEvent<HTMLElement>) => {
    const open = store.state.peek().menu === kind;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      store.moveMenu(kind, e.key === 'ArrowDown' ? 1 : -1);
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      const it = items[Math.min(store.state.peek().menuActive, items.length - 1)];
      if (it) {
        store.pickMenu(kind, it.v);
        refocus(kind);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      store.closeMenu();
    }
  };
}

/** The open list of a menu. */
export function MenuList({
  kind,
  items,
  aria,
  class: cls,
}: {
  kind: MenuKind;
  items: MenuItem[];
  aria: string;
  class: string;
}) {
  const store = useStore();
  const active = Math.max(0, Math.min(store.state.value.menuActive, items.length - 1));
  return (
    <div id={kind + '-list'} class={cls} role="listbox" aria-label={aria}>
      {items.map((it, i) => (
        <button
          id={kind + '-opt-' + i}
          class={'ampopt' + (i === active ? ' active' : '')}
          role="option"
          tabIndex={-1}
          aria-selected={!!it.selected}
          data-act="menu-pick"
          data-menu={kind}
          data-v={it.v}
          onClick={() => {
            store.pickMenu(kind, it.v);
            refocus(kind);
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexGrow: 1, minWidth: 0 }}>
            {it.top ? <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{it.top}</span> : null}
            <span
              class="cond"
              style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.15, overflowWrap: 'anywhere' }}
            >
              {it.main}
            </span>
          </span>
          {it.right ? (
            <span style={{ fontSize: '11.5px', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{it.right}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Attributes of a menu's button. */
export function menuButtonProps(kind: MenuKind, open: boolean, active: number) {
  return {
    id: kind + '-btn',
    'aria-haspopup': 'listbox' as const,
    'aria-expanded': open,
    ...(open ? { 'aria-controls': kind + '-list', 'aria-activedescendant': kind + '-opt-' + active } : {}),
    'data-act': 'menu',
    'data-menu': kind,
  };
}

/** A header menu: "<label> <value> ▾" opening its list below. */
export function HeaderMenu({
  kind,
  label,
  value,
  items,
  aria,
}: {
  kind: MenuKind;
  label: string;
  value: string;
  items: MenuItem[];
  aria: string;
  children?: ComponentChildren;
}) {
  const store = useStore();
  const s = store.state.value,
    open = s.menu === kind,
    active = Math.max(0, Math.min(s.menuActive, items.length - 1));
  const onKey = useMenuKeys(kind, items);
  return (
    <div class="hmenu">
      <button
        {...menuButtonProps(kind, open, active)}
        class="field hmenubtn"
        aria-label={aria + ': ' + value}
        onClick={() => store.toggleMenu(kind)}
        onKeyDown={onKey}
      >
        <span class="hmlab">{label}</span>
        <span class="hmval">{value}</span>
        <Chevron d={CHEV_DOWN} />
      </button>
      {open ? <MenuList kind={kind} items={items} aria={aria} class="amppop hmenupop" /> : null}
    </div>
  );
}
