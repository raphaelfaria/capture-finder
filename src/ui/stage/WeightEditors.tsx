// Matching weights: while editing, the panel is dimmed and locked, and one editor floats over each drawn
// control (per channel when a control is drawn once per channel), centred over the elements the panel
// marks with that control's key: a small value pill whose − / + show on hover or focus. An editor that
// would cover another moves just below or above it. Type a weight (Enter or leaving the field applies it),
// or step it with ↑/↓ or − / + (Shift: ten steps); Escape ends editing.
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { channelLabel } from '../../domain/channels';
import { multiCh } from '../../domain/controls';
import { f1, nice } from '../../domain/format';
import { W_MAX, W_STEP } from '../../domain/weights';
import { useStore } from '../context';

interface Spot {
  key: string;
  ch: string;
  x: number;
  y: number;
}

/** Where each control's editor goes, from the drawn panel inside the bench. */
function place(bench: HTMLElement, keys: string[]): Spot[] {
  const cab = bench.querySelector('.cab:not(.chainpedal)');
  if (!cab) return [];
  const base = bench.getBoundingClientRect();
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches,
    PW = coarse ? 38 : 34,
    PH = coarse ? 36 : 26;
  const placed: { x: number; y: number }[] = [];
  const free = (x: number, y: number) => placed.every((p) => Math.abs(p.x - x) >= PW || Math.abs(p.y - y) >= PH);
  const spot = (x: number, y: number) => {
    for (let k = 0; k < 6; k++)
      for (const s of k ? [1, -1] : [0]) {
        const yy = y + s * k * PH;
        if (free(x, yy)) return yy;
      }
    return y;
  };
  const out: Spot[] = [];
  keys.forEach((key) => {
    const groups = new Map<string, { l: number; t: number; r: number; b: number }>();
    cab.querySelectorAll<HTMLElement>('[data-ctrl="' + key + '"],[data-key="' + key + '"]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const ch = e.dataset.ch || '',
        g = groups.get(ch);
      groups.set(
        ch,
        g
          ? { l: Math.min(g.l, r.left), t: Math.min(g.t, r.top), r: Math.max(g.r, r.right), b: Math.max(g.b, r.bottom) }
          : { l: r.left, t: r.top, r: r.right, b: r.bottom },
      );
    });
    groups.forEach((g, ch) => {
      const x = (g.l + g.r) / 2 - base.left,
        y = spot(x, (g.t + g.b) / 2 - base.top);
      placed.push({ x, y });
      out.push({ key, ch, x, y });
    });
  });
  return out;
}

export function WeightEditors({ bench }: { bench: RefObject<HTMLDivElement | null> }) {
  const store = useStore();
  const def = store.def.value,
    base = store.baseDef.value;
  const [spots, setSpots] = useState<Spot[]>([]);
  const [tick, setTick] = useState(0);
  // re-place after every render of the bench, and when the window or the chain row moves things
  useLayoutEffect(() => {
    if (!bench.current) return;
    const next = place(
      bench.current,
      def.controls.map((c) => c.key),
    );
    if (JSON.stringify(next) !== JSON.stringify(spots)) setSpots(next);
  });
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    const row = bench.current?.querySelector('.chainrow');
    window.addEventListener('resize', again);
    row?.addEventListener('scroll', again, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      const s = store.state.peek();
      if (e.key === 'Escape' && s.weightsOpen && !s.openId && !s.infoOpen) {
        e.preventDefault();
        store.closeWeights();
        requestAnimationFrame(() => document.getElementById('wt-btn')?.focus());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', again);
      row?.removeEventListener('scroll', again);
      document.removeEventListener('keydown', onKey);
    };
  }, [bench, store]);
  void tick;
  return (
    <div class="wlayer">
      {spots.map(({ key, ch, x, y }) => {
        const c = def.controls.find((k) => k.key === key)!,
          w = c.weight,
          w0 = base.controls.find((k) => k.key === key)!.weight;
        const id = 'w-' + key + '-' + ch,
          label = nice(c.label) + (ch && multiCh(def) ? ' (' + channelLabel(def, Number(ch)) + ')' : '');
        const shown = w === 0 ? '0' : f1(w);
        return (
          <div
            class={'wed' + (w === 0 ? ' zero' : w !== w0 ? ' edited' : '')}
            role="group"
            aria-label={label + ' weight'}
            title={label}
            style={{ left: x.toFixed(1) + 'px', top: y.toFixed(1) + 'px' }}
          >
            <button
              id={id + '-dec'}
              class="wbtn"
              data-act="w-step"
              data-key={key}
              data-d="-1"
              aria-label={'Lower ' + label + ' weight'}
              disabled={w <= 0}
              onClick={(e) => store.stepWeight(key, -1, e.shiftKey)}
            >
              −
            </button>
            <input
              id={id}
              class="wval"
              type="text"
              inputMode="decimal"
              value={shown}
              data-wkey={key}
              aria-label={label + ' weight, 0 to ' + W_MAX + '; 0 means not matched'}
              onChange={(e) => {
                const t = e.currentTarget,
                  v = parseFloat(String(t.value).replace(',', '.'));
                if (isFinite(v)) store.setWeight(key, v);
                else t.value = shown;
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  store.setWeight(key, w + (e.key === 'ArrowUp' ? 1 : -1) * W_STEP * (e.shiftKey ? 10 : 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                  e.currentTarget.focus();
                }
              }}
            />
            <button
              id={id + '-inc'}
              class="wbtn"
              data-act="w-step"
              data-key={key}
              data-d="1"
              aria-label={'Raise ' + label + ' weight'}
              disabled={w >= W_MAX}
              onClick={(e) => store.stepWeight(key, 1, e.shiftKey)}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
