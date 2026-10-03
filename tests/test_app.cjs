// Dependency-free tests against the exact app script (assets/app.js) and the data it fetches.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const GEAR = JSON.parse(read('data/gear.json'));
const CF_DATA = { gear:GEAR, captures:JSON.parse(read('data/captures.json')) };
const nodes = new Map();
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {id, textContent:'', value:'', innerHTML:'', style:{}, setAttribute(){}, removeAttribute(){}, addEventListener(){}, querySelector(){return null;}, focus(){}});
  return nodes.get(id);
}
const context = vm.createContext({console, URLSearchParams, location:{search:''}, requestAnimationFrame(){return 1;}, window:{addEventListener(){}, CF_DATA}, document:{getElementById:element, addEventListener(){}, querySelectorAll(){return [];}, body:{style:{}}, activeElement:null}});
vm.runInContext(read('assets/app.js'), context);
const run = code => vm.runInContext(code, context);
assert.equal(run('CAPTURES.length'), 2190);
assert.equal(run('new Set(CAPTURES.map(c=>c.id)).size'), 2190);
assert.equal(run('CAPTURES.some(c=>c.name.startsWith("DEMO"))'), false);
assert.equal(run('AMP_DEFS.filter(a=>a.panel!=="generic").length'), 16);
assert.equal(run('AMP_DEFS.some(a=>a.id==="marshall-jcm800-2203")'), false);

run('state.amp="marshall-jcm800-1987"');
assert.equal(run('filteredCaptures().ampCaps.length'), 10);
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Brit 1987 1"),cur().def,cur().as).score'), 100);
run('state.amps[state.amp].global.volumeI=0');
assert.ok(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Brit 1987 1"),cur().def,cur().as).score') < 100);
assert.equal(run('settingsSimilarity({settings:null},cur().def,cur().as).status'), 'unparsed');
assert.equal(run('settingsSimilarity({settings:{values:{}}},cur().def,cur().as).status'), 'unparsed');
assert.ok(run('settingsSimilarity({settings:{values:{volumeI:0}}},cur().def,cur().as).score') < 60);

run('state.amp="jp2c"');
assert.equal(run('filteredCaptures().ampCaps.length'), 160);
assert.equal(run('CAPTURES.find(c=>c.name==="CA John\'s Ch1 1").settings'), null);
// Unstated EQ on/off is assumed on, so band positions are compared.
assert.equal(run('CAPTURES.find(c=>c.name==="CA John Ch2 1").settings.values.eqOn'), true);
assert.equal(run('JSON.stringify(CAPTURES.find(c=>c.name==="CA John Ch2 1").settings.assumed)'), '["eqOn"]');
run('state.openId=CAPTURES.find(c=>c.name==="CA John Ch2 1").id');
assert.match(run('renderDrawer()'), /On \(assumed\)/);
run('state.openId=null');
assert.equal(run('comparisonStatus(CAPTURES.find(c=>c.name==="CA John Ch3 1"),cur().def,cur().as,ctrlByKey("eq80"),3).note'), '');
assert.equal(run('switchValue(ctrlByKey("shred"),"ch2",2)'), run('switchValue(ctrlByKey("shred"),"ch23",2)'));
assert.notEqual(run('switchValue(ctrlByKey("shred"),"ch2",3)'), run('switchValue(ctrlByKey("shred"),"ch23",3)'));
assert.equal(run('captureValues({settings:{values:{},byChannel:{1:{gain:2},2:{gain:8}}}},1).gain'), 2);
assert.equal(run('captureValues({settings:{values:{},byChannel:{1:{gain:2},2:{gain:8}}}},3).gain'), undefined);
// Unstated channels reduce confidence less than a known different channel.
assert.ok(run('settingsSimilarity({settings:{channel:null,values:{gain:7.5}}},cur().def,cur().as).score') > run('settingsSimilarity({settings:{channel:2,values:{gain:7.5}}},cur().def,cur().as).score'));
// N/A is excluded from applicable coverage rather than counted as missing.
assert.ok(run('settingsSimilarity({settings:{channel:3,values:{gain:7.5},notApplicable:[{key:"treble",channel:3}]}},cur().def,cur().as).coverage') > run('settingsSimilarity({settings:{channel:3,values:{gain:7.5}}},cur().def,cur().as).coverage'));

// TriAxis: the RHY/LD1/LD2 row is the mode (channel); lead drives only count in their modes.
run('state.amp="mesa-boogie-triaxis-preamp"');
assert.equal(run('filteredCaptures().ampCaps.length'), 8);
assert.deepEqual(run('filteredCaptures().ampCaps.map(c=>c.settings.channel).join()'), '1,2,3,4,5,6,7,8');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="CA 3Axe 1"),cur().def,cur().as).score'), 100);
assert.ok(run('settingsSimilarity(CAPTURES.find(c=>c.name==="CA 3Axe 2"),cur().def,cur().as).score') < 60);
run('state.amps[state.amp].channel=5');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="CA 3Axe 5"),cur().def,cur().as).reasons[0].kind'), 'match');
assert.ok(run('renderStage()').includes('id="mode-5" class="txled on"'));
assert.ok(!run('renderStage()').includes('chtabs'));
run('state.amp="mesa-boogie-triaxis-preamp-mesa-boogie-2-90-simulclass"');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="CA 3Axe+290 1"),cur().def,cur().as).score'), 100);
assert.equal(run('CAPTURES.find(c=>c.name==="CA 3Axe+290 1").settings.values.presence'), 3.5);
assert.equal(run('CAPTURES.find(c=>c.name==="CA 3Axe+290 1").settings.values.powerPresence'), 0);

