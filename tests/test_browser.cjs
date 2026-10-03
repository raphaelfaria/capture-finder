// Browser smoke suite: npm run test:browser (after npm install). Nothing here is needed by
// the deployed page. Uses playwright-core with the installed Google Chrome; override with
// CHROME_PATH=/path/to/chrome or PLAYWRIGHT_MODULE=/path/to/playwright.
const assert = require('node:assert/strict');
const path = require('node:path');
const { serve } = require('./server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const server = await serve(path.join(__dirname, '..'));
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'})});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors = [], external = [];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('request', request=>{if (/^https?:/.test(request.url()) && !/^http:\/\/(?:127\.0\.0\.1|localhost):/.test(request.url())) external.push(request.url());});
    // Served over http as on GitHub Pages; the app fetches its JSON data before starting.
    const url = server.url;
    const go = async (u) => { await page.goto(u); await page.waitForFunction(()=>window.CF_READY === true); };
    const topIs = (name, score) => page.waitForFunction(([n,s])=>{const c=document.querySelector('#results .mcard'); return c && c.querySelector('h3').textContent===n && c.querySelector('.mscore').firstChild.textContent===s;}, [name, String(score)]);
    await go(url);
    assert.match(await page.locator('#count').textContent(), /^160 for this gear · 2190 total$/);
    assert.doesNotMatch(await page.locator('body').innerText(), /DEMO/);

    // Gear picker: an empty field browses in levels — Category › Instrument › Gear — opening on
    // the current gear's category; → or Enter goes in, ← goes back up to the row we came from.
    await page.locator('#ampq').focus();
    await page.waitForFunction(()=>!document.querySelector('#amp-listbox').hidden);
    assert.equal(await page.locator('#amp-listbox [role=option]').count(), await page.evaluate(()=>CATEGORIES.length + 1));
    assert.equal(await page.locator('#amp-listbox .ampopt.active').getAttribute('id'),'gear-drill-amps');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('#gear-back') && document.querySelector('#gear-drill-guitar'));
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#amp-listbox [data-act=gear-drill]')].map(b=>b.dataset.key)), ['Guitar','Bass','Other']);
    assert.match(await page.locator('#gear-back').textContent(), /Amps/);
    assert.equal(await page.locator('#amp-listbox .ampopt.active').getAttribute('id'),'gear-drill-guitar');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>JSON.stringify(state.ampPath)==='["Amps","Guitar"]' && document.querySelector('#amp-listbox [data-act=amp]'));
    assert.match(await page.locator('#gear-back').textContent(), /Amps.*Guitar/);
    const gear = await page.evaluate(()=>[...document.querySelectorAll('#amp-listbox [data-act=amp]')].map(b=>{const d=ampById(b.dataset.id); return [d.brand,d.model,gearCategory(d),gearInstrument(d)];}));
    assert.ok(gear.length > 20 && gear.every(g=>g[2]==='Amps' && g[3]==='Guitar'));
    assert.deepEqual(gear, await page.evaluate(g=>[...g].sort((x,y)=>byName(x[0],y[0])||byName(x[1],y[1])), gear), 'sorted by maker, then name');
    assert.equal(await page.locator('#amp-listbox .gearhead, #amp-listbox .gearsub').count(), 0);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(()=>JSON.stringify(state.ampPath)==='["Amps"]' && document.querySelector('#amp-listbox .ampopt.active')?.id==='gear-drill-guitar');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(()=>!state.ampPath.length && document.querySelector('#amp-listbox .ampopt.active')?.id==='gear-drill-amps');
    await page.locator('#gear-drill-pedals').click();
    await page.waitForFunction(()=>JSON.stringify(state.ampPath)==='["Pedals"]');
    await page.locator('#gear-back').click();
    await page.waitForFunction(()=>!state.ampPath.length);
    // Typing searches everything in one list with category and instrument headers.
    await page.locator('#ampq').fill('lovepedal');
    await page.waitForFunction(()=>[...document.querySelectorAll('#amp-listbox .gearhead')].map(h=>h.textContent).join()==='Fuzz,Overdrive,Pedals');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#amp-listbox').hidden);
    assert.equal(await page.locator('#ampq').inputValue(),'');
    await page.locator('#ampq').fill('1987');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.locator('#ampq').press('Enter');
    await page.waitForFunction(()=>state.amp==='marshall-jcm800-1987' && document.querySelector('#patch-route'));
    assert.equal(await page.locator('#ampq').getAttribute('placeholder'),'Marshall JCM800 1987');
    assert.match(await page.locator('#stage').innerText(), /Single channel/);
    assert.equal(await page.locator('.jjack').count(),4);
    await topIs('Brit 1987 1', 100);
    assert.match(await page.locator('#results .mcard').first().locator('.tier').textContent(), /^Closest · /);
    await page.locator('#k-volumeI-').press('Home');
    await page.waitForFunction(()=>state.amps[state.amp].global.volumeI===0 && document.querySelector('#results .mcard .mscore').firstChild.textContent!=='100');

    // Load settings from a card: the capture scores 100, the pill appears and clears on a control change.
    await page.locator('#load-861370a1-f820-4045-a280-9ea0dbbcf634').click();
    await topIs('Brit 1987 1', 100);
    assert.match(await page.locator('.loadpill').textContent(), /Loaded from Brit 1987 1/);
    await page.locator('#k-bass-').press('ArrowUp');
    await page.waitForFunction(()=>!document.querySelector('.loadpill'));
    await page.locator('#reset').click();
    await topIs('Brit 1987 1', 100);
    const knob = await page.locator('[data-drag=knob][data-ctrl=volumeI]').boundingBox();
    await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2);
    await page.mouse.down();
    await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2+70,{steps:5});
    await page.mouse.up();
    await page.waitForFunction(()=>state.amps[state.amp].global.volumeI===5 && document.querySelector('#k-volumeI-')?.value==='5');
    await page.locator('#reset').click();
    await topIs('Brit 1987 1', 100);
    await page.locator('#patch-route').selectOption('none');
    await page.waitForFunction(()=>state.amps[state.amp].global.patchcable==='none');
    await page.locator('#reset').click();

    await page.locator('#results .mcard [data-act=open]').first().click();
    await page.waitForFunction(()=>document.activeElement?.id==='drawer-close');
    assert.match(await page.locator('.drawer .recset').textContent(), /Volume II\s*10\.0/i);
    assert.doesNotMatch(await page.locator('.drawer').textContent(), /Factory Captures|This is a capture of/);
    assert.match(await page.locator('.drawer .meta:not(.recset)').textContent(), /861370a1-f820-4045-a280-9ea0dbbcf634/);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-load');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-cloud');
    assert.equal(await page.locator('#drawer-cloud').getAttribute('href'), 'https://cloud.neuraldsp.com/cloud/u/NeuralDSP/neural-capture/view/861370a1-f820-4045-a280-9ea0dbbcf634');
    assert.equal(await page.locator('#drawer-cloud').getAttribute('target'), '_blank');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-close');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.drawer'));
    assert.match(await page.evaluate(()=>document.activeElement.id), /^open-/);

    // Load settings from the details drawer.
    const third = await page.evaluate(()=>CAPTURES.find(c=>c.name==='Brit 1987 3').id);
    await page.locator('#open-'+third).click();
    await page.locator('#drawer-load').click();
    await page.waitForFunction(()=>!document.querySelector('.drawer'));
    await topIs('Brit 1987 3', 100);
    assert.match(await page.locator('.loadpill').textContent(), /Brit 1987 3/);
    await page.locator('#unload').click();
    await page.waitForFunction(()=>!document.querySelector('.loadpill'));

    // Capture search combobox: by capture name or amp; Enter loads (switching amp and mode/channel).
    // Capture picker levels: Category › Instrument › Gear › captures; Enter on a capture loads it.
    await page.locator('#capq').focus();
    await page.waitForFunction(()=>document.querySelector('#cap-drill-amps'));
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#cap-listbox [data-act=cap-drill]')].map(b=>b.dataset.key)), await page.evaluate(()=>CATEGORY_ORDER.filter(c=>CAP_SORTED.some(e=>e.cat===c))));
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#cap-drill-guitar'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#cap-drill-marshall-jcm800-1987')?.textContent.startsWith('Brit 1987'));
    await page.locator('#cap-drill-marshall-jcm800-1987').click();
    await page.waitForFunction(()=>document.querySelectorAll('#cap-listbox [data-act=cap]').length===10);
    // The gear level uses the name the gear has on the device (from its capture names).
    assert.match(await page.locator('#cap-back').textContent(), /Amps.*Guitar.*Brit 1987$/);
    assert.equal(await page.evaluate(()=>DEVICE_NAME['bogner-ecstasy-100b']), 'Bogna X100B');
    assert.equal(await page.evaluate(()=>DEVICE_NAME.jp2c), 'CA John');
    assert.match(await page.locator('#cap-listbox [data-act=cap]').first().textContent(), /Brit 1987 1/);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(()=>JSON.stringify(state.capPath)==='["Amps","Guitar"]' && document.querySelector('#cap-listbox .ampopt.active')?.id==='cap-drill-marshall-jcm800-1987');
    await page.locator('#capq').fill('triaxis 3axe 5');
    await page.waitForFunction(()=>document.querySelectorAll('#cap-listbox [role=option]').length===1);
    assert.match(await page.locator('#cap-listbox').textContent(), /CA 3Axe 5.*Mesa\/Boogie TriAxis preamp.*Load/);
    await page.locator('#capq').press('Enter');
    await page.waitForFunction(()=>state.amp==='mesa-boogie-triaxis-preamp' && state.amps[state.amp].channel===5);
    await topIs('CA 3Axe 5', 100);
    assert.equal(await page.locator('#capq').inputValue(),'');
    assert.ok(await page.evaluate(()=>document.querySelector('#cap-listbox').hidden));
    // A capture without readable settings opens its details instead.
    await page.locator('#capq').fill("CA John's Ch1 1");
    await page.locator('#capq').press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='drawer-close');
    assert.equal(await page.evaluate(()=>state.amp),'mesa-boogie-triaxis-preamp');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.drawer'));
    // Clicking an option selects it before blur closes the list.
    await page.locator('#capq').fill('Brit 1987 2');
    await page.locator('#cap-listbox [role=option]').first().click();
    await page.waitForFunction(()=>state.amp==='marshall-jcm800-1987');
    await topIs('Brit 1987 2', 100);

    // (i) popover: opens below its button, focus moves in; ✕, Escape and an outside click close it.
    await page.locator('#info-btn').click();
    await page.waitForFunction(()=>document.activeElement?.id==='info-close');
    assert.match(await page.locator('#info-pop').innerText(), /Matching on JCM800 1987[\s\S]*Visual reference only — nothing here controls a physical amp/);
    const [btnBox, popBox] = [await page.locator('#info-btn').boundingBox(), await page.locator('#info-pop').boundingBox()];
    assert.ok(popBox.y >= btnBox.y + btnBox.height);
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#info-pop') && document.activeElement?.id==='info-btn');
    await page.locator('#info-btn').click();
    await page.locator('#info-close').click();
    await page.waitForFunction(()=>!document.querySelector('#info-pop'));
    await page.locator('#info-btn').click();
    await page.waitForFunction(()=>document.activeElement?.id==='info-close');
    await page.mouse.click(5, 600);
    await page.waitForFunction(()=>!document.querySelector('#info-pop'));
    await page.locator('#reset').click();

    // Pedals get their own generic panel (no cabinet grille); capture search groups by category.
    await page.evaluate(()=>pickAmp('mxr-classic-distortion'));
    await page.waitForFunction(()=>document.querySelector('#stage .pedalcab') && !document.querySelector('#stage .grille'));
    assert.doesNotMatch(await page.locator('#stage').innerText(), /Single channel/);
    await page.locator('#capq').fill('boss');
    await page.waitForFunction(()=>document.querySelector('#cap-listbox .gearhead')?.textContent==='Pedals');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#cap-listbox .gearsub')].map(h=>h.textContent)), ['Guitar','Bass']);
    await page.keyboard.press('Escape');

        // Deep link.
    await go(url+'?amp=marshall-jcm800-1987');
    await page.waitForFunction(()=>state.amp==='marshall-jcm800-1987' && document.querySelector('.jjack'));

    // No filter bar; cards show the Neural Capture type.
    assert.equal(await page.locator('#q-recs, #f-instrument, #clear-filters').count(), 0);
    assert.doesNotMatch(await page.locator('.matches').innerText(), /SETTINGS ONLY/i);
    await topIs('Brit 1987 1', 100);
    assert.equal(await page.locator('#results article').count(),10);
    // The Neural Capture version is a badge beside each capture name (full type for screen readers and on hover).
    assert.match(await page.locator('#results .mcard .capname .ncbadge').first().textContent(), /^Neural Capture V2$/);
    assert.equal(await page.locator('#results .mcard .capname .ncbadge').first().getAttribute('title'), 'Neural Capture V2');

    // Remember settings per amp.
    await page.evaluate(()=>{state.amps.jp2c.ch[3].gain=9;pickAmp('jp2c');});
    await page.waitForFunction(()=>document.querySelector('#k-gain-3'));
    assert.equal(await page.locator('#k-gain-3').inputValue(),'9');
    await page.locator('#k-gain-3').press('ArrowLeft');
    await page.waitForFunction(()=>state.amps.jp2c.ch[3].gain===8.5);
    await page.evaluate(()=>pickAmp('marshall-jcm800-1987'));
    await page.waitForFunction(()=>document.querySelector('#patch-route'));
    await page.evaluate(()=>pickAmp('jp2c'));
    await page.waitForFunction(()=>document.querySelector('#k-gain-3')?.value==='8.5');
    const fader = await page.locator('[data-drag=fader][data-ctrl=eq80]').boundingBox();
    await page.mouse.move(fader.x+fader.width/2,fader.y+77);
    await page.mouse.down();
    await page.mouse.move(fader.x+fader.width/2,fader.y+15,{steps:5});
    await page.mouse.up();
    await page.waitForFunction(()=>state.amps.jp2c.ch[3].eq80===10 && document.querySelector('#f-eq80-3')?.value==='10');

    // Uninterpreted data gets no score, but remains searchable/readable.
    await page.locator('[data-act=more]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#results article').length===24);
    const noScore = await page.evaluate(()=>{ state.limit = 1000; render(); return [...document.querySelectorAll('#results .mcard.noscore')].length; });
    assert.ok(noScore > 0);
    assert.match(await page.locator('#results .mcard.noscore').first().textContent(), /No score.*Settings not interpreted/);
    await page.evaluate(()=>{ state.limit = 12; render(); });

    const definitionIds = await page.evaluate(()=>AMP_DEFS.map(a=>a.id));
    for (const width of [1440,390,375,320]) {
      await page.setViewportSize({width,height:900});
      const overflows = await page.evaluate(()=>AMP_DEFS.flatMap(def=>{
        state.amp=def.id;
        return (def.channels || [{n:null}]).map(channel=>{
          state.amps[def.id].channel=channel.n;
          render();
          const invalid = [...document.querySelectorAll('input[type=range]')].some(input=>['undefined','NaN'].includes(input.getAttribute('value')));
          return document.documentElement.scrollWidth>window.innerWidth+1 || invalid ? def.id : null;
        }).filter(Boolean);
      }));
      assert.deepEqual(overflows,[], `Overflow or invalid control at ${width}px`);
    }
    await page.evaluate(()=>pickAmp('unmapped'));
    await page.waitForFunction(()=>document.querySelector('#stage').textContent.includes('Unmapped'));
    await page.waitForFunction(()=>document.querySelectorAll('#results article').length===CAPTURES.filter(c=>!c.ampId).length && !document.querySelector('[data-act=more]'));
    await page.locator('#results [data-act=open]').first().click();
    await page.waitForFunction(()=>document.querySelector('.drawer'));
    assert.match(await page.locator('.drawer').textContent(), /Not mapped/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

    // The workbench survives a reload (gear, settings, filters, Loaded-from pill); popups don't.
    await go(url+'?amp=marshall-jcm800-1987');
    await page.waitForFunction(()=>state.amp==='marshall-jcm800-1987' && document.querySelector('.jjack'));
    const brit3 = await page.evaluate(()=>{ const c = CAPTURES.find(x=>x.name==='Brit 1987 3'); loadCapture(c.id); return c.settings.values; });
    await page.waitForFunction(()=>document.querySelector('.loadpill'));
    await page.locator('#info-btn').click();
    await go(url);
    await page.waitForFunction(()=>state.amp==='marshall-jcm800-1987' && document.querySelector('.loadpill'));
    assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k, state.amps[state.amp].global[k]])), Object.keys(brit3)), brit3);
    assert.match(await page.locator('.loadpill').textContent(), /Brit 1987 3/);
    await topIs('Brit 1987 3', 100);
    assert.equal(await page.locator('#info-pop').count(),0);
    // A ?amp= link wins over the saved gear; the other gear's settings are still kept.
    await go(url+'?amp=jp2c');
    await page.waitForFunction(v=>state.amp==='jp2c' && state.amps['marshall-jcm800-1987'].global.volumeII===v, brit3.volumeII);
    // Saved values that don't fit the current data are ignored, never restored.
    await page.evaluate(()=>localStorage.setItem('capture-finder:v1', JSON.stringify({amp:'no-such-gear', amps:{jp2c:{channel:9, ch:{3:{gain:99, master:'loud'}}, global:{shred:'max'}}}})));
    await go(url);
    await page.waitForFunction(()=>state.amp==='jp2c' && state.amps.jp2c.channel===3 && state.amps.jp2c.ch[3].gain===7.5 && state.amps.jp2c.global.shred==='off');
    await page.evaluate(()=>localStorage.setItem('capture-finder:v1', '{not json'));
    await go(url);
    await page.waitForFunction(()=>state.amp==='jp2c');
    await page.evaluate(()=>localStorage.clear());
    assert.deepEqual(errors,[]);
    assert.deepEqual(external,[]);
    console.log(`Browser tests passed: served over http (data fetched from data/), real matches, both search comboboxes, Load settings from cards/search/drawer, (i) popover, keyboard controls, modal focus, filters, pagination, state retention and all ${definitionIds.length} source/library entries at desktop/mobile widths. No JS errors or external requests.`);
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
