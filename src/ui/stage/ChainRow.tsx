// The gear with its pedals, in signal order: pedals in front to its left, pedals in its effects loop to its
// right (in an FX LOOP group). One row that scrolls sideways rather than wrapping: a new gear or chain
// starts with the gear centred; otherwise the row keeps its scroll position. Each pedal is drawn with its own
// panel in a compact size, under a link to its own page (pedals only seen in chains have none).
import { useContext, useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ChainItem } from '../../../shared/schema';
import { chainKey } from '../../domain/chains';
import { useStore } from '../context';
import { GearPanel } from '../panels/registry';
import { pedalScope } from '../panels/scopes';
import { CabContext } from '../panels/shared';
import { ScopeContext } from '../primitives/scope';
import { ViewContext } from '../view';

// the gear and chain the row was last centred for (the row element itself keeps its scroll position)
const shown = { key: null as string | null };

function Pedal({ p, i }: { p: ChainItem; i: number }) {
  const store = useStore();
  const d = p.id ? store.catalog.gearById(p.id) : null;
  if (!d)
    return (
      <div class="chainitem">
        <span class="chainlink">{p.name}</span>
        <div class="cab pedalcab chainpedal chainmissing" role="group" aria-label={p.name}>
          <span>{p.name}</span>
          <span class="cmnote">settings not available</span>
        </div>
      </div>
    );
  const scope = pedalScope(store, i, d, p);
  return (
    <div class="chainitem">
      {d.chainOnly ? (
        <span class="chainlink">{d.brand + ' ' + d.model}</span>
      ) : (
        <button
          id={'chain-go-' + i}
          class="chainlink go"
          data-act="amp"
          data-id={d.id}
          aria-label={'Open ' + d.brand + ' ' + d.model}
          onClick={() => store.pickAmp(d.id)}
        >
          {d.brand + ' ' + d.model}
          <span aria-hidden="true"> ↗</span>
        </button>
      )}
      <ScopeContext.Provider value={scope}>
        <CabContext.Provider value={{ chainPedal: true, weightEdit: false }}>
          <GearPanel def={d} as={scope.settings} compact />
        </CabContext.Provider>
      </ScopeContext.Provider>
    </div>
  );
}

const joinArrows = (items: ComponentChildren[]) =>
  items.flatMap((x, i) =>
    i
      ? [
          <span class="chainarrow" aria-hidden="true">
            →
          </span>,
          x,
        ]
      : [x],
  );

export function ChainRow({ gear }: { gear: ComponentChildren }) {
  const store = useStore();
  const viewState = useContext(ViewContext);
  const row = useRef<HTMLDivElement>(null);
  const def = store.baseDef.value,
    chain = store.chain.value,
    weightsOpen = store.state.value.weightsOpen;
  const group = (loop: boolean) =>
    joinArrows(
      chain
        .map((p, i) => [p, i] as const)
        .filter(([p]) => !!p.loop === loop)
        .map(([p, i]) => <Pedal p={p} i={i} />),
    );
  const front = group(false),
    loop = group(true);

  useLayoutEffect(() => {
    const r = row.current;
    if (!r) return;
    const key = def.id + '|' + chainKey(chain);
    if (key !== shown.key) {
      // a new gear or chain opens with the gear centred in the row (as far as the row can scroll)
      const g = r.querySelector('.cab:not(.chainpedal)'),
        rr = r.getBoundingClientRect();
      if (g) {
        const gr = g.getBoundingClientRect();
        r.scrollLeft = Math.max(0, gr.left + gr.width / 2 - rr.left + r.scrollLeft - r.clientWidth / 2);
      }
      shown.key = key;
    }
    // the pedals' width decides the room left for generic gear beside them
    const w = [...r.querySelectorAll('.chainpedals')].reduce((a, p) => a + p.getBoundingClientRect().width + 40, 0);
    if (Math.abs(w - viewState.chainWidth.peek()) > 24) viewState.chainWidth.value = w;
  });

  return (
    <div class="chainrow" ref={row}>
      {front.length ? (
        <>
          <div class="chainpedals" inert={weightsOpen || undefined}>
            {front}
          </div>
          <span class="chainarrow to" aria-hidden="true" />
        </>
      ) : null}
      {gear}
      {loop.length ? (
        <>
          <span class="chainarrow to" aria-hidden="true" />
          <div class="chainloop" role="group" aria-label="Effects loop">
            <span class="chaintag">FX LOOP</span>
            <div class="chainpedals" inert={weightsOpen || undefined}>
              {loop}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