// Aguilar Tone Hammer 500: identified by its custom match rule; all six knobs parse.
run('state.amp="aguilar-tone-hammer-500"');
assert.equal(run('filteredCaptures().ampCaps.length'), 47);
assert.ok(run('filteredCaptures().ampCaps.every(c=>c.settings && !c.uninterpretedSettings.length && Object.keys(c.settings.values).length===6)'));
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Aggi Hammer 500 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab thcab"') && run('renderStage()').includes('Single channel'));

// Ibanez TS9: custom pedal panel (control area only), all 12 captures parse.
run('state.amp="ibanez-ts9-tube-screamer"');
assert.equal(run('filteredCaptures().ampCaps.length'), 12);
assert.ok(run('filteredCaptures().ampCaps.every(c=>c.settings && Object.keys(c.settings.values).length===3)'));
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Iba Green 9 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab tscab"') && !run('renderStage()').includes('grille'));

// Origin Effects Cali76: Ratio is a 4-position switch; DRY is shown but not matched.
run('state.amp="origin-effects-cali76"');
assert.equal(run('filteredCaptures().ampCaps.length'), 32);
assert.equal(run('JSON.stringify([...new Set(filteredCaptures().ampCaps.map(c=>c.settings.values.ratio))].sort((a,b)=>a-b))'), '[4,8,12,20]');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="OC-76 Comp 1"),cur().def,cur().as).score'), 100);
run('state.amps[state.amp].global.dry=7');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="OC-76 Comp 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab cacab"') && run('renderStage()').includes('aria-label="Ratio 20:1"'));

// Neural DSP Darkglass Ultra / Ultimate share the Microtubes B7K Ultra panel; Ultimate compares only
// its B7K/VU pedal section (the compressor's Level/Blend come before it and are not read).
run('state.amp="neural-dsp-darkglass-ultra"');
assert.equal(run('cur().def.category'), 'Overdrive');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Darkglass Ultimate 8"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab b7cab"') && run('renderStage()').includes('id="p-distortion-"'));
run('state.amp="neural-dsp-darkglass-ultimate"');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Darkglass Ultimate 3"),cur().def,cur().as).score'), 100);
assert.equal(run('CAPTURES.find(c=>c.name==="Darkglass Ultimate 7").settings.values.blend'), 4);

