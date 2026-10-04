// The gear picker: browse Category › Instrument › Gear, or search every gear by name.
import { multiCh } from '../../domain/controls';
import { useStore } from '../context';
import { CHEV_DOWN } from '../primitives/icons';
import { Combobox } from './Combobox';
import { BackOption, DrillOption, GroupHead, GroupSub } from './rows';

const GearIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 11h.01M10 11h.01M13 11h4" />
  </svg>
);
const Caret = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={CHEV_DOWN} />
  </svg>
);

export function GearPicker() {
  const store = useStore();
  const cat = store.catalog,
    def = store.baseDef.value,
    p = store.state.value.gearPicker;
  const list = p.open ? store.gearRows.value : [];
  const active = Math.min(p.active, Math.max(0, list.length - 1));
  const row = list[active];
  const activeId = !row
    ? null
    : row.kind === 'amp'
      ? 'amp-opt-' + row.a.id
      : row.kind === 'back'
        ? 'gear-back'
        : 'gear-drill-' + row.key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let last: string | null = null,
    lastInst: string | null = null;
  return (
    <Combobox
      which="gear"
      inputId="ampq"
      listId="amp-listbox"
      listLabel="Gear"
      listClass="amppop"
      srLabel="Gear: browse by category or search amps, pedals and more"
      placeholder={def.brand + ' ' + def.model}
      icon={<GearIcon />}
      trailing={<Caret />}
      activeId={activeId}
    >
      {list.map((e, i) => {
        if (e.kind === 'drill') return <DrillOption which="gear" e={e} active={i === active} />;
        if (e.kind === 'back') return <BackOption which="gear" path={p.path} active={i === active} catalog={cat} />;
        const a = e.a,
          c = cat.gearCategory(a),
          inst = cat.gearInstrument(a);
        const heads = [];
        if (e.grouped && c !== last) {
          heads.push(<GroupHead label={c} />);
          last = c;
          lastInst = null;
        }
        if (e.grouped && inst && inst !== lastInst) {
          heads.push(<GroupSub label={inst} />);
          lastInst = inst;
        }
        const n = cat.capturesFor(a).length;
        return (
          <>
            {heads}
            <button
              id={'amp-opt-' + a.id}
              class={'ampopt' + (i === active ? ' active' : '')}
              role="option"
              tabIndex={-1}
              aria-selected={a.id === def.id}
              {...(e.grouped && inst ? { 'aria-label': c + ', ' + inst + ': ' + a.brand + ' ' + a.model } : {})}
              data-act="amp"
              data-id={a.id}
              onClick={() => store.pickAmp(a.id)}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexGrow: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{a.brand}</span>
                <span
                  class="cond"
                  style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '.03em', lineHeight: 1.1 }}
                >
                  {a.model}
                </span>
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--dim)', textAlign: 'right' }}>
                {(a.browseOnly
                  ? ''
                  : a.panel === 'marshall1987'
                    ? 'I + II inputs · '
                    : /^triaxis/.test(a.panel)
                      ? '8 modes · '
                      : multiCh(a)
                        ? a.channels!.length + ' recorded ch · '
                        : '') +
                  n +
                  ' captures'}
              </span>
            </button>
          </>
        );
      })}
      {!list.length ? (
        <div style={{ padding: '10px', fontSize: '13px', color: '#c9c1b3' }}>No gear matches that search.</div>
      ) : null}
    </Combobox>
  );
}
