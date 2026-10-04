// @vitest-environment jsdom
// Panel control primitives: keyboard input, pointer drags, double-click back to the starting value,
// position buttons, levers, and a pedal's scope (its own values, no channel switching).
import { fireEvent, render } from '@testing-library/preact';
import { useComputed } from '@preact/signals';
import { describe, expect, test } from 'vitest';
import type { Store } from '../../src/state/store';
import { gearScope, pedalScope } from '../../src/ui/panels/scopes';
import { GearPanel } from '../../src/ui/panels/registry';
import { CabContext } from '../../src/ui/panels/shared';
import { ScopeContext } from '../../src/ui/primitives/scope';
import { capture, storeOn } from '../unit/fixtures';

/** The gear on the store's bench, kept in step with the store like the stage does. */
function Bench({ store }: { store: Store }) {
  const def = useComputed(() => store.def.value).value,
    as = useComputed(() => store.settings.value).value;
  return (
    <ScopeContext.Provider value={gearScope(store, def, as)}>
      <CabContext.Provider value={{ chainPedal: false, weightEdit: false }}>
        <GearPanel def={def} as={as} compact={false} />
      </CabContext.Provider>
    </ScopeContext.Provider>
  );
}
const g = (s: Store, k: string) => s.settings.value.global[k];

describe('knobs', () => {
  test('arrow keys on the range input set the value (snapped to the step)', () => {
    const s = storeOn('marshall-jcm800-1987');
    const { container } = render(<Bench store={s} />);
    const input = container.querySelector<HTMLInputElement>('#k-volumeI-')!;
    input.value = '3.14';
    fireEvent.input(input);
    expect(g(s, 'volumeI')).toBe(3.1);
  });
  test('dragging up raises the value; double-click returns to the start', () => {
    const s = storeOn('marshall-jcm800-1987');
    const start = g(s, 'volumeI') as number;
    const { container } = render(<Bench store={s} />);
    const knob = container.querySelector<HTMLElement>('[data-drag=knob][data-ctrl=volumeI]')!;
    fireEvent.pointerDown(knob, { clientY: 200, button: 0 });
    fireEvent.pointerMove(window, { clientY: 200 - 28 });
    fireEvent.pointerUp(window);
    expect(g(s, 'volumeI')).toBeCloseTo(Math.min(10, start + 2), 5);
    fireEvent.pointerMove(window, { clientY: 0 }); // released: no longer follows
    expect(g(s, 'volumeI')).toBeCloseTo(Math.min(10, start + 2), 5);
    fireEvent.dblClick(knob);
    expect(g(s, 'volumeI')).toBe(start);
  });
});

describe('buttons', () => {
  test('a jack picks its position; the patch route list sets its switch', () => {
    const s = storeOn('marshall-jcm800-1987');
    const { container } = render(<Bench store={s} />);
    const jack = [...container.querySelectorAll<HTMLButtonElement>('.jjack')].find(
      (b) => b.getAttribute('aria-pressed') === 'false',
    )!;
    fireEvent.click(jack);
    expect(jack.id).toBe('jack-' + g(s, 'input'));
    const select = container.querySelector<HTMLSelectElement>('#patch-route')!;
    select.value = 'none';
    fireEvent.change(select);
    expect(g(s, 'patchcable')).toBe('none');
  });
  test('a lever steps through its positions; its labels pick one', () => {
    const s = storeOn('mesa-boogie-mark2c');
    const { container } = render(<Bench store={s} />);
    const before = g(s, 'powermode');
    fireEvent.click(container.querySelector('[data-act=cycle][data-key=powermode]')!);
    expect(g(s, 'powermode')).not.toBe(before);
    fireEvent.click(container.querySelector('#t-powermode--0')!);
    const pm = s.def.value.controls.find((c) => c.key === 'powermode')!;
    expect(pm.kind === 'switch' && g(s, 'powermode') === pm.options[0]!.v).toBe(true);
  });
  test('channel selectors on the panel pick the channel', () => {
    const s = storeOn('jp2c');
    const { container } = render(<Bench store={s} />);
    fireEvent.click(container.querySelector('#cs-1')!);
    expect(s.channel.value).toBe(1);
    fireEvent.click(container.querySelector('#t-channel-2')!);
    expect(s.channel.value).toBe(3);
  });
});

describe('pedal scope', () => {
  test('a pedal writes its own values under prefixed ids, and never switches the gear channel', () => {
    const s = storeOn('bogner-uberschall-first-edition');
    s.loadCapture(capture('Bogna Uber 3').id);
    const p = s.chain.value[0]!,
      d = s.catalog.gearById(p.id!)!,
      scope = pedalScope(s, 0, d, p);
    const { container } = render(
      <ScopeContext.Provider value={scope}>
        <CabContext.Provider value={{ chainPedal: true, weightEdit: false }}>
          <GearPanel def={d} as={scope.settings} compact />
        </CabContext.Provider>
      </ScopeContext.Provider>,
    );
    expect(container.querySelector('.cab')!.className).toBe('cab chainpedal bbcab');
    const input = container.querySelector<HTMLInputElement>('#p0\\:k-gain-')!;
    expect(input.dataset.ctrl).toBe('p0:gain');
    input.value = '7';
    fireEvent.input(input);
    expect(s.chain.value[0]!.values!.gain).toBe(7);
    expect(s.settings.value.global.gain).toBe(8); // the amp's own Gain is untouched
  });
});