// Bogner Ecstasy 100B (custom): every physical knob is its own control on its channel(s) —
// VOL./GAIN per channel, Treble/Middle/Bass for channel 1 and shared by 2/3 — and the two
// "Gain" lines (knob + Lo/Hi switch) and per-channel Pre EQs land on the right control.
run('state.amp="bogner-ecstasy-100b"');
assert.equal(run('CAPTURES.filter(c=>c.ampId==="bogner-ecstasy-100b"&&c.uninterpretedSettings.length).length'), 0);
assert.equal(run('JSON.stringify(CAPTURES.find(c=>c.name==="Bogna X100B Ch2 1").settings.values)'), JSON.stringify({presence:6,mastervol:6.5,excursion:'Tight',vol2:6,treble23:6,middle23:4,bass23:5,gain2:9,air:'Lo',gainsw:'Lo',preeq2:'Dark',variac:false,soundstyle:'New'}));
assert.equal(run('CAPTURES.find(c=>c.name==="Bogna X100B Ch1 1").settings.values.treble1'), 6.5);
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Bogna X100B Ch2 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab bgcab"') && run('renderStage()').includes('id="t-soundstyle--1"'));
// "Normal"/"Middle" Pre EQ positions mean Mid.
assert.ok(run('CAPTURES.filter(c=>c.ampId==="bogner-ecstasy-100b").every(c=>!["Normal","Middle"].includes(c.settings.values.preeq2||c.settings.values.preeq3))'));

// Ecstasy preamp and power amp sections share the faceplate, drawing only their own controls.
run('state.amp="bogner-ecstasy-100b-preamp-section"');
assert.equal(run('CAPTURES.find(c=>c.name==="Bogna X100B Pre Ch3 Lead 1").settings.values.gainmode'), 'Lead');
assert.equal(run('CAPTURES.find(c=>c.name==="Bogna X100B Pre Ch3 Lead 1").settings.values.gainsw'), 'Lo');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Bogna X100B Pre Ch2 Hi 1"),cur().def,cur().as).score'), 100);
assert.ok(!run('renderStage()').includes('PRESENCE') && run('renderStage()').includes('id="k-gain2-"'));
run('state.amp="bogner-ecstasy-100b-power-amp-section"');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name==="Bogna X100B PA NEW 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('id="t-soundstyle--1"') && !run('renderStage()').includes('id="k-gain2-"'));

// Mark IIC+: the two "Pull Bright" lines go to Volume 1 then Lead Master; pedal blocks after the
// amp are not read; lead controls only count with Pull Lead on.
run('state.amp="mesa-boogie-mark2c"');
assert.equal(run('CAPTURES.filter(c=>c.ampId==="mesa-boogie-mark2c"&&c.uninterpretedSettings.length).length'), 0);
assert.equal(run('JSON.stringify([CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 1").settings.values.pullbright1,CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 1").settings.values.pullbright2])'), "[false,true]");
assert.equal(run('CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 6").settings.values.volume'), 7);
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 1"),cur().def,cur().as).score'), 100);
run('loadCapture(CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 3").id)');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name.trim()==="CA MkCC+ 3"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('class="cab mkcab"') && run('renderStage()').includes('id="t-powermode--1"') && run('renderStage()').includes('class="mkk mkoff"'));

// Hot Rod Deluxe: captures say channel A/B (Normal/Drive); CHANNEL SELECT on the panel replaces the
// tabs; the power amp section is its own entry with only Presence.
run('state.amp="fender-hot-rod-deluxe"');
assert.equal(run('CAPTURES.filter(c=>c.ampId==="fender-hot-rod-deluxe"&&c.uninterpretedSettings.length).length'), 0);
assert.equal(run('CAPTURES.find(c=>c.name.trim()==="US HRDLX ChB 13").settings.channel'), 2);
assert.equal(run('CAPTURES.find(c=>c.name.trim()==="US HRDLX ChB 13").settings.values.moredrive'), true);
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name.trim()==="US HRDLX ChA 1"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('id="hr-select"') && !run('renderStage()').includes('id="tab-1"') && run('renderStage()').includes('class="hrk hroff"'));
run('state.amp="fender-hot-rod-deluxe-power-amp-section"');
assert.equal(run('CAPTURES.filter(c=>c.ampId==="fender-hot-rod-deluxe-power-amp-section").length'), 8);
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name.trim()==="US HRDLX PA 6V6 5"),cur().def,cur().as).score'), 100);
assert.ok(run('renderStage()').includes('id="k-presence-"') && !run('renderStage()').includes('id="k-volume-"'));

