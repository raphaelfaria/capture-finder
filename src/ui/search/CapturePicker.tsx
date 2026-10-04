// The capture picker: browse Category › Instrument › Gear › Capture, or search every capture by name or
// gear. Picking a capture loads its settings (or opens its details when it has none).
import { memo } from 'preact/compat';
import { captureChannelLabel } from '../../domain/channels';
import { multiCh } from '../../domain/controls';
import type { CaptureRow } from '../../data/pickers';
import { useStore } from '../context';
import { TypeBadge } from '../results/parts';
import { Combobox } from './Combobox';
import { BackOption, DrillOption, GroupHead, GroupSub } from './rows';

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

/** One capture option (memoised: moving the highlight re-renders only the two rows that change). */
const CaptureOption = memo(function CaptureOption({
  item,
  active,
  inGear,
  onPick,
}: {
  item: CaptureRow;
  active: boolean;
  inGear: boolean;
  onPick: (id: string) => void;
}) {
  const { c, a } = item.e;
  const meta = [
    inGear ? null : a ? a.brand + ' ' + a.model : 'Unmapped',
    a && multiCh(a) && c.settings ? captureChannelLabel(a, c) : null,
    'gain ' + c.gainType,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      id={'cap-opt-' + c.id}
      class={'ampopt capopt' + (active ? ' active' : '')}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      data-act="cap"
      data-id={c.id}
      onClick={() => onPick(c.id)}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexGrow: 1, minWidth: 0 }}>
        <span class="capname">
          <span style={{ fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' }}>{c.name}</span>
          <TypeBadge c={c} />
        </span>
        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{meta}</span>
      </span>
      {c.settings && c.ampId ? <span class="ctag">Load</span> : <span class="ctag none">No settings</span>}
    </button>
  );
});

export function CapturePicker() {
  const store = useStore();
  const p = store.state.value.capturePicker;
  const list = p.open ? store.captureRows.value : [];
  const active = Math.min(p.active, list.length - 1);
  const row = active >= 0 ? list[active] : undefined;
  const activeId = !row
    ? null
    : row.kind === 'cap'
      ? 'cap-opt-' + row.e.c.id
      : row.kind === 'back'
        ? 'cap-back'
        : 'cap-drill-' + row.key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // inside a gear's level the gear name is already in the back row
  const inGear = p.path.length === 3;
  let last: string | null = null,
    lastInst: string | null = null;
  return (
    <Combobox
      which="capture"
      inputId="capq"
      listId="cap-listbox"
      listLabel="Captures"
      listClass="amppop cappop"
      srLabel="Find a capture by name or amp"
      placeholder="Find a capture"
      icon={<SearchIcon />}
      activeId={activeId}
    >
      {!list.length ? (
        <div style={{ padding: '10px', fontSize: '13px', color: '#c9c1b3' }}>No captures match that search.</div>
      ) : null}
      {list.map((item, i) => {
        if (item.kind === 'drill') return <DrillOption which="capture" e={item} active={i === active} />;
        if (item.kind === 'back')
          return <BackOption which="capture" path={p.path} active={i === active} catalog={store.catalog} />;
        const { cat, inst } = item.e;
        const heads = [];
        if (item.grouped && cat !== last) {
          heads.push(<GroupHead label={cat} />);
          last = cat;
          lastInst = null;
        }
        if (item.grouped && inst !== lastInst) {
          heads.push(<GroupSub label={inst} />);
          lastInst = inst;
        }
        return (
          <>
            {heads}
            <CaptureOption
              key={item.e.c.id}
              item={item}
              active={i === active}
              inGear={!item.grouped && inGear}
              onPick={store.loadCapture}
            />
          </>
        );
      })}
    </Combobox>
  );
}
