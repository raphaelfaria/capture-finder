// A search field with a popup list (ARIA combobox): focusing opens it and selects the text (searches stay
// in the fields, so typing replaces them), typing filters, keys move and pick (see store.pickerKey), and
// clicking the list doesn't take focus away from the field.
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { PickerKind } from '../../state/store';
import { useStore } from '../context';
import { scrollIntoList } from './rows';

export function Combobox({
  which,
  inputId,
  listId,
  listLabel,
  listClass,
  srLabel,
  placeholder,
  icon,
  trailing,
  activeId,
  children,
}: {
  which: PickerKind;
  inputId: string;
  listId: string;
  listLabel: string;
  listClass: string;
  srLabel: string;
  placeholder?: string;
  icon: ComponentChildren;
  trailing?: ComponentChildren;
  /** id of the highlighted option (aria-activedescendant) */
  activeId: string | null;
  children: ComponentChildren;
}) {
  const store = useStore();
  const p = which === 'gear' ? store.state.value.gearPicker : store.state.value.capturePicker;
  const pop = useRef<HTMLDivElement>(null);
  const lastList = useRef('');
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el || !p.open) return;
    // a new list (query or level) starts at its top
    const listKey = p.query + '\u0001' + p.path.join('\u0001');
    if (which === 'capture' && listKey !== lastList.current) el.scrollTop = 0;
    lastList.current = listKey;
    const opt = activeId ? document.getElementById(activeId) : null;
    if (opt && el.contains(opt)) scrollIntoList(el, opt);
  });
  const select = (input: HTMLInputElement) =>
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.select();
    });
  const keep = (e: Event) => e.preventDefault();
  return (
    <div class="combo">
      <label class="field">
        {icon}
        <span class="sr">{srLabel}</span>
        <input
          id={inputId}
          type="search"
          role="combobox"
          list={undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={p.open}
          {...(activeId && p.open ? { 'aria-activedescendant': activeId } : {})}
          autocomplete="off"
          placeholder={placeholder}
          value={p.query}
          onFocus={(e) => {
            store.openPicker(which);
            select(e.currentTarget);
          }}
          onClick={() => store.openPicker(which)}
          onInput={(e) => store.setQuery(which, e.currentTarget.value)}
          onBlur={() => store.closePicker(which)}
          onKeyDown={(e) => {
            if (store.pickerKey(which, e.key)) e.preventDefault();
          }}
        />
        {trailing}
      </label>
      <div
        id={listId}
        class={listClass}
        role="listbox"
        aria-label={listLabel}
        hidden={!p.open}
        ref={pop}
        onMouseDown={keep}
        onPointerDown={keep}
      >
        {p.open ? children : null}
      </div>
    </div>
  );
}