// Every capture links to its own Cortex Cloud page.
assert.equal(run('cloudUrl(CAPTURES.find(c=>c.id==="22fda8ba-c75e-4ec5-aae1-60d80667280a"))'), 'https://cloud.neuraldsp.com/cloud/u/NeuralDSP/neural-capture/view/22fda8ba-c75e-4ec5-aae1-60d80667280a');
assert.ok(run('CAPTURES.every(c=>/^https:\\/\\/cloud\\.neuraldsp\\.com\\/cloud\\/u\\/[^/]+\\/neural-capture\\/view\\/[0-9a-f-]{36}$/.test(cloudUrl(c)))'));

// Generic layout heuristics (no gear-specific code): signal-flow knob order; blocks side by side
// (switches → knobs → EQ); knobs on one row when it fits, else two read column by column.
assert.equal(run('gOrder(ampById("fryette-sigx").controls.filter(c=>c.kind==="knob"&&available(c,1))).map(c=>c.label).join(",")'), 'Gain 1,Gain 2,Bass,Middle,Treble,Presence,Depth,Master'); // channel 1 is Rhythm (channels run clean → lead)
assert.equal(run('ampById("fryette-sigx").channels.map(c=>c.name).join(",")'), 'Rhythm,Lead');
assert.equal(run('ampById("peavey-5150-signature").channels.map(c=>c.name).join(",")'), 'Rhythm,Lead');
assert.equal(run('gOrder(ampById("ada-mp-1-preamp").controls.filter(c=>c.kind==="knob")).map(c=>c.label).join(",")'), 'Overdrive 1,Overdrive 2,Bass,Mid,Treble,Presence,Program no,Master Gain');
// "Volume" is the gain stage without a gain knob, the output level after one
assert.equal(run('gOrder([{label:"Treble"},{label:"Volume"},{label:"Bass"}]).map(c=>c.label).join(",")'), 'Volume,Bass,Treble');
assert.equal(run('gOrder([{label:"Volume"},{label:"Treble"},{label:"Gain"}]).map(c=>c.label).join(",")'), 'Gain,Treble,Volume');
// switches relate to knobs by a shared word, else by a usual pairing (Scoop → Middle, Power → Master)
const sigx = '(()=>{ const d=ampById("fryette-sigx"), k=gOrder(d.controls.filter(c=>c.kind==="knob"&&available(c,1))); return { d, k, rel:(l)=>{ const r=gRelated(d.controls.find(c=>c.label===l), k); return r.k<0 ? null : k[r.k].label; } }; })()';
assert.equal(run(sigx+'.rel("Gain More/Less")'), 'Gain 1');
assert.equal(run(sigx+'.rel("Scoop/Wood")'), 'Middle');
assert.equal(run(sigx+'.rel("Power Shift")'), 'Master');
assert.equal(run(sigx+'.rel("CH Mode")'), null);
assert.equal(run('gOrder([{label:"Gain2"},{label:"Treble"},{label:"Gain1"}]).map(c=>c.label).join(",")'), 'Gain1,Gain2,Treble');
// switches: unrelated ones (modes) first, then in the order of the knob each relates to
assert.equal(run('(()=>{ const d=ampById("fryette-sigx"), k=gOrder(d.controls.filter(c=>c.kind==="knob"&&available(c,1))); return gSwitchOrder(d.controls.filter(c=>c.kind==="switch"), k).map(c=>c.label).join(","); })()'), 'CH Mode,Boost,Gain More/Less,Scoop/Wood,Power Shift');
// one knob row when it fits next to the switches, else two (read column by column, as the DOM order)
assert.equal(run('gSecLayout({ head:true, knobs:[1,2,3,4,5,6,7], swW:[90,70], faders:[] }, 1000).rows'), 1);
assert.equal(run('gSecLayout({ head:true, knobs:[1,2,3,4,5,6,7], swW:[90,70], faders:[] }, 500).rows'), 2);
assert.equal(run('gSecLayout({ head:true, knobs:[1,2,3,4,5,6,7], swW:[90,70], faders:[] }, 500).wrapped'), false);
assert.equal(run('JSON.stringify(gSwitchBlock([60,60,60,60,60,60,60]).rows)'), '3'); // switches up to three rows tall
run('state.amp="fryette-sigx"; state.amps["fryette-sigx"].channel=1');
const sig = run('renderStage()');
assert.ok(sig.includes('class="gswitches" style="grid-template-rows:repeat(3,auto)"') && sig.includes('class="gknobs" style="grid-template-rows:repeat(2,auto)"'));
assert.ok(sig.indexOf('>Gain 1<') < sig.indexOf('>Gain 2<') && sig.indexOf('>Gain 2<') < sig.indexOf('>Bass<') && sig.indexOf('>Bass<') < sig.indexOf('>Middle<'));
// channels side by side as far as they fit without wrapping their blocks
run('state.amp="bogner-fish-preamp-mesa-boogie-2-ninety-simul-class"');
assert.ok(run('renderStage()').includes('grid-template-columns:repeat(4,minmax(0,1fr))'));
run('state.amp="mesa-boogie-studio-preamp-mesa-boogie-2-90-simulclass"');
assert.ok(!run('renderStage()').includes('gbody wrapped')); // switches, knobs and EQ sliders in one row

