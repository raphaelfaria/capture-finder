// The stage header: the gear's name with its pills, then the channel tabs, the header menus and Reset (or,
// while editing weights, Reset weights and Done).
import { chainShort } from '../../domain/chains';
import { channelLabel } from '../../domain/channels';
import { multiCh } from '../../domain/controls';
import { useStore } from '../context';
import { CloseIcon, ResetIcon } from '../primitives/icons';
import { HeaderMenu } from './HeaderMenu';

function ChannelTabs() {
  const store = useStore();
  const def = store.baseDef.value,
    ch = store.channel.value;
  return (
    <div role="group" aria-label="Channel" class="chtabs">
      {def.channels!.map((c) => (
        <button
          id={'tab-' + c.n}
          class="chtab sm"
          aria-pressed={c.n === ch}
          data-act="channel"
          data-n={c.n}
          onClick={() => store.setChannel(c.n)}
        >
          <span class={'led' + (c.n === ch ? ' lit' : '')} aria-hidden="true" />
          <span class="cond" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '.04em' }}>
            {def.panel === 'generic' ? channelLabel(def, c.n) : 'Ch ' + c.n}
          </span>
          {def.panel === 'generic' ? null : <span style={{ fontSize: '12px', color: '#c9c1b3' }}>{c.name}</span>}
        </button>
      ))}
    </div>
  );
}

export function StageHead() {
  const store = useStore();
  const s = store.state.value,
    def = store.baseDef.value,
    chain = store.chain.value;
  const chainItems = store.menuItems('chain'),
    useItems = store.menuItems('usedin');
  // TriAxis modes (LED matrix) and Hot Rod channels (CHANNEL SELECT) are picked on the panel, not with
  // tabs. (The Fish keeps the tabs too: its printed channel labels alone are hard to read as selectors.)
  const tabs = multiCh(def) && !/^triaxis/.test(def.panel) && def.panel !== 'hotrod';
  return (
    <div class="stagehead">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 10px', flexWrap: 'wrap', minWidth: 0 }}>
        <h1
          class="cond"
          style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '.02em', lineHeight: 1.1 }}
        >
          {def.brand + ' ' + def.model}
        </h1>
        {!def.channels && (def.category || 'Amps') === 'Amps' ? (
          <span class="tagpill" style={{ borderStyle: 'solid' }}>
            Single channel
          </span>
        ) : def.channels && !multiCh(def) ? (
          <span class="tagpill" style={{ borderStyle: 'solid' }}>
            {'Recorded ' + channelLabel(def, def.channels[0]!.n)}
          </span>
        ) : null}
        {s.weightsOpen ? (
          <span class="tagpill wtpill" role="status">
            Editing matching weights · 0 = not matched
          </span>
        ) : null}
        {s.loaded && s.loaded.amp === def.id ? (
          <span class="tagpill loadpill">
            {'Loaded from ' + s.loaded.name}
            <button
              id="unload"
              data-act="unload"
              aria-label={'Dismiss: loaded from ' + s.loaded.name}
              onClick={() => {
                store.unload();
                document.getElementById('reset')?.focus();
              }}
            >
              <CloseIcon size={12} width="2.4" />
            </button>
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {tabs ? <ChannelTabs /> : null}
        {chainItems.length > 1 || chain.length ? (
          <HeaderMenu
            kind="chain"
            label="Pedals"
            value={chain.length ? chainShort(chain, store.catalog.gearById) : 'None'}
            items={chainItems}
            aria="Pedals with the gear (in front, or in its effects loop)"
          />
        ) : null}
        {useItems.length ? (
          <HeaderMenu
            kind="usedin"
            label="Used with"
            value={useItems.length + ' ' + (useItems.length === 1 ? 'amp' : 'amps')}
            items={useItems}
            aria={def.model + ' is used with'}
          />
        ) : null}
        {s.weightsOpen ? (
          // while editing weights, Reset (settings) gives way to the weight buttons
          <>
            <button
              id="wt-reset"
              class="btn sm"
              data-act="w-reset"
              disabled={!s.weights[def.id]}
              onClick={() => store.resetWeights()}
            >
              Reset weights
            </button>
            <button
              id="wt-done"
              class="btn sm amber"
              data-act="weights"
              onClick={() => {
                store.toggleWeights();
                requestAnimationFrame(() => document.getElementById('wt-btn')?.focus());
              }}
            >
              Done
            </button>
          </>
        ) : (
          <button id="reset" class="btn sm" data-act="reset" onClick={() => store.reset()}>
            <ResetIcon />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
