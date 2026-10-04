// Headless checks for one gear's panel (custom or generic): the deep link opens it, every control changes
// state from the keyboard or its buttons (and re-ranks when matched), dragging a knob works, the details
// drawer opens, tap targets, no horizontal scrolling at 390px, and no console errors. Exits non-zero on a
// failure.
// Usage: npm run verify:gear -- <gearId>   (builds the legacy-test app first: it exposes the app's state to
// the checks; see src/testing/legacyBridge.tsx). Uses the installed Google Chrome (CHROME_PATH overrides).
/* eslint-disable @typescript-eslint/no-explicit-any -- the checks read the page's test globals */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT } from './lib/paths';

declare const state: any, cur: any, getVal: any, ctrlByKey: any, optionsFor: any, setChannel: any;
const require = createRequire(import.meta.url);
const { serve } = require('../tests/legacy/server.cjs') as {
  serve: (root: string) => Promise<{ url: string; close: () => Promise<void> }>;
};
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core') as typeof import('playwright-core');

const ampId = process.argv[2];
if (!ampId) {
  console.error('usage: npm run verify:gear -- <gearId>');
  process.exit(2);
}
const ok = (m: string) => console.log('  ok  ' + m);

async function main() {
  const server = await serve(path.join(ROOT, 'dist-legacy'));
  const url = (q = '') => server.url + q;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const ready = () => page.waitForFunction(() => (window as any).CF_READY === true);

    // 1. deep link opens the gear, the panel renders
    await page.goto(url('?amp=' + ampId));
    await ready();
    assert.equal(await page.evaluate(() => state.amp), ampId);
    ok('?amp=' + ampId + ' opens the gear');
    const def = await page.evaluate(() => JSON.parse(JSON.stringify(cur().def)));
    assert.ok(await page.locator('.cab').count(), 'cabinet rendered');
    ok('cabinet rendered');
    await page.locator('#info-btn').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'info-close');
    assert.match(
      await page.locator('#info-pop').innerText(),
      /Visual reference only — nothing here controls a physical amp/,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#info-pop'));
    ok('visual-reference note present in the (i) popover');
    assert.doesNotMatch(await page.locator('body').innerText(), /DEMO/);
    ok('no DEMO text');
    // One primary control per channel (gear with a gain knob per channel has one per channel).
    const primaryFor = (n: number | null) =>
      def.controls.filter((c: any) => c.primary && (!c.channels || n === null || c.channels.includes(n))).length;
    const perChannel = (def.channels || [{ n: null }]).map((ch: any) => primaryFor(ch.n));
    if (def.panel === 'generic' && perChannel.every((p: number) => p === 0))
      console.log('  warn no primary control (generic gear: inferred from captures)');
    else {
      assert.ok(
        perChannel.every((p: number) => p === 1),
        'primaries per channel: ' + perChannel.join(','),
      );
      ok('exactly one primary control per channel');
    }
    assert.ok(def.controls.every((c: any) => typeof c.weight === 'number'));
    ok('every control has a weight');

    // 2. every control changes state and (if weighted) re-ranks / re-scores
    const ranking = () => page.evaluate(() => document.getElementById('results')!.innerText);
    for (const c of def.controls) {
      await page.evaluate(() => document.getElementById('reset')!.click());
      await page.waitForTimeout(60);
      // Controls limited to some channels/modes are tested in the first one they apply to.
      if (c.channels && def.channels) {
        await page.evaluate((m) => setChannel(m), c.channels[0]);
        await page.waitForTimeout(60);
      }
      const n = def.channels ? await page.evaluate(() => cur().as.channel) : null;
      const before = await ranking();
      const value = () =>
        page.evaluate(([k, ch]) => getVal(cur().def, cur().as, ctrlByKey(k), ch), [c.key, n] as const);
      // Ids end in the channel only for channel-scoped controls; global ones end in '-'.
      const sel =
        c.kind === 'switch'
          ? null
          : (c.kind === 'fader' ? '#f-' : '#k-') + c.key + '-' + (c.scope === 'channel' ? (n ?? '') : '');
      if (sel) {
        const start = await value();
        await page.locator(sel).press(start >= (c.min + c.max) / 2 ? 'Home' : 'End');
        await page.waitForTimeout(60);
        assert.notEqual(await value(), start, c.key + ' changed state via keyboard');
        assert.equal(
          await page.evaluate(() => document.activeElement!.id),
          sel.slice(1),
          c.key + ' keeps focus after re-render',
        );
      } else {
        const cur0 = await value();
        // only the positions this channel offers, picked on this channel's own buttons
        const offered = await page.evaluate(([k, ch]) => optionsFor(ctrlByKey(k), ch).map((o: any) => o.v), [
          c.key,
          n,
        ] as const);
        const other = offered.find((v: unknown) => v !== cur0);
        if (other === undefined) continue; // a switch with a single position on this channel has nothing to change to
        const chKey = c.scope === 'channel' ? String(n ?? '') : null; // global controls: any button
        const picked = await page.evaluate(
          ([k, v, ch]) => {
            const b = [...document.querySelectorAll<HTMLElement>('[data-act=pick][data-key="' + k + '"]')].find(
              (x) =>
                x.dataset.v === JSON.stringify(v) && (ch === null || x.dataset.ch === undefined || x.dataset.ch === ch),
            );
            if (b) {
              b.click();
              return true;
            }
            const s = document.querySelector<HTMLSelectElement>('[data-switch="' + k + '"]');
            if (s) {
              s.value = v as string;
              s.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          },
          [c.key, other, chKey] as const,
        );
        assert.ok(picked, c.key + ' has a clickable control');
        await page.waitForTimeout(60);
        assert.equal(await value(), other, c.key + ' changed state');
      }
      if (c.weight > 0 && before === (await ranking()))
        console.log('  warn ' + c.key + ': results text unchanged (fine only if no captures state it)');
    }
    ok('every control changes state (keyboard/click) and keeps focus');

    // 3. dragging (after Reset has re-rendered)
    await page.evaluate(() => document.getElementById('reset')!.click());
    await page.waitForTimeout(80);
    // the gear's own knobs, not a pedal in front of it (pedals may be scrolled out of view)
    const knob = page.locator('#stage .cab:not(.chainpedal) [data-drag=knob]').first();
    if (await knob.count()) {
      const key = await knob.getAttribute('data-ctrl'),
        ch = await knob.getAttribute('data-ch');
      const at = () =>
        page.evaluate(([k, c]) => getVal(cur().def, cur().as, ctrlByKey(k), c === '' ? null : Number(c)), [
          key,
          ch,
        ] as const);
      const v0 = await at();
      const b = (await knob.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      // drag towards the side with room (up raises the value; a knob at its maximum is dragged down)
      const room = await page.evaluate((k) => {
        const c = ctrlByKey(k);
        return c.min + c.max;
      }, key);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (v0 * 2 >= room ? 40 : -40), { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(80);
      assert.notEqual(await at(), v0);
      ok('knob drag changes ' + key);
    }

    // 4. detail drawer
    const open = page.locator('[data-act=open]').first();
    if (await open.count()) {
      await open.click();
      await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'drawer-close');
      assert.ok(((await page.locator('.drawer').textContent()) || '').length > 10);
      ok('drawer opens');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.drawer'));
    } else console.log('  warn no captures to open (no results for this gear)');

    // 5. tap targets
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#stage button')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width && (r.height < 24 || r.width < 24) && !b.getAttribute('aria-hidden');
        })
        .map((b) => b.id || b.className),
    );
    if (small.length) console.log('  warn small targets (<24px, check ≥40px on touch via padding):', small.join(', '));

    // 6. 390px: no horizontal scroll
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(url('?amp=' + ampId));
    await ready();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, 'horizontal overflow at 390px: ' + over + 'px');
    ok('no horizontal scroll at 390px');

    // 7. existing custom panels still render
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const id of ['jp2c', 'marshall-jcm800-1987']) {
      await page.goto(url('?amp=' + id));
      await ready();
      assert.equal(await page.evaluate(() => state.amp), id);
      assert.ok(await page.locator('.cab').count());
    }
    ok('JP-2C and JCM800 1987 still render');

    assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
    ok('no console errors');
    console.log('PASS');
  } catch (e) {
    console.error('FAIL', (e as Error).message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main();