// Mark III (red stripe): the Mark IIC+ faceplate with PULL RHYTHM 2 on Middle (written "Pull Rhythm"
// or "Pull Rhythm2") and the recorded EQ AUTO / IN toggle; lead controls written N/A don't count.
run('state.amp="mesa-boogie-mark3-red-stripe"');
assert.equal(run('CAPTURES.filter(c=>c.ampId==="mesa-boogie-mark3-red-stripe"&&c.uninterpretedSettings.length).length'), 0);
assert.equal(run('CAPTURES.find(c=>c.name.trim()==="CA MkIIIRed 1").settings.values.pullrhythm2'), false);
assert.equal(run('CAPTURES.find(c=>c.name.trim()==="CA MkIIIRed 3").settings.values.pullrhythm2'), true);
assert.equal(run('JSON.stringify([CAPTURES.find(c=>c.name.trim()==="CA MkIIIRed 4").settings.values.pullbright1, CAPTURES.find(c=>c.name.trim()==="CA MkIIIRed 4").settings.values.pullbright2])'), '[true,true]');
assert.equal(run('settingsSimilarity(CAPTURES.find(c=>c.name.trim()==="CA MkIIIRed 1"),cur().def,cur().as).score'), 100);
const m3 = run('renderStage()');
assert.ok(m3.includes('class="mkface m3"') && m3.includes('id="p-pullrhythm2-"') && m3.includes('id="t-eqmode--1"') && !m3.includes('powermode'));
run('state.amp="mesa-boogie-mark2c"');
assert.ok(!run('renderStage()').includes('pullrhythm2') && !run('renderStage()').includes('eqmode')); // the IIC+ keeps its own controls
assert.equal(run('CAPTURES.filter(c=>c.ampId==="markbass-little-mark-iii").length'), 50); // Markbass "Little Mark III" isn't a Mark III

// Capture type labels: no version means the original Neural Capture (V1).
assert.equal(run('captureTypeLabel({captureType:"Neural Capture"})'), 'Neural Capture V1');
assert.equal(run('captureTypeLabel({captureType:"Neural Capture V2"})'), 'Neural Capture V2');
run('state.amp="unmapped"');
assert.ok(run('filteredCaptures().ampCaps.length') > 0);
assert.ok(run('filteredCaptures().ampCaps.every(c=>!c.ampId)'));
assert.ok(run('filteredCaptures().ampCaps.every(c=>settingsSimilarity(c,cur().def,cur().as).status==="unparsed")'));

for (const amp of GEAR) {
  run(`state.amp=${JSON.stringify(amp.id)}; render();`);
  assert.ok(!run('renderStage()').includes('NaN'), amp.id+' invalid control position');
  const scores = run('filteredCaptures().shown.map(c=>settingsSimilarity(c,cur().def,cur().as)).filter(r=>r.status==="scored").map(r=>r.score)');
  assert.ok(scores.every(n=>Number.isInteger(n)&&n>=0&&n<=100), amp.id+' invalid score');
}
console.log('App tests passed: gear/capture data, custom/generic rendering, scoring, coverage, EQ, Shred, filters and unmapped library.');
