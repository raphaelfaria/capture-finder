// @vitest-environment jsdom
// Every panel renders for every gear, and every matched control can be set on it.
import { render } from '@testing-library/preact';
import { describe, expect, test } from 'vitest';
import { gearScope } from '../../src/ui/panels/scopes';
import { GearPanel } from '../../src/ui/panels/registry';
import { CabContext } from '../../src/ui/panels/shared';
import { ScopeContext } from '../../src/ui/primitives/scope';
import { available } from '../../src/domain/controls';
import { catalog, storeOn } from '../unit/fixtures';

const gearIds = () =>
  catalog()
    .allDefs.filter((d) => d.controls.length)
    .map((d) => d.id);

function drawn(id: string) {
  const def = catalog().gearById(id)!;
  const store = storeOn();
  const as = { ...JSON.parse(JSON.stringify(def.defaults)) };
  const { container, unmount } = render(
    <ScopeContext.Provider value={gearScope(store, def, as)}>
      <CabContext.Provider value={{ chainPedal: false, weightEdit: false }}>
        <GearPanel def={def} as={as} compact={false} />
      </CabContext.Provider>
    </ScopeContext.Provider>,
  );
  return { def, container, unmount };
}

describe('panel registry', () => {
  test.each(gearIds())('%s: draws without invalid positions or values', (id) => {
    const { container, unmount } = drawn(id);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.querySelector('.cab')).not.toBeNull();
    unmount();
  });

  test.each(gearIds())('%s: every matched control has an element to set it', (id) => {
    const { def, container, unmount } = drawn(id);
    const n = def.defaults.channel;
    const missing = def.controls
      .filter((c) => c.weight > 0 && available(c, n))
      .filter((c) => !container.querySelector(`[data-ctrl="${c.key}"],[data-key="${c.key}"],[data-switch="${c.key}"]`))
      .map((c) => c.key);
    expect(missing).toEqual([]);
    unmount();
  });
});
