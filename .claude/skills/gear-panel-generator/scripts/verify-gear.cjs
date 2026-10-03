// Usage (repo root, after npm install): npm run verify:gear -- <gearId>
// Uses playwright-core with the installed Google Chrome; override with CHROME_PATH or PLAYWRIGHT_MODULE.
// Headless checks for a gear panel (custom or generic). Exits non-zero on failure.
const assert = require('node:assert/strict');
const path = require('node:path');
// The app fetches its data, so it is served over http (npx http-server via tests/server.cjs, as on GitHub Pages).
const { serve } = require(path.join(process.cwd(), 'tests/server.cjs'));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const ampId = process.argv[2];
if (!ampId) { console.error('usage: verify-gear.cjs <gearId>'); process.exit(2); }
let base = '';
const url = (q) => base + (q || '');
const ok = (m) => console.log('  ok  ' + m);

(async () => {
  const server = await serve(process.cwd());
  base = server.url;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // 1. deep link opens the amp, panel renders
    await page.goto(url('?amp=' + ampId)); await page.waitForFunction(() => window.CF_READY === true);
    assert.equal(await page.evaluate(() => state.amp), ampId); ok('?amp=' + ampId + ' opens the amp');
    const def = await page.evaluate(() => JSON.parse(JSON.stringify(cur().def)));
    assert.ok(await page.locator('.cab').count(), 'cabinet rendered'); ok('cabinet rendered');
    await page.locator('#info-btn').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'info-close');
    assert.match(await page.locator('#info-pop').innerText(), /Visual reference only — nothing here controls a physical amp/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#info-pop'));
    ok('visual-reference note present in the (i) popover');
    assert.doesNotMatch(await page.locator('body').innerText(), /DEMO/); ok('no DEMO text');
    // One primary control per channel (gear with a gain knob per channel has one per channel).
    const primaryFor = (n) => def.controls.filter(c => c.primary && (!c.channels || n === null || c.channels.includes(n))).length;
    const perChannel = (def.channels || [{ n:null }]).map(ch => primaryFor(ch.n));
    if (def.panel === 'generic' && perChannel.every(p => p === 0)) console.log('  warn no primary control (generic gear: inferred from captures)');
    else { assert.ok(perChannel.every(p => p === 1), 'primaries per channel: ' + perChannel.join(',')); ok('exactly one primary control per channel'); }
    assert.ok(def.controls.every(c => typeof c.weight === 'number')); ok('every control has a weight');

    // 2. every control changes state and (if weighted) re-ranks / re-scores
    const ranking = () => page.evaluate(() => document.getElementById('results').innerText);
    for (const c of def.controls) {
      await page.evaluate(() => document.getElementById('reset').click());
      await page.waitForTimeout(60);
      // Controls limited to some channels/modes are tested in the first one they apply to.
      if (c.channels && def.channels) { await page.evaluate((m) => setChannel(m), c.channels[0]); await page.waitForTimeout(60); }
      const n = def.channels ? await page.evaluate(() => cur().as.channel) : null;
      const before = await ranking();
      // Ids end in the channel only for channel-scoped controls; global ones end in '-'.
      const sel = c.kind === 'switch' ? null : (c.kind === 'fader' ? '#f-' : '#k-') + c.key + '-' + (c.scope === 'channel' ? (n ?? '') : '');
      if (sel) {
        const start = await page.evaluate(([k, ch]) => getVal(cur().def, cur().as, ctrlByKey(k), ch), [c.key, n]);
        await page.locator(sel).press(start >= (c.min + c.max) / 2 ? 'Home' : 'End');
        await page.waitForTimeout(60);
        const now = await page.evaluate(([k, ch]) => getVal(cur().def, cur().as, ctrlByKey(k), ch), [c.key, n]);
        assert.notEqual(now, start, c.key + ' changed state via keyboard');
        assert.equal(await page.evaluate(() => document.activeElement.id), sel.slice(1), c.key + ' keeps focus after re-render');
      } else {
        const cur0 = await page.evaluate(([k, ch]) => getVal(cur().def, cur().as, ctrlByKey(k), ch), [c.key, n]);
        const other = c.options.find(o => o.v !== cur0);
        if (!other) continue; // a switch with a single recorded option has nothing to change to
        const picked = await page.evaluate(([k, v]) => { const b = [...document.querySelectorAll('[data-act=pick][data-key="' + k + '"]')].find(x => x.dataset.v === JSON.stringify(v)); if (b) { b.click(); return true; } const s = document.querySelector('[data-switch="' + k + '"]'); if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return true; } return false; }, [c.key, other.v]);
        assert.ok(picked, c.key + ' has a clickable control');
        await page.waitForTimeout(60);
        assert.equal(await page.evaluate(([k, ch]) => getVal(cur().def, cur().as, ctrlByKey(k), ch), [c.key, n]), other.v, c.key + ' changed state');
      }
      if (c.weight > 0) {
        const after = await ranking();
        if (before === after) console.log('  warn ' + c.key + ': results text unchanged (fine only if no captures state it)');
      }
    }
    ok('every control changes state (keyboard/click) and keeps focus');

    // 3. dragging (wait for the re-render after Reset, or the element may be detached mid-measure)
    await page.evaluate(() => document.getElementById('reset').click());
    await page.waitForTimeout(80);
    const knob = page.locator('[data-drag=knob]').first();
    if (await knob.count()) {
      const key = await knob.getAttribute('data-ctrl'), ch = await knob.getAttribute('data-ch');
      const v0 = await page.evaluate(([k, c]) => getVal(cur().def, cur().as, ctrlByKey(k), c === '' ? null : Number(c)), [key, ch]);
      const b = await knob.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 40, { steps: 4 }); await page.mouse.up();
      await page.waitForTimeout(80);
      const v1 = await page.evaluate(([k, c]) => getVal(cur().def, cur().as, ctrlByKey(k), c === '' ? null : Number(c)), [key, ch]);
      assert.notEqual(v1, v0); ok('knob drag changes ' + key);
    }

    // 4. detail drawer
    const open = page.locator('[data-act=open]').first();
    if (await open.count()) {
      await open.click();
      await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'drawer-close');
      assert.ok((await page.locator('.drawer').textContent()).length > 10); ok('drawer opens');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.drawer'));
    } else console.log('  warn no captures to open (no results for this amp)');

    // 5. tap targets
    const small = await page.evaluate(() => [...document.querySelectorAll('#stage button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 24 || r.width < 24) && !b.getAttribute('aria-hidden'); }).map(b => b.id || b.className));
    if (small.length) console.log('  warn small targets (<24px, check ≥40px on touch via padding):', small.join(', '));

    // 6. 390px: no horizontal scroll
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(url('?amp=' + ampId)); await page.waitForFunction(() => window.CF_READY === true);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, 'horizontal overflow at 390px: ' + over + 'px'); ok('no horizontal scroll at 390px');

    // 7. existing custom amps still render
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const id of ['jp2c', 'marshall-jcm800-1987']) {
      await page.goto(url('?amp=' + id)); await page.waitForFunction(() => window.CF_READY === true);
      assert.equal(await page.evaluate(() => state.amp), id);
      assert.ok(await page.locator('.cab').count());
    }
    ok('JP-2C and JCM800 1987 still render');

    assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | ')); ok('no console errors');
    console.log('PASS');
  } catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
  finally { await browser.close(); await server.close(); }
})();
