/* Capture Finder — app script (loaded by index.html once the data is fetched).
   Code map (search for these banners):
     SETTINGS SIMILARITY      — explicit values, weighted coverage and channel checks
     4) STATE                  — UI state per gear / channel, saved state
     5) RENDER                 — HTML string renderers per region, custom gear panels
     6) EVENTS                 — delegated click / input / pointer / keyboard handlers */
'use strict';
/* =====================================================================
   1) AMP DEFINITIONS — one entry per amp. `panel:'jp2c'` uses the custom
   JP-2C front panel; `panel:'generic'` is assembled from `controls`.
   Control schema:
     key, label, kind:'knob'|'fader'|'switch', scope:'channel'|'global',
     channels:[n…] (optional: only on these channels),
     min/max/step (knob, fader), options:[{v,label}] top→bottom (switch),
     weight (0 = shown but not used for matching), primary (main gain control),
     group (e.g. 'eq'), requires (key of an on/off switch that enables it)
    Generic control lists/ranges are capture-derived, not manual-verified specs.
   ===================================================================== */
/* ---------- helpers ---------- */
// Data comes from data/gear.json and data/captures.json, fetched by the loader in index.html
// before this script runs (see there).
const AMP_DEFS = window.CF_DATA.gear;
const CAPTURES = window.CF_DATA.captures;
AMP_DEFS.push({id:'unmapped', brand:'Library', model:'Unmapped captures', category:'Unmapped', panel:'generic', channels:null, controls:[], defaults:{channel:null,ch:{},global:{}}, browseOnly:true});
function ampById(id){ return AMP_DEFS.find(a => a.id === id) || AMP_DEFS[0]; }
function f1(v){ return (Math.round(v*10)/10).toFixed(1); }
function optLabel(c, v){ if (v == null) return null; const o = (c.options || []).find(x => x.v === v); return o ? (typeof v === 'boolean' ? (v ? 'On' : 'Off') : o.label) : String(v); }
function fmtVal(c, v){ if (v == null) return null; return c.kind === 'switch' ? optLabel(c, v) : f1(v); }
function available(c, n){ return !c.channels || (n != null && c.channels.includes(n)); }
function multiCh(def){ return !!def.channels && def.channels.length > 1; }
function nice(l){ return l && l === l.toUpperCase() ? l.toLowerCase().replace(/(^|\s)\w/g, m => m.toUpperCase()) : l; }
function chName(def, n){ const c = (def.channels || []).find(x => x.n === n); return c ? c.name : ''; }
function channelLabel(def, n){
  const name = chName(def, n);
  return def.panel === 'generic' ? (/^\d/.test(name) ? 'Channel '+name : name+' channel') : /^triaxis/.test(def.panel) ? name+' mode' : 'Ch '+n+' '+name;
}
function captureChannelLabel(def, cap){
  const s = cap.settings;
  if (!s) return 'Channel not stated';
  const recorded = Object.keys(s.byChannel || {});
  return recorded.length > 1 ? recorded.map(n=>channelLabel(def,Number(n))).join(' + ') : s.channel != null ? channelLabel(def,s.channel) : 'Channel not stated';
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function jattr(v){ return esc(JSON.stringify(v)); }


/* =====================================================================
   SETTINGS SIMILARITY — weighted explicit settings, with coverage penalties.
   ===================================================================== */
const STRONG_MATCH_MIN = 60;
const MK = { match:'=', near:'≈', off:'≠', none:'–' };
const SR = { match:'Same: ', near:'Close: ', off:'Different: ', none:'Not stated: ' };
function norm10(c, d){ return d / Math.max(c.max - c.min, 0.001) * 10; }
function diffKind(d10){ return d10 <= 0.5 ? 'match' : d10 <= 1.5 ? 'near' : 'off'; }
function getVal(def, as, c, n){ return c.scope === 'channel' ? (as.ch[n] || {})[c.key] : as.global[c.key]; }

function captureValues(cap, n){
  const s = cap.settings;
  if (!s) return {};
  // Multi-channel captures retain independent control values instead of
  // overwriting one channel's settings with the next channel's block.
  const cs = s.byChannel || {};
  if (Object.keys(cs).length > 1) return Object.assign({}, s.values, cs[n] || {});
  return s.values || {};
}
function switchValue(c, v, n){
  if (c.key === 'shred') return v == null ? null : v === 'ch23' || (v === 'ch2' && n === 2);
  return v;
}
function notApplicable(cap, c, n){
  const s = cap.settings;
  if (!s) return false;
  const multiple = Object.keys(s.byChannel || {}).length > 1;
  return (s.notApplicable || []).some(x => x.key === c.key && (!multiple || x.channel == null || x.channel === n));
}
function comparisonStatus(cap, def, as, c, n){
  const vals = captureValues(cap, n), cv = vals[c.key], uv = getVal(def, as, c, n);
  const s = cap.settings;
  if (notApplicable(cap, c, n)) return {kind:'none', note:'not applicable', cv:null, uv};
  if (!c.weight) return {kind:'none', note:'not matched', cv, uv};
  if (c.requires) {
    const req = def.controls.find(x => x.key === c.requires);
    if (getVal(def, as, req, n) !== true || vals[c.requires] !== true) return {kind:'none', note:vals[c.requires] == null ? 'not compared: enablement not stated' : 'not compared: disabled', cv, uv};
  }
  if (cv == null || uv == null) return {kind:'none', note:'not stated', cv, uv};
  return {kind:c.kind === 'switch' ? (switchValue(c, cv, n) === switchValue(c, uv, n) ? 'match' : 'off') : diffKind(norm10(c, Math.abs(cv - uv))), note:'', cv, uv};
}

function settingsSimilarity(cap, def, as){
  const s = cap.settings;
  if (!s) return { status:'unparsed' };
  const n = def.channels ? as.channel : null, vals = captureValues(cap, n);
  let num = 0, den = 0, maxDen = 0;
  const reasons = [], add = (w, sim) => { num += w*sim; den += w; };
  const channelRecorded = s.channel != null || Object.keys(s.byChannel || {}).length > 1;
  const sameCh = !multiCh(def) || s.channel === n || (s.byChannel && !!s.byChannel[n]);
  if (multiCh(def)) {
    if (!channelRecorded) reasons.push({kind:'none', text:'Channel not stated'});
    else if (sameCh) reasons.push({kind:'match', text:(Object.keys(s.byChannel || {}).length > 1 ? 'Capture includes ' : 'Same channel · ')+channelLabel(def,n)});
    else reasons.push({kind:'off', text:'Different channel · capture uses '+captureChannelLabel(def,cap)});
    if (Object.keys(s.byChannel || {}).length > 1) reasons.push({kind:'none', text:'Other recorded channels are not compared in this active-channel view'});
  }
  let worst = null, worstD = -1, toneCount = 0, swSame = 0;
  const eqGaps = [], swOff = [];
  def.controls.filter(c => c.weight > 0 && available(c, n)).forEach(c => {
    if (notApplicable(cap, c, n)) return;
    if (c.requires) {
      const rc = def.controls.find(x => x.key === c.requires);
      // Unknown enablement never implies ON. Unknown settings still reduce
      // coverage; explicitly disabled groups are excluded on both sides.
      if (getVal(def, as, rc, n) !== true || vals[c.requires] === false) return;
      maxDen += c.weight;
      if (vals[c.requires] !== true) return;
    } else {
      maxDen += c.weight;
    }
    const cv = vals[c.key]; if (cv == null) return;
    const uv = getVal(def, as, c, n);
    if (c.kind === 'switch') {
      const same = switchValue(c, cv, n) === switchValue(c, uv, n); add(c.weight, same ? 1 : 0);
      if (same) swSame++; else swOff.push(nice(c.label)+' '+nice(optLabel(c, cv))+' · yours '+nice(optLabel(c, uv)));
      return;
    }
    const d10 = norm10(c, Math.abs(cv - uv));
    add(c.weight, Math.max(0, 1 - d10/4));
    if (c.group === 'eq') { eqGaps.push(d10); return; }
    if (c.primary) { reasons.push({kind:diffKind(d10), text:nice(c.label)+' '+f1(cv)+' vs your '+f1(uv)}); return; }
    toneCount++;
    if (d10 > worstD) { worstD = d10; worst = {c, cv, uv}; }
  });
  if (!den) return {status:'unparsed'};
  if (def.controls.some(c => c.group === 'eq') && vals.eqOn == null) reasons.push({kind:'none', text:'EQ enablement not stated; band values are not compared'});
  if (toneCount) {
    if (worstD > 1) reasons.push({kind:diffKind(worstD), text:nice(worst.c.label)+' '+f1(worst.cv)+' vs your '+f1(worst.uv)});
    else reasons.push({kind:'match', text:'Other knobs all within '+f1(Math.max(worstD, 0))});
  }
  if (eqGaps.length) { const avg = eqGaps.reduce((a, b) => a + b, 0) / eqGaps.length; reasons.push({kind:avg <= 0.6 ? 'match' : avg <= 1.5 ? 'near' : 'off', text:'EQ sliders · average gap '+f1(avg)}); }
  swOff.forEach(t => reasons.push({kind:'off', text:t}));
  if (!swOff.length && swSame) reasons.push({kind:'match', text:swSame === 1 ? 'Switch setting matches' : 'All '+swSame+' switch settings match'});
  const base = den ? num/den : 0;
  const coverage = maxDen ? Math.min(1, den/maxDen) : 0;
  const score = Math.round(100 * base * coverage * (sameCh ? 1 : channelRecorded ? 0.5 : 0.8));
  if (coverage < 1) reasons.push({kind:'none', text:Math.round(coverage*100)+'% weighted settings coverage; missing controls reduce similarity'});
  return { status:'scored', score, coverage, reasons };
}

/* =====================================================================
   4) STATE
   ===================================================================== */
function initialAmpState(def){ return JSON.parse(JSON.stringify(def.defaults)); }
const state = {
  amp:'jp2c', amps:{}, ampQuery:'', ampOpen:false, ampActive:0, ampPath:[], capQuery:'', capOpen:false, capActive:0, capPath:[],
  openId:null, infoOpen:false, weightsOpen:false, weights:{}, loaded:null, limit:12
};
AMP_DEFS.forEach(d => { state.amps[d.id] = initialAmpState(d); });
// Matching weights can be edited per gear (state.weights[gearId][controlKey]); each control keeps
// its original weight in w0 for "Reset to defaults".
const W_MAX = 5, W_STEP = 0.1;
AMP_DEFS.forEach(d => d.controls.forEach(c => { c.w0 = c.weight; }));
function applyWeights(def){ const o = state.weights[def.id] || {}; def.controls.forEach(c => { c.weight = c.key in o ? o[c.key] : c.w0; }); }
function setWeight(def, c, v){
  v = Math.round(Math.min(W_MAX, Math.max(0, v)) / W_STEP) * W_STEP;
  v = Math.round(v * 10) / 10;
  const o = state.weights[def.id] || (state.weights[def.id] = {});
  if (v === c.w0) delete o[c.key]; else o[c.key] = v;
  if (!Object.keys(o).length) delete state.weights[def.id];
  applyWeights(def); update({});
}
// Remember the workbench between visits, in this browser only: the current gear, every gear's
// settings and channel/mode, edited matching weights, and the "Loaded from" pill. Popups, the drawer
// and searches start fresh. Saved values are checked against the current gear data, so a
// rebuilt dataset never restores a control that no longer exists or a value out of range.
const STORE_KEY = 'capture-finder:v1', OLD_STORE_KEY = 'neural-capture-finder:v1'; // saved state from before the rename is read once
const DEFAULTS_JSON = Object.fromEntries(AMP_DEFS.map(d => [d.id, JSON.stringify(d.defaults)]));
function cleanValue(c, v){
  if (c.kind === 'switch') return (c.options || []).some(o => o.v === v) ? v : undefined;
  return typeof v === 'number' && isFinite(v) && v >= c.min && v <= c.max ? snap(c, v) : undefined;
}
function restoreState(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY) || 'null'); } catch (_) { return; }
  if (!saved || typeof saved !== 'object') return;
  if (AMP_DEFS.some(d => d.id === saved.amp)) state.amp = saved.amp;
  Object.entries(saved.amps || {}).forEach(([id, sv]) => {
    const def = AMP_DEFS.find(d => d.id === id), as = state.amps[id];
    if (!def || !sv || typeof sv !== 'object') return;
    if (def.channels && def.channels.some(c => c.n === sv.channel)) as.channel = sv.channel;
    def.controls.forEach(c => {
      if (c.scope === 'channel') (def.channels || []).forEach(ch => {
        const v = cleanValue(c, ((sv.ch || {})[ch.n] || {})[c.key]);
        if (v !== undefined) as.ch[ch.n] = Object.assign({}, as.ch[ch.n], {[c.key]:v});
      });
      else { const v = cleanValue(c, (sv.global || {})[c.key]); if (v !== undefined) as.global[c.key] = v; }
    });
  });
  if (saved.loaded && saved.loaded.amp === state.amp && typeof saved.loaded.name === 'string') state.loaded = { amp:saved.loaded.amp, name:saved.loaded.name };
  Object.entries(saved.weights || {}).forEach(([id, ws]) => {
    const def = AMP_DEFS.find(d => d.id === id);
    if (!def || !ws || typeof ws !== 'object') return;
    Object.entries(ws).forEach(([k, v]) => {
      if (def.controls.some(c => c.key === k) && typeof v === 'number' && isFinite(v) && v >= 0 && v <= W_MAX) (state.weights[id] || (state.weights[id] = {}))[k] = v;
    });
    applyWeights(def);
  });
}
function saveState(){
  const amps = {};
  AMP_DEFS.forEach(d => { if (JSON.stringify(state.amps[d.id]) !== DEFAULTS_JSON[d.id]) amps[d.id] = state.amps[d.id]; });
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ amp:state.amp, amps, loaded:state.loaded, weights:state.weights })); localStorage.removeItem(OLD_STORE_KEY); } catch (_) {}
}
restoreState();

// Optional deep link (wins over the saved gear): index.html?amp=marshall-jcm800-1987
try { const q = new URLSearchParams(location.search).get('amp'); if (q && AMP_DEFS.some(d => d.id === q)) state.amp = q; } catch (_) {}
// The current gear stays in the address (?amp=<id>): picking gear adds a history entry, so the
// browser's back and forward buttons move between gear; the first page records its gear in place.
let urlAmp = null;
function syncUrl(){
  if (state.amp === urlAmp || typeof history === 'undefined' || !history.pushState) return;
  try {
    const u = new URL(location.href); u.searchParams.set('amp', state.amp);
    history[urlAmp === null ? 'replaceState' : 'pushState']({ amp:state.amp }, '', u);
    urlAmp = state.amp;
  } catch (_) {}
}
window.addEventListener('popstate', () => {
  let q = null; try { q = new URLSearchParams(location.search).get('amp'); } catch (_) {}
  if (!q || !AMP_DEFS.some(d => d.id === q) || q === state.amp) return;
  urlAmp = q;
  update({ amp:q, openId:null, ampOpen:false, capOpen:false, infoOpen:false, weightsOpen:false, limit:12, loaded:state.loaded && state.loaded.amp === q ? state.loaded : null });
});

function cur(){ const def = ampById(state.amp); const as = state.amps[def.id]; return { def, as, ch:as.channel }; }
function ctrlByKey(key){ return cur().def.controls.find(c => c.key === key); }
function snap(c, v){ return Math.min(c.max, Math.max(c.min, Math.round(v / c.step) * c.step)); }

let raf = 0;
function update(patch){ if (patch) Object.assign(state, patch); if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function setCtrl(c, n, v){
  const { as } = cur();
  if (c.scope === 'channel') { as.ch[n] = Object.assign({}, as.ch[n], {[c.key]:v}); as.channel = n; }
  else as.global[c.key] = v;
  update({ loaded:null });
}
function setChannel(n){ cur().as.channel = n; update({ loaded:null }); }

// Copy a capture's stated settings onto its amp; unstated controls keep their values.
function loadCapture(id){
  const c = CAPTURES.find(x => x.id === id);
  if (!c) return;
  // the last searches stay in both fields
  const close = { ampOpen:false, capOpen:false, infoOpen:false, weightsOpen:false };
  if (!c.settings || !c.ampId) { lastOpenerId = document.activeElement && document.activeElement.id || null; update(Object.assign(close, { openId:id })); return; }
  const def = ampById(c.ampId), as = state.amps[def.id], s = c.settings;
  const recorded = Object.keys(s.byChannel || {}).map(Number);
  const channels = !def.channels ? [null] : recorded.length > 1 ? recorded : [s.channel != null ? s.channel : as.channel];
  channels.forEach(n => {
    const vals = captureValues(c, n);
    def.controls.forEach(ctl => {
      const v = vals[ctl.key];
      if (v == null || !available(ctl, n)) return;
      if (ctl.scope === 'channel') as.ch[n] = Object.assign({}, as.ch[n], {[ctl.key]:v});
      else as.global[ctl.key] = v;
    });
  });
  if (def.channels) as.channel = s.channel != null ? s.channel : channels[0];
  update(Object.assign(close, { amp:def.id, openId:null, limit:12, loaded:{ amp:def.id, name:c.name } }));
}

/* =====================================================================
   5) RENDER
   ===================================================================== */
const KNOB_PATH = (function(){
  const N = 180, lobes = 10, R = 28.6, depth = 1.9; let d = '';
  for (let i = 0; i <= N; i++) {
    const t = i/N*2*Math.PI, r = R - depth*(0.5 + 0.5*Math.cos(lobes*t));
    d += (i ? 'L' : 'M') + (30 + r*Math.sin(t)).toFixed(2) + ' ' + (30 - r*Math.cos(t)).toFixed(2);
  }
  return d + 'Z';
})();
const JP_KX = [40, 126, 212], JP_KY = [37, 135];
const JP_LED = { 1:'#5fe03a', 2:'#f2c52e', 3:'#f0412c' };
// fader geometry: JP-2C track 146px with center line at 77 (±62); generic track 120px
const FG = {
  jp:{ capTop:(f) => 77 - (f*2 - 1)*62 - 6, inv:(y) => ((77 - y)/62 + 1)/2 },
  gen:{ capTop:(f) => (1 - f)*108, inv:(y) => 1 - (y - 6)/108 },
  mk:{ capTop:(f) => (1 - f)*70, inv:(y) => 1 - (y - 5)/70 } // Mark IIC+ sliders: 80px track, 10px cap
};
function tip(pos){ return { pos }; }
function posFor(idx, count){ return idx === 0 ? 'up' : idx === count - 1 ? 'down' : 'mid'; }
function chAttr(n){ return n == null ? '' : String(n); }

function knobSVG(angle){
  return '<svg viewBox="0 0 60 60" width="56" height="56" aria-hidden="true"><g transform="rotate('+angle+' 30 30)">'
    + '<path d="'+KNOB_PATH+'" fill="#0e0e0e" stroke="#333" stroke-width="1"/>'
    + '<circle cx="30" cy="30" r="18" fill="#090909" stroke="#262626" stroke-width="1"/>'
    + '<path d="M30 24 L30 5" stroke="#f2f2f2" stroke-width="2.8" stroke-linecap="round"/></g></svg>';
}
// Lever switches (all panels): a recessed slot with the lever tip showing at the chosen end
// or in the middle, like the mini toggles on a Bogner. Flat fills, thin outlines.
function leverSVG(pos, horizontal){
  const at = pos === 'up' ? 0 : pos === 'down' ? 2 : 1;
  const W = horizontal ? 32 : 22, H = horizontal ? 20 : 32;
  const slot = horizontal ? 'x="3" y="4" width="26" height="12" rx="6"' : 'x="5" y="3" width="12" height="26" rx="6"';
  const cx = horizontal ? [9, 16, 23][at] : 11, cy = horizontal ? 10 : [9, 16, 23][at];
  // the lever's shaft leans from the slot's centre towards the tip (hidden when it's straight)
  const shaft = at === 1 ? '' : '<path d="M'+(W/2)+' '+(H/2)+' L'+cx+' '+cy+'" stroke="#3c3c3c" stroke-width="3" stroke-linecap="round"/>';
  return '<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" aria-hidden="true"><rect '+slot+' fill="#070707" stroke="#6e6e6e" stroke-width="1.2"/>'
    + shaft+'<circle cx="'+cx+'" cy="'+cy+'" r="4" fill="#e2e2e2" stroke="#7a7a7a" stroke-width="1"/><circle cx="'+(cx - 1)+'" cy="'+(cy - 1)+'" r="1.4" fill="#fafafa"/></svg>';
}
function togSVG(t){ return leverSVG(t.pos, false); }
function togHSVG(pos){ return leverSVG(pos, true); }

function knobHTML(c, n, value, prefix, extraCls, style){
  const angle = (-150 + (value - c.min)/(c.max - c.min)*300).toFixed(1);
  const id = 'k-'+c.key+'-'+chAttr(n);
  return '<div class="knobbox'+(extraCls || '')+'"'+(style ? ' style="'+style+'"' : '')+'>'
    + '<label class="kctl"><input id="'+id+'" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+value+'"'
    + ' aria-label="'+esc(prefix+nice(c.label)+(c.weight > 0 ? '' : ' (not used for matching)'))+'" aria-valuetext="'+f1(value)+' of '+c.max+'"'
    + ' data-ctrl="'+c.key+'" data-ch="'+chAttr(n)+'">'
    + '<span class="kwrap" data-drag="knob" data-ctrl="'+c.key+'" data-ch="'+chAttr(n)+'">'+knobSVG(angle)+'</span></label>'
    + '<span class="ro" aria-hidden="true">'+f1(value)+'</span></div>';
}

function faderInput(c, n, value, prefix){
  return '<input id="f-'+c.key+'-'+chAttr(n)+'" class="sr fader-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+value+'"'
    + ' aria-label="'+esc(prefix+c.label)+'" aria-valuetext="'+f1(value)+' of '+c.max+(value === (c.min + c.max)/2 ? ', center' : '')+'"'
    + ' data-ctrl="'+c.key+'" data-ch="'+chAttr(n)+'">';
}

// target: {channel:true} or {key, ch}
function targetAttrs(t){ return t.channel ? 'data-target="channel"' : 'data-target="ctrl" data-key="'+t.key+'" data-ch="'+chAttr(t.ch)+'"'; }
function targetId(t){ return t.channel ? 'channel' : t.key+'-'+chAttr(t.ch); }

function jpToggle(x, y, options, current, target, aria, labelPos, title, titleY){
  const idx = Math.max(0, options.findIndex(o => o.v === current));
  let h = '<div class="pos" style="left:'+x+'px;top:'+y+'px"><button class="togbtn" tabindex="-1" aria-hidden="true" data-act="cycle" '+targetAttrs(target)+'>'+togSVG(tip(posFor(idx, options.length)))+'</button></div>';
  options.forEach((o, i) => {
    h += '<button id="t-'+targetId(target)+'-'+i+'" class="tlbl pos" style="left:'+labelPos[i].x+'px;top:'+labelPos[i].y+'px" aria-pressed="'+(o.v === current)+'"'
      + ' aria-label="'+esc(aria+': '+o.label)+'" data-act="pick" '+targetAttrs(target)+' data-v="'+jattr(o.v)+'">'+esc(o.label)+'</button>';
  });
  if (title) h += '<span class="silk pos" style="left:'+x+'px;top:'+titleY+'px">'+esc(title)+'</span>';
  return h;
}

function jpPanelHTML(def, as){
  const ch = as.channel, C = (k) => def.controls.find(c => c.key === k);
  let h = '<div class="modelname">JP-2C</div>';
  def.channels.forEach(chn => {
    const n = chn.n, cs = as.ch[n], on = n === ch, prefix = 'Channel '+n+' ';
    h += '<div class="panel'+(on ? ' on' : '')+'" style="width:252px;height:175px" role="group" aria-label="'+esc('Channel '+n+' '+chn.name+(on ? ', selected' : ''))+'">';
    [['gain','master','presence'], ['treble','mid','bass']].forEach((row, r) => row.forEach((key, i) => {
      const pulled = (key === 'gain' && cs.pullGain === true) || (key === 'presence' && cs.pullPres === true);
      h += knobHTML(C(key), n, cs[key], prefix, pulled ? ' pulled' : '', 'position:absolute;left:'+(JP_KX[i]-28)+'px;top:'+(JP_KY[r]-28)+'px');
    }));
    const labels = [ ['MASTER', JP_KX[1], 79], ['TREBLE', JP_KX[0], 100], ['MID', JP_KX[1], 100], ['BASS', JP_KX[2], 100] ];
    if (n === 1) labels.push(['GAIN', JP_KX[0], 79], ['PRESENCE', JP_KX[2], 79]);
    labels.forEach(([t, x, y]) => { h += '<span class="silk pos" style="left:'+x+'px;top:'+y+'px">'+t+'</span>'; });
    if (n !== 1) [['pullGain','PULL GAIN',JP_KX[0]], ['pullPres','PULL PRES',JP_KX[2]]].forEach(([key, label, x]) => {
      const onP = !!cs[key];
      h += '<button id="p-'+key+'-'+n+'" class="pullbtn pos" style="left:'+x+'px;top:79px" aria-pressed="'+onP+'"'
        + ' aria-label="'+esc('Channel '+n+' '+label+': '+(onP ? 'pulled, on' : 'pushed in, off'))+'"'
        + ' data-act="pick" data-target="ctrl" data-key="'+key+'" data-ch="'+n+'" data-v="'+jattr(!onP)+'"><span class="pdot" aria-hidden="true"></span><span class="silk">'+label+'</span></button>';
    });
    h += '<span class="cled" style="left:83px;top:91px;background:'+(on ? JP_LED[n] : '#2e2e2e')+'"></span>';
    h += '<button id="cs-'+n+'" class="chsel pos" style="left:83px;top:76px" aria-label="'+esc('Select channel '+n+' '+chn.name)+'" data-act="channel" data-n="'+n+'"><span class="silk s">CH '+n+'</span></button>';
    h += '</div>';
  });

  const cs = as.ch[ch];
  h += '<div class="panel'+(cs.eqOn === false ? ' eqoff' : '')+'" style="width:300px;height:175px;background:#0f0f0f;border-radius:10px" role="group" aria-label="EQ and switches">';
  h += '<span class="eqline" style="position:absolute;left:56px;top:20px;width:158px;height:130px;border:1.5px solid rgba(235,235,235,.8);border-radius:10px"></span>';
  h += '<span class="eqline" style="position:absolute;left:56px;top:85px;width:158px;height:1.5px;background:rgba(235,235,235,.8)"></span>';
  def.controls.filter(c => c.group === 'eq').forEach((c, i) => {
    const v = cs[c.key], f = (v - c.min)/(c.max - c.min), capTop = FG.jp.capTop(f), x = 71 + 32*i;
    h += '<label style="position:absolute;left:'+(x-13)+'px;top:0;width:26px;height:160px">'+faderInput(c, ch, v, 'Channel '+ch+' EQ ')
      + '<span class="ftrack" data-drag="fader" data-geo="jp" data-ctrl="'+c.key+'" data-ch="'+ch+'"><span class="fslot"></span><span class="fcap" style="top:'+capTop.toFixed(1)+'px"></span></span></label>';
    h += '<span class="silk pos" style="left:'+x+'px;top:166px;font-size:10.5px">'+esc(c.label.replace('Hz', ''))+'</span>';
    h += '<span class="ro" style="left:'+(x-12)+'px;top:'+(8 + capTop - 15).toFixed(1)+'px" aria-hidden="true">'+f1(v)+'</span>';
  });
  h += jpToggle(28, 40, C('eqOn').options, cs.eqOn !== false, {key:'eqOn', ch}, 'Channel '+ch+' EQ', [{x:28, y:12}, {x:28, y:68}], 'EQ', 92);
  h += jpToggle(258, 40, [{v:1,label:'CH 1'},{v:2,label:'2'},{v:3,label:'CH 3'}], ch, {channel:true}, 'Channel select', [{x:258, y:12}, {x:282, y:40}, {x:258, y:68}]);
  h += jpToggle(258, 132, C('shred').options, as.global.shred, {key:'shred', ch}, 'Shred'+(ch === 1 ? ' (does not apply to Ch 1)' : ''), [{x:258, y:106}, {x:284, y:132}, {x:258, y:158}]);
  h += '</div>';
  return h;
}

// Marshall JCM800 1987: non-master-volume Lead head, Volume I/II and four inputs.
// The input circuits can be blended using a patch cable; there is no channel selector.
const JCM_TICKS = (function(){
  let d = '';
  for (let v = 0; v <= 10; v++) {
    const a = (-150 + v*30) * Math.PI/180, r1 = 18, r2 = v % 2 ? 20 : 21.5;
    d += 'M'+(32 + r1*Math.sin(a)).toFixed(2)+' '+(32 - r1*Math.cos(a)).toFixed(2)+'L'+(32 + r2*Math.sin(a)).toFixed(2)+' '+(32 - r2*Math.cos(a)).toFixed(2);
  }
  return d;
})();
const JCM_NUMS = [0,2,4,6,8,10].map(v => { const a = (-150 + v*30) * Math.PI/180; return '<span class="jnum" style="left:'+(32 + 27*Math.sin(a)).toFixed(1)+'px;top:'+(32 - 27*Math.cos(a)).toFixed(1)+'px">'+v+'</span>'; }).join('');

function jcmPanelHTML(def, as){
  const cs = as.global;
  let h = '<div class="jface" role="group" aria-label="Marshall JCM800 1987 front panel">'
    + '<div class="jbadge"><span style="font-size:22px;font-style:italic;line-height:1">JCM 800</span><span style="font-size:12px;font-style:italic;letter-spacing:.08em">LEAD SERIES · 1987</span><span style="font-size:9.5px;letter-spacing:.08em;color:#3a3226;margin-top:3px">50W · NON-MASTER VOLUME</span></div>'
    + '<div class="jknobs">';
  def.panelOrder.forEach(key => {
    const c = def.controls.find(x => x.key === key), v = cs[key];
    const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1), id = 'k-'+c.key+'-';
    h += '<div class="jk"><span class="jlab">'+esc(c.label)+'</span>'
      + '<label class="kctl"><input id="'+id+'" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
      + ' aria-label="'+esc(nice(c.label))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
      + '<span class="kwrap" data-drag="knob" data-ctrl="'+c.key+'" data-ch="">'
      + '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="'+JCM_TICKS+'" stroke="#2a2218" stroke-width="1" stroke-linecap="round" fill="none"/>'
      + '<g transform="rotate('+angle+' 32 32)"><circle cx="32" cy="32" r="14.5" fill="#cfae63" stroke="#6e5527" stroke-width="1.2"/><circle cx="32" cy="32" r="10.5" fill="none" stroke="#b39147" stroke-width="1"/><path d="M32 32 L32 19" stroke="#1a1612" stroke-width="2.2" stroke-linecap="round"/></g></svg>'
      + JCM_NUMS + '</span></label>'
      + '<span class="jsub">'+(key === 'volumeI' ? 'HIGH TREBLE' : key === 'volumeII' ? 'NORMAL' : '')+'</span><span class="jro" aria-hidden="true">'+f1(v)+'</span></div>';
  });
  h += '</div><div class="jjacks" role="group" aria-label="Input jack (input sensitivity)">';
  def.controls.find(x => x.key === 'input').options.forEach(o => {
    const on = cs.input === o.v;
    h += '<button id="jack-'+o.v+'" class="jjack'+(on ? ' on' : '')+'" aria-pressed="'+on+'" aria-label="'+esc('Plug into the '+nice(o.label).toLowerCase()+' input')+'"'
      + ' data-act="pick" data-target="ctrl" data-key="input" data-ch="" data-v="'+jattr(o.v)+'">'
      + '<span class="jgfx" aria-hidden="true"></span><span style="display:flex;flex-direction:column;gap:2px;text-align:left"><span class="jtxt">'+esc(nice(o.label))+'</span><span class="jstate">'+(on ? '● Plugged in' : '○ Empty')+'</span></span></button>';
  });
  h += '</div></div><label class="sel" style="margin-top:8px">Patch cable route (recorded configurations)<select id="patch-route" data-switch="patchcable">';
  def.controls.find(c => c.key === 'patchcable').options.forEach(o => { h += '<option value="'+esc(o.v)+'"'+(cs.patchcable === o.v ? ' selected' : '')+'>'+esc(o.label)+'</option>'; });
  return h + '</select></label>';
}

// Mesa/Boogie TriAxis: nine programmable parameters on 2-digit LED displays with ◀ ▶ keys,
// and eight preamp modes (RHY G/Y, LD1 G/Y/R, LD2 G/Y/R) used as channels. Lead drives
// apply only in their lead modes. Optionally followed by the Simul-Class 2:Ninety power amp.
const TX_SEG = { a:[2,0,10,2.4], b:[11.6,2,2.4,9], c:[11.6,13,2.4,9], d:[2,21.6,10,2.4], e:[0,13,2.4,9], f:[0,2,2.4,9], g:[2,10.8,10,2.4] };
const TX_DIG = ['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const TX_MODES = [['RHY', [1,2]], ['LD1', [3,4,5]], ['LD2', [6,7,8]]];
const TX_LED = ['#3fd24a', '#f2c230', '#ff3b2a']; // green, yellow, red by position in the row
function txDigit(d, x, dp){
  let s = '<g transform="translate('+x+' 1) skewX(-6)">';
  Object.keys(TX_SEG).forEach(k => { const [sx, sy, w, h] = TX_SEG[k]; s += '<rect x="'+sx+'" y="'+sy+'" width="'+w+'" height="'+h+'" rx="1" fill="'+(TX_DIG[d].includes(k) ? '#ff3b2a' : '#1e0907')+'"/>'; });
  return s + '<circle cx="16.5" cy="23" r="1.4" fill="'+(dp ? '#ff3b2a' : '#1e0907')+'"/></g>';
}
function txDisplaySVG(v){
  const t = Math.round(v*10), i = Math.floor(t/10);
  return '<svg viewBox="0 0 38 26" width="46" height="31" aria-hidden="true">'+(i >= 10 ? txDigit(1, 3, false)+txDigit(0, 21, false) : txDigit(i, 3, true)+txDigit(t % 10, 21, false))+'</svg>';
}
function txParamHTML(def, as, c){
  const n = as.channel, v = as.global[c.key], on = available(c, n), off = on ? '' : ' (not used in '+chName(def, n)+')';
  let h = '<div class="txp'+(on ? '' : ' txoff')+'">'
    + '<label class="txctl"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label)+off)+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="txdisp" data-drag="knob" data-ctrl="'+c.key+'" data-ch="">'+txDisplaySVG(v)+'</span></label>'
    + '<span class="txlab">'+esc(c.label)+'</span><span class="txkeys">';
  [[-1, 'Decrease', 'M10 3 L4 8 L10 13Z', 'dn'], [1, 'Increase', 'M6 3 L12 8 L6 13Z', 'up']].forEach(([d, word, path, id]) => {
    h += '<button id="tx-'+id+'-'+c.key+'" class="txkey" aria-label="'+esc(word+' '+nice(c.label)+', now '+f1(v)+off)+'"'
      + ' data-act="pick" data-target="ctrl" data-key="'+c.key+'" data-ch="" data-v="'+jattr(snap(c, v + d*c.step))+'">'
      + '<span class="txcap"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="'+path+'" fill="#1b1b1a"/></svg></span></button>';
  });
  return h + '</span>'+(on ? '' : '<span class="txna">not in mode</span>')+'</div>';
}
function txModesHTML(def, as){
  const n = as.channel;
  let h = '<div class="txmodes" role="group" aria-label="Preamp mode">';
  TX_MODES.forEach(([row, ns]) => {
    h += '<span class="txrow">'+row+'</span>';
    ns.forEach((m, i) => {
      const on = m === n;
      h += '<button id="mode-'+m+'" class="txled'+(on ? ' on' : '')+'" style="--c:'+TX_LED[i]+'" aria-pressed="'+on+'" aria-label="'+esc('Mode '+chName(def, m))+'" data-act="channel" data-n="'+m+'"><span class="txdot" aria-hidden="true"></span></button>';
    });
    if (ns.length < 3) h += '<span></span>';
  });
  return h + '<span class="txnow" aria-hidden="true">MODE · '+esc(chName(def, n))+'</span></div>';
}
function txRack(inner, label){
  const ear = '<span class="txear" aria-hidden="true"><i></i><i></i></span>';
  return '<div class="txrack" role="group" aria-label="'+esc(label)+'">'+ear+'<div class="txface">'+inner+'</div>'+ear+'</div>';
}
function triaxisPanelHTML(def, as){
  let h = '<div class="txinner"><div class="txparams">';
  def.panelOrder.forEach(key => { h += txParamHTML(def, as, def.controls.find(c => c.key === key)); });
  h += '</div><div class="txside"><div class="txname">'
    + '<button id="tx-modekey" class="txkey" aria-label="'+esc('Mode: next preamp mode, now '+chName(def, as.channel))+'" data-act="cycle" data-target="channel"><span class="txcap">MODE</span></button>'
    + '<span class="txmodel">TRIAXIS</span><span class="txbrand">MESA/BOOGIE</span><span class="txsub">ALL TUBE PREAMPLIFIER</span></div>'
    + txModesHTML(def, as) + '</div></div>';
  return txRack(h, 'Mesa/Boogie TriAxis front panel');
}
function s290KnobHTML(c, v, lab){
  const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1);
  return '<div class="s9k"><label class="kctl"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc('Power amp '+nice(lab))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><g transform="rotate('+angle+' 28 28)">'
    + '<circle cx="28" cy="28" r="19" fill="#0e0e0e" stroke="#3c3c3a" stroke-width="1.2"/><circle cx="28" cy="28" r="14.5" fill="none" stroke="#262625" stroke-width="1"/>'
    + '<path d="M28 11 L28 17" stroke="#e6e3d8" stroke-width="2.4" stroke-linecap="round"/></g></svg></span></label>'
    + '<span class="s9lab">'+esc(lab)+'</span><span class="jro" aria-hidden="true">'+f1(v)+'</span></div>';
}
const S9_VENT = (function(){ let s = '<svg class="s9vent" viewBox="0 0 170 60" width="170" height="60" aria-hidden="true">'; for (let i = 0; i < 15; i++) s += '<rect x="'+(2 + i*11.2)+'" y="2" width="6" height="56" rx="3" fill="#050505"/>'; return s + '</svg>'; })();
function s290PanelHTML(def, as){
  const g = as.global, C = (k) => def.controls.find(c => c.key === k);
  let leds = '<div class="s9leds" role="group" aria-label="Power amp switches (indicator LEDs)">';
  [['deep', 'DEEP'], ['halfDrive', '1/2 DRIVE'], ['modern', 'MODERN']].forEach(([key, lab]) => {
    const on = g[key] === true;
    leds += '<button id="p-'+key+'-" class="s9led" aria-pressed="'+on+'" aria-label="'+esc(nice(lab)+': '+(on ? 'on' : 'off'))+'"'
      + ' data-act="pick" data-target="ctrl" data-key="'+key+'" data-ch="" data-v="'+jattr(!on)+'"><span class="s9tag">'+lab+'</span><span class="s9dot" aria-hidden="true"></span><span class="s9st">'+(on ? 'ON' : 'OFF')+'</span></button>';
  });
  leds += '</div>';
  const mid = '<div class="s9mid">'+leds+'<div class="s9knobs">'+s290KnobHTML(C('level'), g.level, 'LEVEL')+s290KnobHTML(C('powerPresence'), g.powerPresence, 'PRESENCE')+'</div></div>';
  return txRack('<div class="s9face"><span class="s9title">Mesa/Boogie Stereo Simul-Class 2:Ninety</span><div class="s9row">'+S9_VENT+mid+S9_VENT+'</div></div>', 'Mesa/Boogie Simul-Class 2:Ninety front panel');
}

// Aguilar Tone Hammer 500: compact single-channel bass head with a silver faceplate. The six
// recorded knobs sit in two staggered rows as on the panel: Gain · Mid Level · Bass over
// Drive · Mid Freq · Treble. Master, pad, jacks and switches are not recorded, so not shown.
const TH_POS = { gain:[42,0], midlevel:[132,0], bass:[222,0], drive:[88,96], midfreq:[178,96], treble:[268,96] };
function thKnobHTML(c, v, x, y){
  const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1);
  return '<div class="thk" style="left:'+x+'px;top:'+y+'px"><span class="thlab">'+esc(c.label)+'</span>'
    + '<label class="kctl"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><g transform="rotate('+angle+' 28 28)">'
    + '<circle cx="28" cy="28" r="18.5" fill="#141414" stroke="#000" stroke-width="1.2"/><circle cx="28" cy="28" r="14" fill="none" stroke="#2c2c2c" stroke-width="1"/>'
    + '<path d="M28 11.5 L28 20" stroke="#f2f2f2" stroke-width="2.4" stroke-linecap="round"/></g></svg></span></label>'
    + '<span class="jro" aria-hidden="true">'+f1(v)+'</span></div>';
}
function toneHammerPanelHTML(def, as){
  let h = '<div class="thface" role="group" aria-label="Aguilar Tone Hammer 500 front panel"><div class="thknobs">';
  def.panelOrder.forEach(key => { const [x, y] = TH_POS[key]; h += thKnobHTML(def.controls.find(c => c.key === key), as.global[key], x, y); });
  return h + '</div><div class="thname"><span class="thmodel">TONE HAMMER 500</span><span class="thbrand">AGUILAR</span></div></div>';
}

// Ibanez TS9 Tube Screamer: only the control area of the pedal is drawn (lime-green paint):
// Drive and Level (large knobs, labels below) flank a smaller Tone knob set lower (label above).
// Knurled black skirts, silver caps, printed segmented scale rings. The name sits in a slim plate
// below, where the pedal's name plate is; LED, jacks, footswitch and body are cropped away.
const TS9_POS = { drive:{ x:58, y:46, r:44, lab:[58, 100] }, level:{ x:214, y:46, r:44, lab:[214, 100] }, tone:{ x:136, y:112, r:36, lab:[136, 52], ro:[136, 156] } };
function ts9KnobHTML(c, v, p){
  const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1), size = p.r*2 + 4, m = size/2, sk = p.r*0.72, cap = p.r*0.5;
  // printed scale: ten wide arc segments with narrow gaps, open at the bottom
  let ring = '';
  const rr = p.r - 5, pt = (deg) => (m + rr*Math.sin(deg*Math.PI/180)).toFixed(1)+' '+(m - rr*Math.cos(deg*Math.PI/180)).toFixed(1);
  for (let i = 0; i < 10; i++) { const a0 = -150 + i*30 + 4, a1 = a0 + 22; ring += 'M'+pt(a0)+' A'+rr+' '+rr+' 0 0 1 '+pt(a1); }
  return '<div class="tsk" style="left:'+p.x+'px;top:'+p.y+'px"><label class="kctl" style="width:'+size+'px;height:'+size+'px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:'+size+'px;height:'+size+'px" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" aria-hidden="true">'
    + '<path d="'+ring+'" stroke="#141414" stroke-width="8" fill="none"/><g transform="rotate('+angle+' '+m+' '+m+')">'
    + '<circle cx="'+m+'" cy="'+m+'" r="'+sk.toFixed(1)+'" fill="#151515" stroke="#3a3a3a" stroke-width="1.6" stroke-dasharray="1.2 1.6"/>'
    + '<circle cx="'+m+'" cy="'+m+'" r="'+cap.toFixed(1)+'" fill="#cfd2d4" stroke="#8e9296" stroke-width="1"/>'
    + '<path d="M'+m+' '+(m - cap + 2).toFixed(1)+' L'+m+' '+(m - cap*0.35).toFixed(1)+'" stroke="#141414" stroke-width="2.6" stroke-linecap="round"/></g></svg></span></label></div>';
}
function ts9PanelHTML(def, as){
  let h = '<div class="tsface" role="group" aria-label="Ibanez TS9 Tube Screamer controls"><div class="tsknobs">';
  def.panelOrder.forEach(key => {
    const c = def.controls.find(x => x.key === key), p = TS9_POS[key], v = as.global[key];
    h += ts9KnobHTML(c, v, p);
    const ro = '<span class="jro" aria-hidden="true">'+f1(v)+'</span>';
    if (p.ro) h += '<div class="tslab" style="left:'+p.lab[0]+'px;top:'+(p.lab[1] - 18)+'px"><span class="tsl">'+esc(c.label)+'</span></div><div class="tslab" style="left:'+p.ro[0]+'px;top:'+p.ro[1]+'px">'+ro+'</div>';
    else h += '<div class="tslab" style="left:'+p.lab[0]+'px;top:'+p.lab[1]+'px"><span class="tsl">'+esc(c.label)+'</span>'+ro+'</div>';
  });
  // Name where the pedal prints it: the name plate below the controls (plain text, one line)
  return h + '</div><div class="tsplate"><span>IBANEZ</span><span>TS9 Tube Screamer</span></div></div>';
}

// Origin Effects Cali76: the black control panel inside a thin silver margin, as on the pedal:
// DRY · OUT · IN over RATIO · ATTACK · RELEASE (top labels below, bottom labels above), large
// brushed-silver knobs, and the model name at the panel's bottom edge. DRY is not recorded by
// any capture (shown, not matched). Ratio is a 4-position knob (4/8/12/20:1). Jacks, meter,
// LED, logo and footswitch are cropped away.
const CA76_POS = { dry:[50,46], output:[148,46], inputcomp:[246,46], ratio:[50,176], attack:[148,176], release:[246,176] };
const CA76_LAB = { dry:94, output:94, inputcomp:94, ratio:121, attack:121, release:121 };
function ca76KnobSVG(angle, r){
  const size = r*2 + 4, m = size/2, rad = (deg) => deg*Math.PI/180;
  const dot = (deg) => '<circle cx="'+(m + (r + 0)*Math.sin(rad(deg))).toFixed(1)+'" cy="'+(m - (r + 0)*Math.cos(rad(deg))).toFixed(1)+'" r="1.6" fill="#bdbdbd"/>';
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" aria-hidden="true">'+dot(-150)+dot(150)
    + '<g transform="rotate('+angle+' '+m+' '+m+')"><circle cx="'+m+'" cy="'+m+'" r="'+(r - 5)+'" fill="#d3d6d9" stroke="#8f9499" stroke-width="1.2"/>'
    + '<circle cx="'+m+'" cy="'+m+'" r="'+(r - 9)+'" fill="none" stroke="#e4e6e8" stroke-width="1"/>'
    + '<path d="M'+m+' '+(m - (r - 7))+' L'+m+' '+(m - (r - 7)*0.45).toFixed(1)+'" stroke="#141414" stroke-width="3" stroke-linecap="round"/></g></svg>';
}
function ca76KnobHTML(c, v){
  const [x, y] = CA76_POS[c.key], r = 40, size = r*2 + 4, angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1);
  return '<div class="cak" style="left:'+x+'px;top:'+y+'px"><label class="kctl" style="width:'+size+'px;height:'+size+'px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label)+(c.weight > 0 ? '' : ' (not used for matching)'))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:'+size+'px;height:'+size+'px" data-drag="knob" data-ctrl="'+c.key+'" data-ch="">'+ca76KnobSVG(angle, r)+'</span></label>'
    + '<span class="ro" aria-hidden="true">'+f1(v)+'</span></div>';
}
// Ratio: four detents; the knob cycles, the printed numbers pick a position.
function ca76RatioHTML(c, v){
  const [x, y] = CA76_POS.ratio, r = 40, size = r*2 + 4, n = c.options.length, idx = Math.max(0, c.options.findIndex(o => o.v === v));
  const deg = (i) => -135 + i*270/(n - 1);
  let h = '<div class="cak" style="left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px">'+ca76KnobSVG(deg(idx), r)
    + '<button class="cacycle" tabindex="-1" aria-hidden="true" data-act="cycle" data-target="ctrl" data-key="ratio" data-ch=""></button></div>';
  c.options.forEach((o, i) => {
    const a = deg(i)*Math.PI/180, px = x + (r + 13)*Math.sin(a), py = y - (r + 13)*Math.cos(a);
    h += '<button id="t-ratio--'+i+'" class="carat" style="left:'+px.toFixed(1)+'px;top:'+py.toFixed(1)+'px" aria-pressed="'+(o.v === v)+'" aria-label="'+esc('Ratio '+o.label)+'"'
      + ' data-act="pick" data-target="ctrl" data-key="ratio" data-ch="" data-v="'+jattr(o.v)+'">'+o.v+'</button>';
  });
  return h;
}
function cali76PanelHTML(def, as){
  let h = '<div class="caface" role="group" aria-label="Origin Effects Cali76 controls"><div class="capanel"><span class="cadiv" aria-hidden="true"></span>';
  def.panelOrder.forEach(key => {
    const c = def.controls.find(x => x.key === key), v = as.global[key];
    h += key === 'ratio' ? ca76RatioHTML(c, v) : ca76KnobHTML(c, v);
    h += '<span class="calab" style="left:'+CA76_POS[key][0]+'px;top:'+CA76_LAB[key]+'px">'+(c.weight > 0 ? '' : '<span class="nsmark" aria-hidden="true" style="color:#9a9a9a">⊘</span>')+esc(c.label)+'</span>';
  });
  // Name where the pedal prints it: at the bottom edge of the black panel (plain text)
  return h + '<div class="caname" aria-hidden="true"><b>Cali76</b><span>FET COMPRESSOR</span></div></div></div>';
}

// Darkglass Microtubes B7K Ultra (the Neural DSP Darkglass Ultra / Ultimate plugins' pedal):
// the black faceplate with MASTER · BLEND | LEVEL · DRIVE over BASS · LO MIDS | HI MIDS · TREBLE,
// the ATTACK / LO MIDS and GRUNT / HI MIDS 3-way toggles between each knob pair (mid toggles
// labelled with the frequencies printed on the pedal, in its order), and the recorded DISTORTION
// footswitch. Bypass, LEDs, jacks and the enclosure are cropped away.
const B7_KNOB = { master:[26,30], blend:[122,30], level:[208,30], drive:[304,30], bass:[26,100], lomids:[122,100], himids:[208,100], treble:[304,100] };
const B7_TOG = { attack:[64,40,'ATTACK'], lomidsswitch:[64,108,'LO MIDS'], grunt:[246,40,'GRUNT'], himidsswitch:[246,108,'HI MIDS'] };
function b7KnobHTML(c, v){
  const [x, y] = B7_KNOB[c.key], r = 23, size = r*2 + 2, m = size/2, angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1);
  return '<div class="b7k" style="left:'+x+'px;top:'+y+'px"><label class="kctl" style="width:'+size+'px;height:'+size+'px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:'+size+'px;height:'+size+'px" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" aria-hidden="true"><g transform="rotate('+angle+' '+m+' '+m+')">'
    + '<circle cx="'+m+'" cy="'+m+'" r="'+(r - 1)+'" fill="#0f0f0f" stroke="#454545" stroke-width="1.4"/><circle cx="'+m+'" cy="'+m+'" r="'+(r - 7)+'" fill="#1a1a1a" stroke="#2c2c2c" stroke-width="1"/>'
    + '<path d="M'+m+' '+(m - r + 4)+' L'+m+' '+(m - r*0.35).toFixed(1)+'" stroke="#f2f2f2" stroke-width="2.6" stroke-linecap="round"/></g></svg></span></label>'
    + '<span class="ro" aria-hidden="true">'+f1(v)+'</span></div>'
    + '<span class="b7lab" style="left:'+x+'px;top:'+(y + 30)+'px">'+esc(c.label)+'</span>';
}
function b7UltraPanelHTML(def, as){
  const g = as.global, C = (k) => def.controls.find(c => c.key === k);
  let h = '<div class="b7face" role="group" aria-label="Darkglass Microtubes B7K Ultra controls"><div class="b7panel">';
  Object.keys(B7_KNOB).forEach(k => { h += b7KnobHTML(C(k), g[k]); });
  Object.entries(B7_TOG).forEach(([k, [x, y, title]]) => {
    const c = C(k);
    h += jpToggle(x, y, c.options, g[k], { key:k, ch:null }, nice(title)+' switch', [{ x:x + 19, y:y - 12 }, { x:x + 21, y }, { x:x + 19, y:y + 12 }], title, y - 26);
  });
  const on = g.distortion === true;
  h += '<button id="p-distortion-" class="b7fs" style="left:68px;top:170px" aria-pressed="'+on+'" aria-label="'+esc('Distortion footswitch: '+(on ? 'on' : 'off'))+'" data-act="pick" data-target="ctrl" data-key="distortion" data-ch="" data-v="'+jattr(!on)+'">'
    + '<span class="cap" aria-hidden="true"></span><span class="led" aria-hidden="true"></span><span class="txt"><span>DISTORTION</span><span>'+(on ? 'ON' : 'OFF')+'</span></span></button>';
  // Name where the pedal prints it: bottom centre, plain text
  return h + '<div class="b7name" aria-hidden="true"><b>MICROTUBES B7K ULTRA</b><span>DARKGLASS ELECTRONICS</span></div></div></div>';
}

// A switch's options on one channel: channels can use different positions of the same switch
// (channelOptions from the build); otherwise all options apply.
function optionsFor(c, n){ const only = c.channelOptions && c.channelOptions[n]; return only ? c.options.filter(o => only.includes(o.v)) : c.options; }

// Bogner Ecstasy 100B: the faceplate under a short grille, in three sections that wrap on narrow
// screens: PRESENCE · EXCURSION · M. VOL. (with the rear-panel SOUND STYLE and VARIAC switches
// where the standby switch and jewel light sit), channel 1 (VOL. 1, TREBLE, MIDDLE, BASS,
// PRE EQ, GAIN 1) and channels 2/3 (VOL. 3, VOL. 2, GAIN MODE CH 3, shared TREBLE/AIR/MIDDLE/
// GAIN/BASS, PRE EQ 3, GAIN 3, PRE EQ 2, GAIN 2). Cream chicken-head knobs over label plates;
// the channel LEDs on the VOL/GAIN plates light for the selected channel. Every physical knob
// is its own control, available only on its channel(s); controls that don't belong to the selected
// channel are dimmed (still adjustable), so the active channel's controls stand out. The preamp-
// and power-amp-section entries use the same faceplate: only the sections and controls a
// definition has are drawn (the badge moves next to the power section when channel 1 is absent).
const BG_LED = { 1:'#46d24a', 2:'#f2f2f2', 3:'#ff3b30' };
const BG_SECTIONS = [
  { w:206, knobs:[['presence', 112, 'PRESENCE'], ['mastervol', 176, 'M. VOL.', 0]], toggles:[['excursion', 144, 'EXCURSION', ['L', 'T']], ['soundstyle', 30, 'SOUND STYLE', ['OLD', 'NEW']], ['variac', 30, 'VARIAC', ['ON', 'OFF'], 52]], rear:true },
  { w:316, knobs:[['vol1', 31, 'VOL. 1', 1], ['treble1', 93, 'TREBLE'], ['middle1', 155, 'MIDDLE'], ['bass1', 217, 'BASS'], ['gain1', 285, 'GAIN 1', 1]], toggles:[['preeq1', 251, 'PRE EQ', ['B1', 'N', 'B2']]], badge:true },
  { w:440, knobs:[['vol3', 31, 'VOL. 3', 3], ['vol2', 93, 'VOL. 2', 2], ['treble23', 155, 'TREBLE'], ['middle23', 217, 'MIDDLE'], ['bass23', 279, 'BASS'], ['gain3', 341, 'GAIN 3', 3], ['gain2', 405, 'GAIN 2', 2]],
    toggles:[['gainmode', 124, 'GAIN MODE CH 3', ['P', 'L']], ['air', 186, 'AIR', ['L', 'H']], ['gainsw', 248, 'GAIN', ['L', 'H']], ['preeq3', 310, 'PRE EQ 3', ['B', 'M', 'D']], ['preeq2', 373, 'PRE EQ 2', ['B', 'M', 'D']]] }
];
const bgOff = (c, as) => available(c, as.channel) ? '' : ' bgoff';
const bgOffAria = (c, as) => available(c, as.channel) ? '' : ', not used on channel '+as.channel;
function bgKnobHTML(c, v, x, plate, led, as){
  const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1), off = bgOff(c, as);
  const aria = nice(plate)+(c.channels ? ' (channel'+(c.channels.length > 1 ? 's ' : ' ')+c.channels.join(' and ')+bgOffAria(c, as)+')' : '');
  const lit = led === 0 ? '#e4c22a' : led && as.channel === led ? BG_LED[led] : null;
  return '<div class="bgk'+off+'" style="left:'+x+'px"><label class="kctl" style="width:44px;height:44px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(aria)+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:44px;height:44px" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><g transform="rotate('+angle+' 22 22)">'
    + '<circle cx="22" cy="22" r="12.5" fill="#e9e5d8" stroke="#8f8b80" stroke-width="1"/><path d="M22 2.5 L27 22 L22 34 L17 22 Z" fill="#f2efe6" stroke="#8f8b80" stroke-width="1" stroke-linejoin="round"/>'
    + '<path d="M22 5 L22 17" stroke="#2a2a2a" stroke-width="1.6" stroke-linecap="round"/></g></svg></span></label><span class="ro" aria-hidden="true">'+f1(v)+'</span></div>'
    + '<span class="bgplate'+off+'" style="left:'+x+'px">'+(led !== undefined ? '<span class="bled" aria-hidden="true"'+(lit ? ' style="background:'+lit+';box-shadow:0 0 0 1px #555"' : '')+'></span>' : '')+esc(plate)+'</span>';
}
// Mini toggles are horizontal on this amp: the lever leans to the chosen position, the printed
// letters under it pick a position.
function bgToggleHTML(c, v, x, title, letters, dy, as){
  const n = c.options.length, idx = Math.max(0, c.options.findIndex(o => o.v === v)), y = dy || 0, off = bgOff(c, as);
  let h = '<span class="bgtitle'+off+'" style="left:'+x+'px;top:'+(4 + y)+'px">'+esc(title)+'</span>'
    + '<button class="bgtgl'+off+'" style="left:'+x+'px;top:'+(15 + y)+'px" tabindex="-1" aria-hidden="true" data-act="cycle" data-target="ctrl" data-key="'+c.key+'" data-ch="">'
    + togHSVG(posFor(idx, n))+'</button>';
  c.options.forEach((o, i) => {
    const lx = x + (n === 2 ? (i ? 9 : -9) : (i - 1)*12);
    h += '<button id="t-'+c.key+'--'+i+'" class="bglet'+off+'" style="left:'+lx+'px;top:'+(37 + y)+'px" aria-pressed="'+(o.v === v)+'" aria-label="'+esc(nice(title)+': '+o.label+bgOffAria(c, as))+'"'
      + ' data-act="pick" data-target="ctrl" data-key="'+c.key+'" data-ch="" data-v="'+jattr(o.v)+'">'+esc(letters[i])+'</button>';
  });
  return h;
}
function ecstasyPanelHTML(def, as){
  const g = as.global, C = (k) => def.controls.find(c => c.key === k);
  const shown = BG_SECTIONS.filter(sec => sec.knobs.concat(sec.toggles).some(([k]) => C(k)));
  const badge = '<span class="bgbadge" aria-hidden="true">ECSTASY<span>BY</span>BOGNER</span>';
  let h = '<div class="bgface" role="group" aria-label="'+esc(def.brand+' '+def.model+' front panel')+'">';
  shown.forEach(sec => {
    h += '<div class="bgsec" style="width:'+sec.w+'px">';
    if (sec.badge) h += badge;
    sec.toggles.forEach(([k, x, title, letters, dy]) => { if (C(k)) h += bgToggleHTML(C(k), g[k], x, title, letters, dy, as); });
    sec.knobs.forEach(([k, x, plate, led]) => { if (C(k)) h += bgKnobHTML(C(k), g[k], x, plate, led, as); });
    if (sec.rear) h += '<span class="bgrear">REAR PANEL</span>';
    h += '</div>';
  });
  if (!shown.some(sec => sec.badge)) h += '<div class="bgsec" style="width:150px">'+badge+'</div>';
  return h + '</div>';
}

// Mesa/Boogie Mark IIC+ (also the Mark III, panel 'markiii': PULL RHYTHM 2 on Middle, the EQ AUTO / IN
// toggle, a dark EQ plate): the black faceplate above the grille (the Boogie logo plate and the input
// jacks are left out), in three fixed-size sections that wrap on narrow screens: the seven knobs
// (VOLUME 1 … LEAD MASTER), the five-band slider EQ, and the recorded rear-panel controls (PRESENCE
// and the SIMUL-CLASS / CLASS A switch) where the EQ, standby and power switches sit. The numbers are
// on each knob's skirt and turn under the printed index line, so the value is the number at the top;
// the PULL labels on either side of the line are the pull switches. Lead Drive, Lead Master and its
// Pull Bright only count with Pull Lead on, so they are dimmed (still adjustable) while it's off.
const MK_KNOBS = [['volume', 34, 'pullbright1', 'BRIGHT'], ['treble', 102, 'pullshifttreble', 'SHIFT'], ['bass', 170, 'pullshiftbass', 'SHIFT'], ['middle', 238, 'pullrhythm2', 'RHYTHM2'], ['master1', 306, 'pulldeep', 'DEEP'], ['leaddrive', 374, 'pulllead', 'LEAD'], ['leadmaster', 442, 'pullbright2', 'BRIGHT']];
const MK_EQ = ['eq80', 'eq240', 'eq750', 'eq2200', 'eq6600'];
const MK_TRAVEL = 70; // fader cap top: 0 at 10 … 70 at 0, in an 80px track (FG.mk)
// skirt numbers 0…10 counter-clockwise from the top, each facing outwards (as printed on the knob)
const MK_NUMS = [0,1,2,3,4,5,6,7,8,9,10].map(v => '<text transform="rotate('+(-30*v)+' 25 25)" x="25" y="8.6" text-anchor="middle" font-size="'+(v === 10 ? 6 : 7)+'" font-family="Barlow Semi Condensed,Arial Narrow,sans-serif" font-weight="600" fill="#e9e1c6">'+v+'</text>').join('');
const mkOff = (as, c) => !!c.requires && as.global[c.requires] !== true;
function mkKnobSVG(c, v){
  const turn = ((v - c.min)/(c.max - c.min)*300).toFixed(1);
  return '<svg viewBox="0 0 50 50" width="50" height="50" aria-hidden="true"><g transform="rotate('+turn+' 25 25)">'
    + '<circle cx="25" cy="25" r="24" fill="#111" stroke="#2f2f2f" stroke-width="1"/>'+MK_NUMS
    + '<circle cx="25" cy="25" r="13.5" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="2" stroke-dasharray="1.3 1.3"/>'
    + '<circle cx="25" cy="25" r="10" fill="#0d0d0d" stroke="#1f1f1f" stroke-width="1"/></g></svg>';
}
function mkKnobHTML(def, as, c, x, pullKey, word, tickTop, extraAria){
  const g = as.global, v = g[c.key], off = mkOff(as, c) ? ' mkoff' : '', note = (extraAria || '')+(off ? ', not used while Pull Lead is off' : '');
  const pc = pullKey ? def.controls.find(k => k.key === pullKey) : null, pulled = !!pc && g[pullKey] === true;
  let h = '<span class="mkidx" style="left:'+x+'px;top:'+tickTop+'px;height:'+(35 - tickTop)+'px" aria-hidden="true"></span>';
  if (pc) {
    const poff = mkOff(as, pc) ? ' mkoff' : '';
    h += '<button id="p-'+pullKey+'-" class="mkpull'+poff+'" style="left:'+x+'px" aria-pressed="'+pulled+'" aria-label="'+esc(pc.label+': '+(pulled ? 'pulled, on' : 'pushed in, off')+(poff ? ', not used while Pull Lead is off' : ''))+'"'
      + ' data-act="pick" data-target="ctrl" data-key="'+pullKey+'" data-ch="" data-v="'+jattr(!pulled)+'"><span class="mkpl"><span class="pdot" aria-hidden="true"></span>PULL</span><span class="mkpr'+(word.length > 6 ? ' long' : '')+'">'+esc(word)+'</span></button>';
  }
  return h + '<div class="mkk'+off+(pulled ? ' pulled' : '')+'" style="left:'+x+'px"><label class="kctl" style="width:50px;height:50px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label)+note)+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:50px;height:50px" data-drag="knob" data-ctrl="'+c.key+'" data-ch="">'+mkKnobSVG(c, v)+'</span></label><span class="ro" aria-hidden="true">'+f1(v)+'</span></div>'
    + '<span class="mklab'+off+'" style="left:'+x+'px">'+esc(c.label)+'</span>';
}
function markIICPanelHTML(def, as){
  const g = as.global, C = (k) => def.controls.find(c => c.key === k);
  let h = '<div class="mkface'+(def.panel === 'markiii' ? ' m3' : '')+'" role="group" aria-label="'+esc(def.brand+' '+def.model+' front panel')+'">';
  h += '<div class="mksec" style="width:476px"><span class="mkbar" aria-hidden="true"></span>';
  MK_KNOBS.forEach(([k, x, pull, word]) => { h += mkKnobHTML(def, as, C(k), x, pull, word, 0); });
  h += '</div><div class="mksec" style="width:186px" role="group" aria-label="Graphic EQ"><span class="mkeqplate" aria-hidden="true"><i style="top:22px"></i><i style="top:45px"></i><i style="top:68px"></i></span>';
  MK_EQ.forEach((k, i) => {
    const c = C(k), v = g[k], x = 27 + 33*i, top = (1 - (v - c.min)/(c.max - c.min))*MK_TRAVEL;
    h += '<label class="mkf" style="left:'+(x - 11)+'px">'+faderInput(c, null, v, 'EQ ')
      + '<span class="mktrack" data-drag="fader" data-geo="mk" data-ctrl="'+k+'" data-ch=""><span class="mkslot"></span><span class="fcap mkcap" style="top:'+top.toFixed(1)+'px"></span></span></label>'
      + '<span class="mkfreq" style="left:'+x+'px">'+esc(c.label.replace('Hz', ''))+'</span><span class="ro mkfro" style="left:'+x+'px" aria-hidden="true">'+f1(v)+'</span>';
  });
  // right of the EQ: the EQ AUTO / IN toggle where the amp has it (when recorded), then the recorded
  // rear-panel controls (Presence, Simul-Class / Class A) where the standby and power switches sit
  const eq = C('eqmode'), pm = C('powermode'), px = eq ? 104 : 40;
  h += '</div><div class="mksec" style="width:160px">';
  if (eq) h += jpToggle(28, 58, eq.options, g.eqmode, {key:'eqmode', ch:null}, 'EQ auto or in', [{x:28, y:31}, {x:28, y:85}]);
  h += mkKnobHTML(def, as, C('presence'), px, null, '', 26, ' (rear panel)');
  if (pm) h += jpToggle(118, 58, pm.options, g.powermode, {key:'powermode', ch:null}, 'Simul-Class or Class A (rear panel)', [{x:118, y:31}, {x:118, y:85}]);
  h += '<span class="mkrear" style="left:'+(px - 34)+'px">REAR PANEL</span><span class="mkname">'+esc('MESA/BOOGIE '+def.model.toUpperCase())+'</span></div>';
  return h + '</div>';
}

// Fender Hot Rod Deluxe: the black top panel above the grille, with the name as plain text where the
// logo plate sits (the input, preamp out / power amp in / footswitch jacks, jewel light, standby and
// power switches are left out). Left→right: NORMAL BRIGHT, VOLUME, MORE DRIVE, DRIVE (with the drive
// channel's yellow LED), TREBLE, BASS, MIDDLE, CHANNEL SELECT, MASTER, REVERB, PRESENCE. Cream pointer
// knobs over printed 1–12 scales (0, written in a few captures, sits fully counter-clockwise like 1);
// square push buttons with their labels underneath. CHANNEL SELECT picks the channel (no tabs), and the
// controls the selected channel doesn't use are dimmed. The power amp section entry draws only its
// Presence knob.
const HR_ITEMS = [['normalbright', 28, ['NORMAL', 'BRIGHT']], ['volume', 63], ['moredrive', 97, ['MORE', 'DRIVE']], ['drive', 133], ['@led', 167], ['treble', 202], ['bass', 262], ['middle', 321], ['@select', 355, ['CHANNEL', 'SELECT']], ['master', 391], ['reverb', 450], ['presence', 510]];
const HR_ANG = (n) => -150 + (n - 1)*300/11; // printed 1 … 12 across the knob's travel
const HR_SCALE = (function(){
  let s = '<svg class="hrscale" viewBox="0 0 66 66" width="66" height="66" aria-hidden="true">';
  for (let n = 1; n <= 12; n++) { const a = HR_ANG(n)*Math.PI/180; s += '<text x="'+(33 + 25.5*Math.sin(a)).toFixed(1)+'" y="'+(35.5 - 25.5*Math.cos(a)).toFixed(1)+'" text-anchor="middle" font-size="7" font-family="Barlow Semi Condensed,Arial Narrow,sans-serif" font-weight="600" fill="#e6e1cc">'+n+'</text>'; }
  return s + '</svg>';
})();
const hrOff = (c, as) => c.channels && !available(c, as.channel) ? ' hroff' : '';
const hrOffAria = (def, c, as) => hrOff(c, as) ? ', not used on the '+chName(def, as.channel)+' channel' : '';
function hrKnobHTML(def, c, v, x, as){
  const off = hrOff(c, as), angle = HR_ANG(Math.min(12, Math.max(1, v))).toFixed(1);
  return '<span class="hrlab'+off+'" style="left:'+x+'px">'+(c.weight === 0 ? '<span class="nsmark" aria-hidden="true">⊘</span>' : '')+esc(c.label)+'</span>'
    + '<span class="hrsc'+off+'" style="left:'+x+'px">'+HR_SCALE+'</span>'
    + '<div class="hrk'+off+'" style="left:'+x+'px"><label class="kctl" style="width:44px;height:44px"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
    + ' aria-label="'+esc(nice(c.label)+(c.weight > 0 ? '' : ' (not used for matching)')+hrOffAria(def, c, as))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
    + '<span class="kwrap" style="width:44px;height:44px" data-drag="knob" data-ctrl="'+c.key+'" data-ch=""><svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><g transform="rotate('+angle+' 22 22)">'
    + '<path d="M22 2.5 L30.3 17.4 A9.5 9.5 0 1 1 13.7 17.4 Z" fill="#ebe7d3" stroke="#a29d88" stroke-width="1" stroke-linejoin="round"/>'
    + '<path d="M22 5.5 L22 15" stroke="#6d6857" stroke-width="1.3" stroke-linecap="round"/></g></svg></span></label></div>'
    + '<span class="ro hrro'+off+'" style="left:'+x+'px" aria-hidden="true">'+f1(v)+'</span>';
}
function hrButtonHTML(def, c, v, x, lines, as){
  const off = hrOff(c, as), on = v === true;
  return '<button id="p-'+c.key+'-" class="hrbtn'+off+'" style="left:'+x+'px" aria-pressed="'+on+'" aria-label="'+esc(nice(c.label)+': '+(on ? 'on (pushed in)' : 'off')+hrOffAria(def, c, as))+'"'
    + ' data-act="pick" data-target="ctrl" data-key="'+c.key+'" data-ch="" data-v="'+jattr(!on)+'"><span class="hrcap" aria-hidden="true"></span><span class="hrbl">'+lines.map(esc).join('<br>')+'</span></button>';
}
function hotRodPanelHTML(def, as){
  const g = as.global, C = (k) => def.controls.find(c => c.key === k), full = !!def.channels;
  const items = full ? HR_ITEMS : HR_ITEMS.filter(([k]) => C(k)).map(([k, , l], i) => [k, 40 + 60*i, l]);
  let h = '<div class="hrface" role="group" aria-label="'+esc(def.brand+' '+def.model+' top panel')+'"><div class="hrsec" style="width:'+(full ? 540 : 20 + 60*items.length)+'px">';
  items.forEach(([k, x, lines]) => {
    if (k === '@led') h += '<span class="hrled'+(as.channel === 2 ? ' on' : '')+'" style="left:'+x+'px" aria-hidden="true"></span>';
    else if (k === '@select') {
      const other = def.channels.find(c => c.n !== as.channel);
      h += '<button id="hr-select" class="hrbtn sel" style="left:'+x+'px" aria-label="'+esc('Channel select: '+chName(def, as.channel)+' channel selected; press for '+other.name)+'" data-act="channel" data-n="'+other.n+'"><span class="hrcap" aria-hidden="true"></span><span class="hrbl">'+lines.join('<br>')+'</span></button>'
        + '<span class="ro hrchro" style="left:'+x+'px" aria-hidden="true">'+esc(chName(def, as.channel).toUpperCase())+'</span>';
    }
    else if (C(k)) h += C(k).kind === 'switch' ? hrButtonHTML(def, C(k), g[k], x, lines, as) : hrKnobHTML(def, C(k), g[k], x, as);
  });
  return h + '</div></div>';
}

// Generic panels (gear without a custom panel), laid out by heuristics with nothing gear-specific.
// Amps are wide, so everything runs horizontally: the gear name on one line on top, then one section
// per channel (plus any global controls), as many side by side as fit. Inside a section the blocks
// sit left to right: switches (up to three rows tall), knobs, EQ sliders. Knobs follow a typical
// signal-flow order (gain stages, the tone stack bass → treble, presence-type controls, others,
// output levels last) on one row when it fits, else on two rows read column by column (Gain 1 over
// Gain 2, Bass over Middle…). Switches come in the order of the knob their name relates to (a shared
// word such as Gain More/Less → Gain, or a usual pairing such as Bright → Treble), with unrelated
// ones (modes, voicings) first. Blocks wrap under each other only when even that doesn't fit.
const GL = { kw:66, kgap:8, bgap:16, pad:26, sgap:8, head:40, swh:56, krow:92, frow:166, fw:38 };
const G_OUT = /\b(master|output|level|out)\b/, G_STAGE = /\b(input|pre-?amp|gain|drive|overdrive|distortion|fuzz|sustain|saturation)\b/;
// first match wins: output levels, then tone-stack words (so "Treble Crunch" is a treble knob), then gain stages
const G_RANK = [
  [G_OUT, 9],
  [/\blo(?:w)?[ -]?mids?\b/, 4], [/\bhi(?:gh)?[ -]?mids?\b/, 6],
  [/\b(bass|lows?)\b/, 3], [/\b(mid|mids|middle|midrange)\b/, 5], [/\b(treble|highs?)\b/, 7], [/\btone\b/, 6],
  [/\b(presence|resonance|depth|deep|contour|bright|air|focus|texture|shape)\b/, 8],
  [G_STAGE, 1]
];
const gLabel = (c) => String(nice(c.label)).toLowerCase().replace(/([a-z])(\d)/g, '$1 $2'); // "Gain2" reads as "gain 2"
function gRank(c, knobs){
  const l = gLabel(c);
  // "Volume" is a gain stage, unless the section also has a gain/drive knob and no master
  if (/\bvol(?:ume)?\b/.test(l) && !/\b(master|output|level)\b/.test(l)) {
    const stage = knobs.some(k => k !== c && G_STAGE.test(gLabel(k))), master = knobs.some(k => G_OUT.test(gLabel(k)));
    return stage && !master ? 9 : 1;
  }
  const hit = G_RANK.find(([re]) => re.test(l));
  return hit ? hit[1] : 8.5;
}
function gOrder(knobs){
  const num = (c) => { const m = gLabel(c).match(/(\d+)\s*$/); return m ? Number(m[1]) : 0; };
  return knobs.map((c, i) => [gRank(c, knobs), num(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(x => x[3]);
}
// Which knob a switch belongs with, from their names: a shared word first (Gain More/Less → Gain 1,
// Open/Focused → Mid Open), else a usual pairing (Bright → Treble, Scoop → Middle, Deep → Bass,
// Boost → Gain, Power → Master). -1 when nothing relates.
const G_STOP = new Set(['on', 'off', 'switch', 'pull', 'push', 'mode', 'ch', 'channel', 'select', 'the', 'and', 'lo', 'hi', 'low', 'high', 'in', 'out', 'auto', 'vol', 'volume']);
const G_PAIR = [['gain', /\b(gain|drive|overdrive|boost|more|less|crunch|saturation|input)\b/], ['treble', /\b(treble|bright|brilliance|sparkle|highs?)\b/],
  ['mid', /\b(mid|mids|middle|scoop|contour)\b/], ['bass', /\b(bass|deep|depth|bottom|thick|fat|lows?)\b/], ['presence', /\bpresence\b/], ['out', /\b(master|output|level|power)\b/]];
const gWords = (c) => gLabel(c).split(/[^a-z0-9]+/).filter(w => w && !G_STOP.has(w) && !/^\d+$/.test(w));
const gPair = (c) => { const l = gLabel(c), p = G_PAIR.find(([, re]) => re.test(l)); return p ? p[0] : null; };
function gRelated(sw, knobs){
  const ws = gWords(sw);
  let best = -1, most = 0;
  knobs.forEach((k, i) => { const shared = gWords(k).filter(w => ws.includes(w)).length; if (shared > most) { most = shared; best = i; } });
  if (best >= 0) return { k:best, tier:2 };
  const p = gPair(sw), i = p ? knobs.findIndex(k => gPair(k) === p) : -1;
  return i >= 0 ? { k:i, tier:1 } : { k:-1, tier:0 };
}
// Switches: unrelated ones first (as recorded), then in the order of the knob each relates to.
function gSwitchOrder(switches, knobs){
  const rel = switches.map(c => gRelated(c, knobs).k);
  return switches.map((c, i) => [rel[i], i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}
// Estimated width of a switch: lever + its longest option label, or its title if wider.
function gSwitchW(c, n){ return Math.max(62, 30 + Math.max(...optionsFor(c, n).map(o => String(o.label).length))*5.6, String(c.label).length*6.4); }
// The switch block: up to three rows, filled column by column, columns as even as possible.
function gSwitchBlock(ws){
  const m = ws.length; if (!m) return { rows:0, width:0, height:0 };
  const cols = Math.ceil(m / 3), rows = Math.ceil(m / cols);
  let width = (cols - 1)*GL.kgap*2;
  for (let c = 0; c < cols; c++) width += Math.max(...ws.slice(c*rows, c*rows + rows));
  return { rows, width, height:rows*GL.swh };
}
const gKnobW = (cols) => cols ? cols*GL.kw + (cols - 1)*GL.kgap : 0;
// One section for an inner width: its blocks side by side, knobs on one row if that fits, else two;
// if even two rows don't fit, the blocks wrap and the knobs take as many rows as they need.
function gSecLayout(s, inner){
  const n = s.knobs.length, sw = gSwitchBlock(s.swW), fw = s.faders.length*GL.fw, head = s.head ? GL.head : 0;
  const blocks = (kw) => [sw.width, kw, fw].filter(Boolean);
  for (const rows of n > 1 ? [1, 2] : [Math.min(n, 1)]) {
    const parts = blocks(gKnobW(Math.ceil(n / Math.max(rows, 1)))), width = parts.reduce((a, b) => a + b, 0) + (parts.length - 1)*GL.bgap;
    if (width <= inner) return { rows, sw, wrapped:false, width, height:head + Math.max(sw.height, rows*GL.krow, fw ? GL.frow : 0) };
  }
  let rows = 2; while (rows < n && gKnobW(Math.ceil(n / rows)) > inner) rows++;
  const width = Math.max(sw.width, gKnobW(Math.ceil(n / rows)), fw);
  return { rows, sw, wrapped:true, width, height:head + sw.height + rows*GL.krow + (fw ? GL.frow : 0) };
}
// How many sections side by side for the available width W (px): the most that fit without wrapping
// a section's blocks; only balanced rows of sections (four → 4 × 1 or 2 × 2, never 3 + 1).
function gPlan(secs, W){
  let fallback = null;
  for (let cols = Math.min(secs.length, 4); cols >= 1; cols--) {
    const srows = Math.ceil(secs.length / cols);
    if (Math.ceil(secs.length / srows) !== cols) continue;
    const inner = (W - (cols - 1)*GL.sgap)/cols - GL.pad, lays = secs.map(s => gSecLayout(s, inner));
    if (!lays.some(l => l.wrapped)) return { cols, lays };
    fallback = { cols, lays };
  }
  return fallback;
}
// Room for the panel: the stage width minus the bench's side columns and the cabinet's padding.
let gLastW = 0;
function gLayoutWidth(){
  const s = document.getElementById('stage'), w = s && s.clientWidth;
  if (!w) return 1100;
  const wide = w > 700;
  return w - (wide ? 48 : 32) - (wide ? 112 : 0) - (w > 380 ? 46 : 18);
}
function genericPanelHTML(def, as){
  const ch = as.channel, nsm = (c) => c.weight === 0 ? '<span class="nsmark" aria-hidden="true">⊘</span>' : '';
  const secs = [];
  if (def.channels) def.channels.forEach(chn => secs.push({ n:chn.n, title:channelLabel(def, chn.n), channel:true, ctrls:def.controls.filter(c => c.scope === 'channel' && available(c, chn.n)) }));
  const g = def.controls.filter(c => c.scope === 'global');
  if (g.length) secs.push({ n:ch, title:def.globalTitle || (def.channels ? 'Global' : 'Controls'), ctrls:g });
  secs.forEach(s => {
    s.head = s.channel || secs.length > 1;
    s.knobs = gOrder(s.ctrls.filter(c => c.kind === 'knob'));
    s.switches = gSwitchOrder(s.ctrls.filter(c => c.kind === 'switch'), s.knobs); s.swW = s.switches.map(c => gSwitchW(c, s.n));
    s.faders = s.ctrls.filter(c => c.kind === 'fader');
  });
  gLastW = gLayoutWidth();
  const plan = gPlan(secs, gLastW);
  let h = '<div class="gwrap"><div class="gname">'+esc(def.model)+'</div><div class="gsecs" style="grid-template-columns:repeat('+plan.cols+',minmax(0,1fr))">';
  secs.forEach((s, i) => {
    const n = s.n, on = s.channel && n === ch, prefix = s.channel ? s.title+' ' : '', L = plan.lays[i];
    h += '<div class="gsec'+(on ? ' on' : '')+'" role="group" aria-label="'+esc(s.title+(on ? ', selected' : ''))+'">';
    if (s.channel) h += '<button id="gh-'+n+'" class="ghead" data-act="channel" data-n="'+n+'" aria-label="'+esc('Select '+s.title)+'"><span class="led'+(on ? ' lit' : '')+'" aria-hidden="true"></span><span class="silk" style="font-size:12px;font-weight:700">'+esc(s.title)+'</span></button>';
    else if (s.head) h += '<div class="ghead"><span class="silk" style="font-size:12px;font-weight:700">'+esc(s.title)+'</span></div>';
    h += '<div class="gbody'+(L.wrapped ? ' wrapped' : '')+'">';
    if (s.switches.length) {
      h += '<div class="gswitches" style="grid-template-rows:repeat('+L.sw.rows+',auto)">';
      s.switches.forEach(c => {
        const opts = optionsFor(c, n), v = getVal(def, as, c, n), idx = Math.max(0, opts.findIndex(o => o.v === v)), t = {key:c.key, ch:n};
        h += '<div class="gsw" role="group" aria-label="'+esc(prefix+c.label)+'"><div class="gswbody">'
          + '<button class="togbtn" tabindex="-1" aria-hidden="true" data-act="cycle" '+targetAttrs(t)+'>'+togSVG(tip(posFor(idx, opts.length)))+'</button><div class="gopts">';
        opts.forEach((o, j) => {
          h += '<button id="t-'+targetId(t)+'-'+j+'" class="tlbl" aria-pressed="'+(o.v === v)+'" aria-label="'+esc(prefix+c.label+': '+o.label)+'" data-act="pick" '+targetAttrs(t)+' data-v="'+jattr(o.v)+'">'+esc(o.label)+'</button>';
        });
        h += '</div></div><span class="silk">'+nsm(c)+esc(c.label)+'</span></div>';
      });
      h += '</div>';
    }
    if (s.knobs.length) {
      h += '<div class="gknobs" style="grid-template-rows:repeat('+L.rows+',auto)">';
      s.knobs.forEach(c => {
        h += '<div class="gk">'+knobHTML(c, n, getVal(def, as, c, n), prefix, '', '')
          + '<span class="silk" style="text-align:center;white-space:normal;line-height:1.15">'+nsm(c)+esc(c.label)+'</span></div>';
      });
      h += '</div>';
    }
    if (s.faders.length) {
      h += '<div class="gfaders">';
      s.faders.forEach(c => {
        const v = getVal(def, as, c, n), capTop = FG.gen.capTop((v - c.min)/(c.max - c.min));
        h += '<div class="gf"><label style="display:block">'+faderInput(c, n, v, prefix)
          + '<span class="gtrack" data-drag="fader" data-geo="gen" data-ctrl="'+c.key+'" data-ch="'+chAttr(n)+'"><span class="fslot" style="height:120px"></span><span class="fcap" style="top:'+capTop.toFixed(1)+'px"></span></span></label>'
          + '<span class="mono" style="font-size:10px;color:#f0b452">'+f1(v)+'</span><span class="silk" style="font-size:10px">'+esc(c.label.replace('Hz', ''))+'</span></div>';
      });
      h += '</div>';
    }
    h += '</div></div>';
  });
  return h + '</div></div>';
}

function renderStage(){
  const { def, as, ch } = cur();
  if (def.browseOnly) return '<h1 class="cond">Unmapped captures</h1><p class="note">These records are retained for browsing, but have no verified gear mapping and receive no similarity score.</p>';
  if (!def.controls.length) return '<h1 class="cond">'+esc(def.brand+' '+def.model)+'</h1><p class="note">This gear is identified, but its captures do not list interpretable settings. Records remain available below without invented settings or scores.</p>';
  let h = '<div class="stagehead"><div style="display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;min-width:0">'
    + '<h1 class="cond" style="margin:0;font-size:22px;font-weight:700;letter-spacing:.02em;line-height:1.1">'+esc(def.brand+' '+def.model)+'</h1>';
  if (!def.channels && (def.category || 'Amps') === 'Amps') h += '<span class="tagpill" style="border-style:solid">Single channel</span>';
  else if (def.channels && !multiCh(def)) h += '<span class="tagpill" style="border-style:solid">'+esc('Recorded '+channelLabel(def,def.channels[0].n))+'</span>';
  if (state.weightsOpen) h += '<span class="tagpill wtpill" role="status">Editing matching weights · 0 = not matched</span>';
  if (state.loaded && state.loaded.amp === def.id) h += '<span class="tagpill loadpill">Loaded from '+esc(state.loaded.name)
    + '<button id="unload" data-act="unload" aria-label="'+esc('Dismiss: loaded from '+state.loaded.name)+'"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>';
  h += '</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  // TriAxis modes (LED matrix) and Hot Rod channels (CHANNEL SELECT) are picked on the panel, not with tabs.
  if (multiCh(def) && !/^triaxis/.test(def.panel) && def.panel !== 'hotrod') {
    h += '<div role="group" aria-label="Channel" class="chtabs">';
    def.channels.forEach(c => {
      h += '<button id="tab-'+c.n+'" class="chtab sm" aria-pressed="'+(c.n === ch)+'" data-act="channel" data-n="'+c.n+'"><span class="led'+(c.n === ch ? ' lit' : '')+'" aria-hidden="true"></span>'
        + '<span class="cond" style="font-size:15px;font-weight:700;letter-spacing:.04em">'+esc(def.panel === 'generic' ? channelLabel(def,c.n) : 'Ch '+c.n)+'</span>'+(def.panel === 'generic' ? '' : '<span style="font-size:12px;color:#c9c1b3">'+esc(c.name)+'</span>')+'</button>';
    });
    h += '</div>';
  }
  // while editing weights, Reset (settings) gives way to the weight buttons
  if (state.weightsOpen) h += '<button id="wt-reset" class="btn sm" data-act="w-reset"'+(state.weights[def.id] ? '' : ' disabled')+'>Reset weights</button><button id="wt-done" class="btn sm amber" data-act="weights">Done</button></div></div>';
  else h += '<button id="reset" class="btn sm" data-act="reset"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>Reset</button></div></div>';
  let cab;
  if (/^triaxis/.test(def.panel)) {
    // Rack units: no cabinet or grille; the TriAxis sits above the Simul-Class 2:Ninety
    cab = '<div class="cab txcab">' + triaxisPanelHTML(def, as) + (def.panel === 'triaxis290' ? s290PanelHTML(def, as) : '') + '</div>';
  } else if (def.panel === 'ecstasy') {
    // Amp head: a short grille over the faceplate (the logo artwork is left out)
    cab = '<div class="cab bgcab"><div class="bggrille" aria-hidden="true"></div>' + ecstasyPanelHTML(def, as) + '</div>';
  } else if (def.panel === 'markiic' || def.panel === 'markiii') {
    // Amp head: the faceplate above the grille (the logo plate is left out)
    cab = '<div class="cab mkcab">' + markIICPanelHTML(def, as) + '<div class="mkgrille" aria-hidden="true"></div></div>';
  } else if (def.panel === 'hotrod') {
    // Combo: the top panel above the grille, with the name where the logo plate is
    cab = '<div class="cab hrcab">' + hotRodPanelHTML(def, as) + '<div class="hrgrille" aria-hidden="true"><span class="hrplate">FENDER<span>HOT ROD DELUXE</span></span></div></div>';
  } else if (def.panel === 'b7kultra') {
    // Pedal: only the black faceplate with a thin margin of the light enclosure
    cab = '<div class="cab b7cab">' + b7UltraPanelHTML(def, as) + '</div>';
  } else if (def.panel === 'cali76') {
    // Pedal: only the black control panel with a thin margin of the silver enclosure
    cab = '<div class="cab cacab">' + cali76PanelHTML(def, as) + '</div>';
  } else if (def.panel === 'ts9') {
    // Pedal: only the control area, in a thin dark frame; no cabinet or grille
    cab = '<div class="cab tscab">' + ts9PanelHTML(def, as) + '</div>';
  } else if (def.panel === 'tonehammer') {
    // Compact metal head: black chassis frame around the silver faceplate; no tolex or grille
    cab = '<div class="cab thcab">' + toneHammerPanelHTML(def, as) + '</div>';
  } else if (def.panel === 'marshall1987') {
    // Marshall layout: short grille on top, gold control strip below
    cab = '<div class="cab"><div class="jgrille" aria-hidden="true"></div>' + jcmPanelHTML(def, as) + '</div>';
  } else if ((def.category || 'Amps') !== 'Amps') {
    // Pedals and other effects: only the control area, no cabinet or grille
    cab = '<div class="cab pedalcab"><div class="face" role="group" aria-label="'+esc(def.brand+' '+def.model+' controls')+'">'+genericPanelHTML(def, as)+'</div></div>';
  } else {
    cab = '<div class="cab"><div class="face" role="group" aria-label="'+esc(def.brand+' '+def.model+' controls')+'">'
      + (def.panel === 'jp2c' ? jpPanelHTML(def, as) : genericPanelHTML(def, as))
      + '</div><div class="grille" aria-hidden="true"></div></div>';
  }
  if (state.infoOpen) h += '<button class="infoscrim" tabindex="-1" aria-hidden="true" data-act="info-close"></button>';
  // weight editing: the panel is dimmed and locked; each control's weight floats over it (placeWeights)
  if (state.weightsOpen) cab = cab.replace(/^<div class="cab/, '<div inert class="wedit cab');
  const custom = !!state.weights[def.id];
  h += '<div class="bench">'+cab+'<div class="infowrap"><button id="wt-btn" class="infobtn'+(custom ? ' custom' : '')+'" aria-label="'+esc('Matching weights'+(custom ? ' (edited for this gear)' : ''))+'" aria-pressed="'+state.weightsOpen+'" data-act="weights">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>'
    + '<button id="info-btn" class="infobtn" aria-label="Matching details and notes" aria-haspopup="dialog" aria-expanded="'+state.infoOpen+'"'+(state.infoOpen ? ' aria-controls="info-pop"' : '')+' data-act="info">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg></button>'
    + '</div></div>' + (state.infoOpen ? '<div id="info-pop" class="infopop" role="dialog" aria-modal="true" aria-labelledby="info-h">'+renderInfo()+'</div>' : '');
  return h;
}

// One editor per drawn control (per channel when a control is drawn once per channel), centred over the
// union of the elements the panel marks with that control's key: a small value pill whose − / + show
// on hover or focus, so editors stay clear of each other on dense panels.
function placeWeights(){
  if (!state.weightsOpen) return;
  const bench = document.querySelector('#stage .bench'), cab = bench && bench.querySelector('.cab');
  if (!cab) return;
  const { def } = cur(), base = bench.getBoundingClientRect();
  // pill size for collisions: an editor that would cover another moves just below or above it
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches, PW = coarse ? 38 : 34, PH = coarse ? 36 : 26, placed = [];
  const free = (x, y) => placed.every(p => Math.abs(p.x - x) >= PW || Math.abs(p.y - y) >= PH);
  const spot = (x, y) => { for (let k = 0; k < 6; k++) for (const s of k ? [1, -1] : [0]) { const yy = y + s*k*PH; if (free(x, yy)) return yy; } return y; };
  let h = '';
  def.controls.forEach(c => {
    const groups = new Map();
    cab.querySelectorAll('[data-ctrl="'+c.key+'"],[data-key="'+c.key+'"]').forEach(e => {
      const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      const ch = e.dataset.ch || '', g = groups.get(ch);
      groups.set(ch, g ? { l:Math.min(g.l, r.left), t:Math.min(g.t, r.top), r:Math.max(g.r, r.right), b:Math.max(g.b, r.bottom) } : { l:r.left, t:r.top, r:r.right, b:r.bottom });
    });
    groups.forEach((g, ch) => {
      const x = (g.l + g.r)/2 - base.left, y = spot(x, (g.t + g.b)/2 - base.top); placed.push({ x, y });
      const id = 'w-'+c.key+'-'+ch, w = c.weight, label = nice(c.label)+(ch && multiCh(def) ? ' ('+channelLabel(def, Number(ch))+')' : '');
      h += '<div class="wed'+(w === 0 ? ' zero' : w !== c.w0 ? ' edited' : '')+'" role="group" aria-label="'+esc(label+' weight')+'" title="'+esc(label)+'" style="left:'+x.toFixed(1)+'px;top:'+y.toFixed(1)+'px">'
        + '<button id="'+id+'-dec" class="wbtn" data-act="w-step" data-key="'+c.key+'" data-d="-1" aria-label="'+esc('Lower '+label+' weight')+'"'+(w <= 0 ? ' disabled' : '')+'>−</button>'
        + '<input id="'+id+'" class="wval" type="text" inputmode="decimal" value="'+(w === 0 ? '0' : f1(w))+'" data-wkey="'+c.key+'" aria-label="'+esc(label+' weight, 0 to '+W_MAX+'; 0 means not matched')+'">'
        + '<button id="'+id+'-inc" class="wbtn" data-act="w-step" data-key="'+c.key+'" data-d="1" aria-label="'+esc('Raise '+label+' weight')+'"'+(w >= W_MAX ? ' disabled' : '')+'>+</button></div>';
    });
  });
  const layer = document.createElement('div');
  layer.className = 'wlayer'; layer.innerHTML = h;
  bench.appendChild(layer);
}

function chShort(){ const { def, ch } = cur(); return multiCh(def) ? channelLabel(def,ch) : def.model; }

// (i) popover: what is matched, what is shown only, and the panel notes.
function renderInfo(){
  const { def, as, ch } = cur();
  const avail = def.controls.filter(c => available(c, ch));
  const rows = [];
  if (multiCh(def)) rows.push(['Channel', channelLabel(def,ch)]);
  avail.filter(c => c.weight > 0 && c.group !== 'eq').forEach(c => rows.push([nice(c.label), nice(fmtVal(c, getVal(def, as, c, ch)) || '')]));
  const eqC = avail.filter(c => c.group === 'eq');
  if (eqC.length) {
    const req = eqC[0].requires && def.controls.find(x => x.key === eqC[0].requires);
    const off = req && getVal(def, as, req, ch) === false;
    rows.push(['EQ '+eqC.map(c => c.label.replace('Hz', '')).join('/'), off ? 'EQ off · not compared' : eqC.map(c => f1(getVal(def, as, c, ch))).join(' · ')]);
  }
  const nm = avail.filter(c => c.weight === 0).map(c => [nice(c.label), fmtVal(c, getVal(def, as, c, ch))]);
  const dl = (list) => '<dl class="mrows">'+list.map(([k, v]) => '<div class="mrow"><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>';
  let h = '<div class="panel-h"><h2 id="info-h" class="cond" style="margin:0;font-size:20px;font-weight:700;letter-spacing:.03em">Matching on '+esc(chShort())+'</h2>'
    + '<button id="info-close" class="btn sm" data-act="info-close" aria-label="Close matching details"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' + dl(rows);
  if (nm.length) h += '<h3 class="h-kicker" style="margin:0"><span class="nsmark" aria-hidden="true">⊘</span>Not matched</h3>' + dl(nm);
  return h + '<ul class="infonotes">'+(def.defaultsNote ? '<li>'+esc(def.defaultsNote)+'</li>' : '')
    + '<li>Drag knobs and sliders up/down, or Tab to one and use the arrow keys. Click a switch\'s position labels to set it.</li>'
    + '<li>Visual reference only — nothing here controls a physical amp.</li></ul>';
}

function tierOf(score){ return score >= 80 ? ['Close match', 't1'] : score >= STRONG_MATCH_MIN ? ['Partial match', 't2'] : ['Low similarity', 't3']; }
function reasonsHTML(list){ return '<ul class="reasons">'+list.map(z => '<li><span class="mk '+z.kind+'" aria-hidden="true">'+MK[z.kind]+'</span><span><span class="sr">'+SR[z.kind]+'</span>'+esc(z.text)+'</span></li>').join('')+'</ul>'; }
// Neural Capture type: captures without a version are the original Neural Captures (V1).
function captureTypeLabel(c){ return /\bV\d+$/.test(c.captureType) ? c.captureType : c.captureType+' V1'; }
function captureTypeBadge(c){
  const label = captureTypeLabel(c), v = (label.match(/V\d+$/) || ['V1'])[0];
  return '<span class="ncbadge'+(v === 'V1' ? ' v1' : '')+'" title="'+esc(label)+'"><span class="sr">'+esc(label.replace(/\s*V\d+$/, ''))+' </span>'+v+'</span>';
}
function capMeta(def, c){ return (multiCh(def) ? captureChannelLabel(def,c)+' · ' : '')+c.deviceType+' · '+c.instrument+' · gain '+c.gainType; }

function filteredCaptures(){
  const { def } = cur();
  const ampCaps = CAPTURES.filter(c => def.browseOnly ? !c.ampId : c.ampId === def.id);
  return { ampCaps, shown:ampCaps };
}

// Up to three reasons: the lead reason, then differences, then the rest, without repeats.
function cardReasons(list){
  const seen = new Set();
  return [list[0]].concat(list.filter(z => z.kind === 'off'), list.slice(1)).filter(z => z && !seen.has(z.text) && seen.add(z.text)).slice(0, 3);
}
// The capture's own page on Cortex Cloud, from its author and id (opens in a new tab).
function cloudUrl(c){ return c.id && c.author && c.author.username ? 'https://cloud.neuraldsp.com/cloud/u/'+encodeURIComponent(c.author.username)+'/neural-capture/view/'+encodeURIComponent(c.id) : null; }
const EXT_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
function cloudLinkHTML(c, id){
  const u = cloudUrl(c);
  return u ? '<a'+(id ? ' id="'+id+'"' : '')+' class="btn sm extlink" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc('Open '+c.name+' on Cortex Cloud (opens in a new tab)')+'">Cortex Cloud'+EXT_ICON+'</a>' : '';
}
function cardHTML(x, i){
  const { def } = cur(), c = x.c, scored = x.r.status === 'scored';
  const meta = '<div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div class="capname"><h3 class="cond" style="margin:0;font-size:19px;font-weight:700;letter-spacing:.02em;line-height:1.15;overflow-wrap:anywhere">'+esc(c.name)+'</h3>'+captureTypeBadge(c)+'</div>'
    + '<span style="font-size:12.5px;color:var(--muted)">'+esc(capMeta(def, c))+'</span></div>';
  const details = '<button id="open-'+c.id+'" class="btn sm" data-act="open" data-id="'+c.id+'" aria-label="'+esc('Details for '+c.name)+'">Details</button>';
  if (!scored) {
    return '<article class="mcard noscore" aria-label="'+esc(c.name+', no score')+'"><div class="mtop"><span class="rank" aria-hidden="true">–</span><span class="tier t3">No score</span><span class="mscore" aria-hidden="true">—</span></div>'
      + meta + '<span class="bar low" aria-hidden="true"><span style="width:0"></span></span>'
      + reasonsHTML([{kind:'none', text:'Settings not interpreted from the description'}]) + '<div class="mbtns">'+details+cloudLinkHTML(c)+'</div></article>';
  }
  const score = x.r.score, [tier, t] = tierOf(score), best = i === 0 && score >= STRONG_MATCH_MIN;
  return '<article class="mcard'+(best ? ' best' : '')+'" aria-label="'+esc((best ? 'Closest match: ' : 'Rank '+(i + 1)+': ')+c.name+', '+score+' of 100')+'">'
    + '<div class="mtop"><span class="rank">#'+(i + 1)+'</span><span class="tier '+(best ? 'best' : t)+'">'+esc(best ? 'Closest · '+tier.toLowerCase() : tier)+'</span><span class="mscore">'+score+'<span class="sr"> / 100 settings similarity</span></span></div>'
    + meta + '<span class="bar'+(t === 't3' ? ' low' : '')+'" aria-hidden="true"><span style="width:'+score+'%"></span></span>'
    + reasonsHTML(cardReasons(x.r.reasons))
    + '<div class="mbtns"><button id="load-'+c.id+'" class="btn sm amber" data-act="load" data-id="'+c.id+'" aria-label="'+esc('Load settings from '+c.name)+'">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>Load settings</button>'+details+cloudLinkHTML(c)+'</div></article>';
}

function renderResults(){
  const { def, as } = cur();
  const { ampCaps, shown } = filteredCaptures();
  const results = shown.map(c => ({ c, r:settingsSimilarity(c, def, as) }));
  const scored = results.filter(x => x.r.status === 'scored').sort((a, b) => b.r.score - a.r.score);
  const list = scored.concat(results.filter(x => x.r.status !== 'scored'));
  let h = '';
  if (!shown.length) h += '<p class="banner" role="status">No captures for this gear.</p>';
  else if (!def.browseOnly && (!scored.length || scored[0].r.score < STRONG_MATCH_MIN)) h += '<p class="banner" role="status">'+(scored.length ? 'No close match for these settings · best is '+scored[0].r.score+'/100' : 'No close match for these settings · no readable settings to compare')+'</p>';
  if (list.length) h += '<div class="cgrid">'+list.slice(0, state.limit).map(cardHTML).join('')+'</div>';
  if (list.length > state.limit) h += '<button class="btn sm" style="align-self:flex-start" data-act="more">Show more captures ('+(list.length - state.limit)+' remaining)</button>';
  return { html:h, shown, ampCaps };
}

// The settings a capture records, as parsed from its description (one list per channel when it
// lists several).
function recordedSettingsHTML(def, c){
  const s = c.settings, multiple = Object.keys(s.byChannel || {}).length > 1;
  const blocks = multiple ? Object.entries(s.byChannel).map(([n, vals]) => [Number(n), vals]) : [[s.channel, s.values]];
  return blocks.map(([n, vals]) => {
    const rows = Object.entries(vals).map(([k, v]) => {
      const x = def.controls.find(y => y.key === k);
      return [x ? nice(x.label) : k, (x ? nice(fmtVal(x, v)) : String(v))+((s.assumed || []).includes(k) ? ' (assumed)' : '')];
    });
    (s.notApplicable || []).filter(z => !multiple || z.channel == null || z.channel === n).forEach(z => { const x = def.controls.find(y => y.key === z.key); rows.push([x ? nice(x.label) : z.key, 'N/A']); });
    return (multiple ? '<span class="mono" style="font-size:12px;color:#c9c1b3">'+esc(channelLabel(def, n))+'</span>' : '')
      + '<dl class="meta recset">'+rows.map(([k, v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>';
  }).join('');
}
function renderDrawer(){
  const c = state.openId ? CAPTURES.find(x => x.id === state.openId) : null;
  if (!c) return '';
  const def = ampById(c.ampId || 'unmapped'), as = state.amps[def.id], n = as.channel, r = settingsSimilarity(c, def, as), s = c.settings;
  const yn = (b) => b == null ? 'Not stated' : b ? 'Yes' : 'No', num = (x) => x == null ? 'Not stated' : Number(x).toLocaleString('en-US');
  const scored = r.status === 'scored', t = scored ? tierOf(r.score)[1] : 't3';
  const cs = multiCh(def) ? channelLabel(def,n) : def.model;
  let compare = '';
  if (s) {
    const vals = captureValues(c, n), rows = [];
    if (multiCh(def)) rows.push(['Channel', channelLabel(def,n), captureChannelLabel(def,c), s.channel === n || s.byChannel?.[n] ? 'match' : s.channel == null && !Object.keys(s.byChannel || {}).length ? 'none' : 'off', '']);
    def.controls.filter(x => available(x, n)).forEach(x => {
      const result = comparisonStatus(c, def, as, x, n), {uv, cv, kind} = result;
      rows.push([nice(x.label), nice(fmtVal(x, uv) || ''), cv != null ? nice(fmtVal(x, cv))+((s.assumed || []).includes(x.key) ? ' (assumed)' : '') : result.note === 'not applicable' ? 'N/A' : 'Not stated', kind, result.note ? ' · '+result.note : '']);
    });
    compare = '<table class="cmp"><thead><tr><th scope="col">Control</th><th scope="col">Yours</th><th scope="col">Capture</th><th scope="col"><span class="sr">Comparison</span></th></tr></thead><tbody>'
      + rows.map(([l, y, th, k, ns]) => '<tr><td>'+esc(l)+'<span style="color:var(--dim);font-size:11px">'+esc(ns)+'</span></td><td class="v">'+esc(y)+'</td><td class="v">'+esc(th)+'</td><td><span class="mk '+k+'" aria-hidden="true">'+MK[k]+'</span><span class="sr">'+SR[k].replace(': ', '')+'</span></td></tr>').join('')
      + '</tbody></table><p style="margin:0;font-size:11.5px;color:var(--dim)">= same · ≈ close · ≠ different · – not stated in the capture</p>';
  } else {
    compare = '<div class="emptyst"><span style="font-size:13px;color:#c9c1b3;line-height:1.5">No amp settings could be read from this description, so there is nothing to compare and no match score.</span></div>';
  }
  const meta = [
    ['Capture ID', c.id], ['Product ID', c.productId], ['Hash', c.hash], ['Gear', c.ampId ? def.brand+' '+def.model : 'Not mapped'], ['Mapping source', c.mappingSource],
    ['Neural Capture type', captureTypeLabel(c)], ['Device type', c.deviceType], ['Instrument', c.instrument], ['Gain type', c.gainType],
    ['Author', c.author.username || 'Not stated'], ['Creator', c.creator.type+(c.creator.version ? ' · '+c.creator.version : '')],
    ['Published', yn(c.published)],
    ['Likes', num(c.likes)], ['Stars', num(c.stars)], ['Downloads', num(c.downloads)]
  ];
  return '<button class="scrim" aria-label="Close capture details" data-act="close"></button>'
    + '<div class="drawer" role="dialog" aria-modal="true" aria-label="'+esc(c.name)+'">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span class="h-kicker">Capture details</span>'
    + '<div class="capname"><h2 class="cond" style="margin:0;font-size:28px;font-weight:700;line-height:1.1">'+esc(c.name)+'</h2>'+captureTypeBadge(c)+'</div><span class="mono" style="font-size:12px;color:#c9c1b3">'+esc(c.id)+'</span></div>'
    + '<button id="drawer-close" class="btn sm" data-act="close" aria-label="Close details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
    + '<div class="mbtns" style="margin:0;padding:0">'+(s ? '<button id="drawer-load" class="btn amber" data-act="load" data-id="'+c.id+'">Load settings</button>' : '')+cloudLinkHTML(c, 'drawer-cloud').replace('btn sm extlink', 'btn extlink')+'</div>'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="demo">CORTEX CLOUD SNAPSHOT</span><span class="tier '+t+'">'+(scored ? r.score+' / 100 settings similarity' : 'No score · settings not interpreted')+'</span></div>'
    + (c.uninterpretedSettings.length ? '<p class="note">Some settings were not interpreted: '+esc(c.uninterpretedSettings.join('; '))+'</p>' : '')
    + (s ? '<section class="stack"><h3 class="h-kicker">Recorded settings</h3>'+recordedSettingsHTML(def, c)+'</section>' : '')
    + '<section class="stack"><h3 class="h-kicker">Compare with your '+esc(cs)+'</h3>'+compare+'</section>'
    + (c.description ? '<section class="stack"><h3 class="h-kicker">Description</h3><p class="desc">'+esc(c.description)+'</p></section>' : '')
    + (c.tags.length ? '<section class="stack"><h3 class="h-kicker">Tags</h3><div style="display:flex;flex-wrap:wrap;gap:6px">'+c.tags.map(z => '<span class="chip">'+esc(z)+'</span>').join('')+'</div></section>' : '')
    + '<section class="stack"><h3 class="h-kicker">Metadata</h3><dl class="meta">'+meta.map(([k, v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl></section>'
    + '</div>';
}

// Both pickers browse in levels while the field is empty — gear: Category › Instrument › Gear;
// captures: Category › Instrument › Gear › Capture — and typing searches everything in one flat
// list with small category/instrument headers. Lists are sorted by maker, then name.
const byName = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity:'base', numeric:true });
const gearSort = (a, b) => byName(a.brand, b.brand) || byName(a.model, b.model);
function gearCategory(a){ return a.browseOnly ? 'Unmapped' : a.category || 'Amps'; }
const CATEGORIES = [...new Set(AMP_DEFS.filter(a => !a.browseOnly).map(gearCategory))].sort((a, b) => (a !== 'Amps') - (b !== 'Amps') || byName(a, b));
const CATEGORY_ORDER = CATEGORIES.concat('Unmapped');
// Instrument subcategories inside each category: a capture's own instrument; a gear's is the
// most common one among its captures. Unset instruments group as "Other", listed last.
const instrumentOf = (v) => v && !/not.?set|unknown/i.test(v) ? v : 'Other';
const GEAR_INSTRUMENT = (function(){
  const counts = {};
  CAPTURES.forEach(c => { if (!c.ampId) return; const i = instrumentOf(c.instrument); if (i === 'Other') return; (counts[c.ampId] = counts[c.ampId] || {})[i] = (counts[c.ampId][i] || 0) + 1; });
  return Object.fromEntries(AMP_DEFS.map(a => [a.id, Object.entries(counts[a.id] || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || 'Other']));
})();
const INSTRUMENT_ORDER = ['Guitar', 'Bass'].concat([...new Set(CAPTURES.map(c => instrumentOf(c.instrument)))].filter(i => !['Guitar', 'Bass', 'Other'].includes(i)).sort(), 'Other');
const instRank = (i) => { const r = INSTRUMENT_ORDER.indexOf(i); return r < 0 ? INSTRUMENT_ORDER.length : r; };
const gearInstrument = (a) => a.browseOnly ? '' : GEAR_INSTRUMENT[a.id] || 'Other';
const gearInCategorySort = (x, y) => instRank(gearInstrument(x)) - instRank(gearInstrument(y)) || gearSort(x, y);
const keyId = (k) => String(k).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const BACK = { kind:'back' };
const instrumentRows = (items, instOf) => INSTRUMENT_ORDER.filter(i => items.some(x => instOf(x) === i)).map(i => ({ kind:'drill', key:i, label:i, count:items.filter(x => instOf(x) === i).length }));
// Gear picker levels: [] categories (+ the unmapped library), [cat] instruments, [cat, inst] gear.
// Fuzzy search (both pickers). Every typed word has to match the entry somewhere: as a word, the start
// of a word or part of one; across punctuation ("jp2c" finds JP-2C); as letters in order inside one
// word that starts the same ("ecsty" finds Ecstasy); or with a typo (one wrong, missing, extra or
// swapped letter; two in words of eight letters or more). Results keep their group headers, with the
// better matches first in each group; matches scoring half the best or less are dropped, so typo
// matches only show when nothing matches properly.
const fzNorm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[®™]/g, '');
const fzWords = (s) => fzNorm(s).split(/[^a-z0-9]+/).filter(Boolean);
function fzIndex(text){ const words = fzWords(text); return { words, compact:words.join('') }; }
// Damerau–Levenshtein distance (adjacent swaps count as one edit), giving up past max
function fzEdit(a, b, max){
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length:b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row.push(v); low = Math.min(low, v);
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = row;
  }
  return prev[b.length];
}
// letters of t in order inside w (same first letter): the number of gaps, or -1
function fzGaps(t, w){
  if (w[0] !== t[0]) return -1;
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < w.length && i < t.length; j++) if (w[j] === t[i]) { if (last >= 0 && j > last + 1) gaps++; last = j; i++; }
  return i === t.length ? gaps : -1;
}
function fzToken(t, ix){
  let best = 0;
  for (const w of ix.words) {
    if (w === t) return 10;
    best = Math.max(best, w.startsWith(t) ? 8 : w.includes(t) ? 6 : 0);
  }
  if (best || ix.compact.includes(t)) return best || 6;
  if (t.length >= 3) for (const w of ix.words) { const g = fzGaps(t, w); if (g >= 0) best = Math.max(best, 4 - Math.min(g, 2)); }
  if (t.length >= 4) for (const w of ix.words) best = Math.max(best, fzTypo(t, w));
  return best;
}
// typo score of t against w: against the whole word, or (five letters or more) against the start of a
// longer word. Words repeat across entries, so results are kept per typed word.
const FZ_TYPO = new Map();
function fzTypo(t, w){
  let memo = FZ_TYPO.get(t);
  if (!memo) { if (FZ_TYPO.size > 64) FZ_TYPO.clear(); FZ_TYPO.set(t, memo = new Map()); }
  let v = memo.get(w);
  if (v === undefined) {
    const max = t.length >= 8 ? 2 : 1;
    const d = Math.min(fzEdit(t, w, max), t.length >= 5 && w.length > t.length + max ? fzEdit(t, w.slice(0, t.length), max) : max + 1);
    memo.set(w, v = d <= max ? 3 - d : 0);
  }
  return v;
}
function fzScore(tokens, ix){ let s = 0; for (const tk of tokens) { const v = fzToken(tk, ix); if (!v) return 0; s += v; } return tokens.length ? s / tokens.length : 0; }
// items in display order; group(x) gives the header group, which keeps its place
function fzFilter(items, query, indexOf, group){
  const tokens = fzWords(query), first = new Map();
  const scored = items.map((x, i) => { const g = group(x); if (!first.has(g)) first.set(g, i); return [fzScore(tokens, indexOf(x)), i, x, g]; }).filter(s => s[0] > 0);
  const top = Math.max(0, ...scored.map(s => s[0]));
  return scored.filter(s => s[0] > top / 2).sort((a, b) => first.get(a[3]) - first.get(b[3]) || b[0] - a[0] || a[1] - b[1]).map(s => s[2]);
}
const FZ_GEAR = new Map();
const gearIndex = (a) => FZ_GEAR.get(a.id) || FZ_GEAR.set(a.id, fzIndex(a.brand+' '+a.model+' '+deviceName(a)+' '+a.id+' '+gearCategory(a)+' '+gearInstrument(a))).get(a.id);

function gearEntries(path = state.ampPath, query = state.ampQuery){
  const aq = query.trim().toLowerCase();
  if (aq) {
    const ordered = [...AMP_DEFS].sort((x, y) => CATEGORY_ORDER.indexOf(gearCategory(x)) - CATEGORY_ORDER.indexOf(gearCategory(y)) || gearInCategorySort(x, y));
    return fzFilter(ordered, aq, gearIndex, a => gearCategory(a)+'|'+gearInstrument(a)).map(a => ({ kind:'amp', a, grouped:true }));
  }
  const [cat, inst] = path;
  if (!cat) return CATEGORIES.map(c => ({ kind:'drill', key:c, label:c, count:AMP_DEFS.filter(a => gearCategory(a) === c).length }))
    .concat(AMP_DEFS.filter(a => a.browseOnly).map(a => ({ kind:'amp', a })));
  const inCat = AMP_DEFS.filter(a => gearCategory(a) === cat);
  if (!inst) return [BACK].concat(instrumentRows(inCat, gearInstrument));
  return [BACK].concat(inCat.filter(a => gearInstrument(a) === inst).sort(gearSort).map(a => ({ kind:'amp', a })));
}
const CHEV = (d) => '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
// Shared rows: a level that opens the next one, and the back row with the current path.
function drillRowHTML(prefix, e, cls){
  const title = e.a ? '<span style="display:flex;flex-direction:column;gap:1px;flex-grow:1;min-width:0"><span style="font-size:11.5px;color:var(--muted)">'+esc(e.a.brand)+'</span><span class="cond" style="font-size:18px;font-weight:700;letter-spacing:.03em;line-height:1.1">'+esc(e.a.model)+'</span></span>'
    : '<span class="cond" style="font-size:18px;font-weight:700;letter-spacing:.03em;line-height:1.1;flex-grow:1">'+esc(e.label)+'</span>';
  return '<button id="'+prefix+'-drill-'+keyId(e.key)+'" class="'+cls+'" role="option" tabindex="-1" aria-selected="false" aria-label="'+esc(e.label+', '+e.count+(prefix === 'cap' ? ' captures' : ' items'))+'" data-act="'+prefix+'-drill" data-key="'+esc(e.key)+'">'
    + title+'<span style="font-size:11.5px;color:var(--dim)">'+e.count+'</span>'+CHEV('M9 6l6 6-6 6')+'</button>';
}
// Path labels: categories and instruments as they are; a gear in the capture picker by its device name.
const pathLabel = (k) => { const a = AMP_DEFS.find(x => x.id === k); return a ? deviceName(a) : k; };
function backRowHTML(prefix, path, cls){
  const crumbs = path.map(pathLabel), up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : 'all categories';
  return '<button id="'+prefix+'-back" class="'+cls+'" role="option" tabindex="-1" aria-selected="false" aria-label="'+esc('Back to '+up+' (now '+crumbs.join(' › ')+')')+'" data-act="'+prefix+'-back">'
    + CHEV('M15 6l-6 6 6 6')+'<span class="crumbs">'+crumbs.map((c, i) => '<span'+(i === crumbs.length - 1 ? ' class="here"' : '')+'>'+esc(c)+'</span>').join('<span aria-hidden="true">›</span>')+'</span></button>';
}
function renderAmpPopup(){
  const { def } = cur();
  const list = gearEntries(), active = Math.min(state.ampActive, Math.max(0, list.length - 1));
  let h = '', last = null, lastInst = null;
  list.forEach((e, i) => {
    const cls = 'ampopt'+(i === active ? ' active' : '');
    if (e.kind === 'drill') { h += drillRowHTML('gear', e, cls); return; }
    if (e.kind === 'back') { h += backRowHTML('gear', state.ampPath, cls); return; }
    const a = e.a, cat = gearCategory(a), inst = gearInstrument(a);
    if (e.grouped && cat !== last) { h += '<div class="gearhead" role="presentation">'+esc(cat)+'</div>'; last = cat; lastInst = null; }
    if (e.grouped && inst && inst !== lastInst) { h += '<div class="gearsub" role="presentation">'+esc(inst)+'</div>'; lastInst = inst; }
    h += '<button id="amp-opt-'+a.id+'" class="'+cls+'" role="option" tabindex="-1" aria-selected="'+(a.id === def.id)+'"'+(e.grouped && inst ? ' aria-label="'+esc(cat+', '+inst+': '+a.brand+' '+a.model)+'"' : '')+' data-act="amp" data-id="'+a.id+'">'
      + '<span style="display:flex;flex-direction:column;gap:1px;flex-grow:1;min-width:0"><span style="font-size:11.5px;color:var(--muted)">'+esc(a.brand)+'</span><span class="cond" style="font-size:18px;font-weight:700;letter-spacing:.03em;line-height:1.1">'+esc(a.model)+'</span></span>'
      + '<span style="font-size:11.5px;color:var(--dim);text-align:right">'+(a.browseOnly ? '' : a.panel === 'marshall1987' ? 'I + II inputs · ' : /^triaxis/.test(a.panel) ? '8 modes · ' : multiCh(a) ? a.channels.length+' recorded ch · ' : '')+CAPTURES.filter(c => a.browseOnly ? !c.ampId : c.ampId === a.id).length+' captures</span></button>';
  });
  if (!list.length) h += '<div style="padding:10px;font-size:13px;color:#c9c1b3">No gear matches that search.</div>';
  return h;
}
// Move one level in a picker: into a drill row, or back up to the row we came from.
function stepPicker(which, e){
  const pathKey = which+'Path', activeKey = which+'Active', entries = which === 'amp' ? gearEntries : capEntries, path = state[pathKey];
  if (e.kind === 'drill') update({ [pathKey]:path.concat(e.key), [activeKey]:1, [which+'Open']:true });
  else if (e.kind === 'back' && path.length) {
    const parent = path.slice(0, -1);
    update({ [pathKey]:parent, [activeKey]:Math.max(0, entries(parent, '').findIndex(x => x.kind === 'drill' && x.key === path[path.length - 1])), [which+'Open']:true });
  }
}
function activateGear(e){
  if (!e) return;
  if (e.kind === 'amp') pickAmp(e.a.id); else stepPicker('amp', e);
}

// Capture search: every capture, by capture name or amp brand/model.
const CAP_SORTED = CAPTURES.map(c => { const a = c.ampId ? AMP_DEFS.find(x => x.id === c.ampId) : null, cat = a ? gearCategory(a) : 'Unmapped';
  // a mapped capture sits under its gear's instrument, so each gear appears in one place
  const inst = a ? gearInstrument(a) : instrumentOf(c.instrument);
  return { c, a, cat, inst, hay:(c.name+' '+(a ? a.brand+' '+a.model : '')+' '+cat+' '+inst).toLowerCase() }; })
  .sort((x, y) => CATEGORY_ORDER.indexOf(x.cat) - CATEGORY_ORDER.indexOf(y.cat) || instRank(x.inst) - instRank(y.inst) || (x.a && y.a ? gearSort(x.a, y.a) : 0) || byName(x.c.name, y.c.name));
// The name a gear goes by on the device, from its capture names (e.g. "Bogna X100B" for the
// Bogner Ecstasy 100B captures "Bogna X100B Ch1 3", "Bogna X100B Ch2 1"…): the most common name
// without its number, shortened word by word until it covers 80% of the gear's captures (never
// below two words; "John" and "John's" count as the same word). Names shared by gear in the same
// category get the gear's variant added (e.g. "Watt Custom · Power amp section").
const DEVICE_NAME = (function(){
  const stems = {}, tok = (w) => w.toLowerCase().replace(/['’]s$/, '');
  CAPTURES.forEach(c => { if (!c.ampId) return; const st = c.name.replace(/\s*\d+$/, '').trim() || c.name; (stems[c.ampId] = stems[c.ampId] || new Map()).set(st, (stems[c.ampId].get(st) || 0) + 1); });
  const names = {};
  Object.entries(stems).forEach(([id, m]) => {
    const total = [...m.values()].reduce((x, y) => x + y, 0), top = [...m].sort((x, y) => y[1] - x[1])[0][0].split(/\s+/), min = Math.min(2, top.length);
    for (let n = top.length; n >= min; n--) {
      const pre = top.slice(0, n).map(tok);
      const share = [...m].filter(([st]) => { const w = st.split(/\s+/).map(tok); return pre.every((x, i) => w[i] === x); }).reduce((x, [, v]) => x + v, 0) / total;
      if (share >= 0.8 || n === min) { names[id] = top.slice(0, n).join(' '); break; }
    }
  });
  const seen = {};
  Object.entries(names).forEach(([id, n]) => { const k = gearCategory(ampById(id))+'\u0001'+n; (seen[k] = seen[k] || []).push(id); });
  Object.values(seen).filter(ids => ids.length > 1).forEach(ids => ids.forEach(id => {
    const a = ampById(id), v = (a.model.match(/(?:Preamp|Power amp) section$/) || [])[0];
    if (v) names[id] += ' · '+v; else if (ids.some(o => o !== id && /(?:Preamp|Power amp) section$/.test(ampById(o).model))) return; else names[id] += ' · '+a.model;
  }));
  return names;
})();
const deviceName = (a) => DEVICE_NAME[a.id] || a.brand+' '+a.model;

// Capture picker levels: [] categories, [cat] instruments, [cat, inst] gear, [cat, inst, gearId]
// captures (unmapped captures list straight under their category).
function capEntries(path = state.capPath, query = state.capQuery){
  const q = query.trim().toLowerCase();
  if (q) return fzFilter(CAP_SORTED, q, e => e.fz || (e.fz = fzIndex(e.hay)), e => e.cat+'|'+e.inst).map(e => ({ kind:'cap', e, grouped:true }));
  const [cat, inst, gid] = path;
  if (!cat) return CATEGORY_ORDER.map(c => ({ kind:'drill', key:c, label:c, count:CAP_SORTED.filter(e => e.cat === c).length })).filter(x => x.count);
  const inCat = CAP_SORTED.filter(e => e.cat === cat);
  if (cat === 'Unmapped') return [BACK].concat(inCat.map(e => ({ kind:'cap', e })));
  if (!inst) return [BACK].concat(instrumentRows(inCat, e => e.inst));
  const inInst = inCat.filter(e => e.inst === inst);
  if (!gid) {
    const gear = new Map();
    inInst.forEach(e => { if (!gear.has(e.a.id)) gear.set(e.a.id, { kind:'drill', key:e.a.id, label:deviceName(e.a), count:0 }); gear.get(e.a.id).count++; });
    return [BACK].concat([...gear.values()].sort((x, y) => byName(x.label, y.label)));
  }
  return [BACK].concat(inInst.filter(e => e.a.id === gid).map(e => ({ kind:'cap', e })));
}
function renderCapPopup(list){
  if (!list.length) return '<div style="padding:10px;font-size:13px;color:#c9c1b3">No captures match that search.</div>';
  let last = null, lastInst = null;
  return list.map(item => {
    if (item.kind === 'drill') return drillRowHTML('cap', item, 'ampopt');
    if (item.kind === 'back') return backRowHTML('cap', state.capPath, 'ampopt');
    const { c, a, cat, inst } = item.e;
    // inside a gear's level the gear name is already in the back row
    const inGear = !item.grouped && state.capPath.length === 3;
    const meta = [inGear ? null : a ? a.brand+' '+a.model : 'Unmapped', a && multiCh(a) && c.settings ? captureChannelLabel(a, c) : null, 'gain '+c.gainType].filter(Boolean).join(' · ');
    let head = '';
    if (item.grouped && cat !== last) { head += '<div class="gearhead" role="presentation">'+esc(cat)+'</div>'; last = cat; lastInst = null; }
    if (item.grouped && inst !== lastInst) { head += '<div class="gearsub" role="presentation">'+esc(inst)+'</div>'; lastInst = inst; }
    return head+'<button id="cap-opt-'+c.id+'" class="ampopt capopt" role="option" tabindex="-1" aria-selected="false" data-act="cap" data-id="'+c.id+'">'
      + '<span style="display:flex;flex-direction:column;gap:1px;flex-grow:1;min-width:0"><span class="capname"><span style="font-size:14px;font-weight:600;overflow-wrap:anywhere">'+esc(c.name)+'</span>'+captureTypeBadge(c)+'</span><span style="font-size:11.5px;color:var(--muted)">'+esc(meta)+'</span></span>'
      + (c.settings && c.ampId ? '<span class="ctag">Load</span>' : '<span class="ctag none">No settings</span>')+'</button>';
  }).join('');
}
function activateCapture(e){
  if (!e) return;
  if (e.kind === 'cap') loadCapture(e.e.c.id); else stepPicker('cap', e);
}
function scrollIntoList(pop, opt){
  if (opt.offsetTop < pop.scrollTop) pop.scrollTop = opt.offsetTop;
  else if (opt.offsetTop + opt.offsetHeight > pop.scrollTop + pop.clientHeight) pop.scrollTop = opt.offsetTop + opt.offsetHeight - pop.clientHeight;
}

const el = (id) => document.getElementById(id);
let drawerWasOpen = false, infoWasOpen = false, lastOpenerId = null, capKey = null;

// Ranking every capture of the gear is the costly part of a render, so the results are only redone
// when what they depend on (the gear, its settings, how many are shown) changes, and at most every
// RESULTS_EVERY ms while a control is moving; the last change always lands. A different gear or
// "Show more" updates them straight away.
const RESULTS_EVERY = 150;
let resultsKey = null, resultsAmp = null, resultsLimit = 0, resultsAt = 0, resultsTimer = 0;
function updateResults(){
  const { def, as } = cur(), key = def.id+'\u0001'+state.limit+'\u0001'+JSON.stringify(as)+'\u0001'+def.controls.map(c => c.weight).join();
  if (key === resultsKey) return;
  const now = Date.now(), urgent = def.id !== resultsAmp || state.limit !== resultsLimit || typeof setTimeout === 'undefined';
  if (!urgent && now - resultsAt < RESULTS_EVERY) {
    if (!resultsTimer) resultsTimer = setTimeout(() => { resultsTimer = 0; updateResults(); }, RESULTS_EVERY - (now - resultsAt));
    return;
  }
  if (resultsTimer) { clearTimeout(resultsTimer); resultsTimer = 0; }
  resultsKey = key; resultsAmp = def.id; resultsLimit = state.limit; resultsAt = now;
  const inside = document.activeElement && el('results').contains(document.activeElement) ? document.activeElement.id : null;
  const res = renderResults();
  el('results').innerHTML = res.html;
  el('count').textContent = res.ampCaps.length+' for this gear · '+CAPTURES.length+' total';
  if (inside && el(inside)) el(inside).focus({ preventScroll:true });
}
function render(){
  syncUrl();
  const focusedId = document.activeElement && document.activeElement.id;
  const { def } = cur();

  // amp search
  const ampq = el('ampq');
  ampq.placeholder = def.brand+' '+def.model;
  ampq.setAttribute('aria-expanded', String(state.ampOpen));
  const pop = el('amp-listbox');
  pop.hidden = !state.ampOpen;
  if (state.ampOpen) pop.innerHTML = renderAmpPopup();
  const activeOpt = state.ampOpen && pop.querySelector('.ampopt.active');
  if (activeOpt) { ampq.setAttribute('aria-activedescendant', activeOpt.id); scrollIntoList(pop, activeOpt); } else ampq.removeAttribute('aria-activedescendant');

  // capture search (the list is rebuilt only when the query or the level changes)
  const capq = el('capq'), cpop = el('cap-listbox');
  capq.setAttribute('aria-expanded', String(state.capOpen));
  cpop.hidden = !state.capOpen;
  let capActive = null;
  if (state.capOpen) {
    const list = capEntries(), key = state.capQuery+'\u0001'+state.capPath.join('\u0001');
    if (capKey !== key) { cpop.innerHTML = renderCapPopup(list); capKey = key; cpop.scrollTop = 0; }
    const prev = cpop.querySelector('.ampopt.active');
    if (prev) { prev.classList.remove('active'); prev.setAttribute('aria-selected', 'false'); }
    capActive = cpop.querySelectorAll('[role=option]')[Math.min(state.capActive, list.length - 1)] || null;
    if (capActive) { capActive.classList.add('active'); capActive.setAttribute('aria-selected', 'true'); scrollIntoList(cpop, capActive); }
  } else capKey = null;
  if (capActive) capq.setAttribute('aria-activedescendant', capActive.id); else capq.removeAttribute('aria-activedescendant');

  // workbench + matches
  el('stage').innerHTML = renderStage();
  placeWeights();
  updateResults();

  // drawer
  el('drawer-root').innerHTML = renderDrawer();
  const open = !!state.openId;
  document.querySelectorAll('.topbar,#stage,.matches').forEach(region => { region.inert = open; });
  document.body.style.overflow = open || state.infoOpen ? 'hidden' : '';
  if (open && !drawerWasOpen) { const b = el('drawer-close'); if (b) b.focus(); }
  else if (!open && drawerWasOpen && lastOpenerId && el(lastOpenerId)) el(lastOpenerId).focus();
  else if (state.infoOpen && !infoWasOpen) { const b = el('info-close'); if (b) b.focus(); }
  else if (!state.infoOpen && infoWasOpen && el('info-btn') && (!focusedId || focusedId === 'info-close' || !el(focusedId))) el('info-btn').focus();
  else if (focusedId && el(focusedId) && document.activeElement !== el(focusedId)) el(focusedId).focus({ preventScroll:true });
  drawerWasOpen = open;
  infoWasOpen = state.infoOpen;
  saveState();
}

/* =====================================================================
   6) EVENTS
   ===================================================================== */
function parseCh(v){ return v === '' || v == null ? null : Number(v); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act;
  if (act === 'channel') setChannel(Number(t.dataset.n));
  else if (act === 'pick') {
    const v = JSON.parse(t.dataset.v);
    if (t.dataset.target === 'channel') setChannel(v); else setCtrl(ctrlByKey(t.dataset.key), parseCh(t.dataset.ch), v);
  }
  else if (act === 'cycle') {
    const { def, as } = cur();
    if (t.dataset.target === 'channel') { const ns = def.channels.map(c => c.n); setChannel(ns[(ns.indexOf(as.channel) + 1) % ns.length]); }
    else {
      const c = ctrlByKey(t.dataset.key), n = parseCh(t.dataset.ch), v = getVal(def, as, c, n);
      const opts = optionsFor(c, n), idx = Math.max(0, opts.findIndex(o => o.v === v));
      setCtrl(c, n, opts[(idx + 1) % opts.length].v);
    }
  }
  else if (act === 'reset') { const { def } = cur(); state.amps[def.id] = initialAmpState(def); update({ loaded:null }); }
  else if (act === 'open') { lastOpenerId = t.id || null; update({ openId:t.dataset.id, infoOpen:false }); }
  else if (act === 'close') update({ openId:null });
  else if (act === 'load' || act === 'cap') loadCapture(t.dataset.id);
  else if (act === 'cap-drill') stepPicker('cap', { kind:'drill', key:t.dataset.key });
  else if (act === 'cap-back') stepPicker('cap', BACK);
  else if (act === 'unload') { update({ loaded:null }); const h = el('reset'); if (h) h.focus(); }
  else if (act === 'info') update({ infoOpen:!state.infoOpen, weightsOpen:false });
  else if (act === 'weights') { const opening = !state.weightsOpen; update({ weightsOpen:opening, infoOpen:false }); if (!opening) requestAnimationFrame(() => { const b = el('wt-btn'); if (b) b.focus(); }); }
  else if (act === 'w-step') { const { def } = cur(), c = ctrlByKey(t.dataset.key); setWeight(def, c, c.weight + Number(t.dataset.d)*W_STEP*(e.shiftKey ? 10 : 1)); }
  else if (act === 'w-reset') { const { def } = cur(); delete state.weights[def.id]; applyWeights(def); update({}); }
  else if (act === 'info-close') update({ infoOpen:false });
  else if (act === 'more') update({ limit:state.limit + 12 });
  else if (act === 'amp') pickAmp(t.dataset.id);
  else if (act === 'gear-drill') stepPicker('amp', { kind:'drill', key:t.dataset.key });
  else if (act === 'gear-back') stepPicker('amp', BACK);
});

// keyboard / assistive-tech changes on the hidden range inputs
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('input[type=range][data-ctrl]')) {
    const c = ctrlByKey(t.dataset.ctrl), v = parseFloat(t.value);
    if (c && !isNaN(v)) setCtrl(c, parseCh(t.dataset.ch), snap(c, v));
  }
});

// pointer drag on knobs (vertical) and faders (absolute position)
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-drag]');
  if (!t || (e.button != null && e.button !== 0)) return;
  e.preventDefault();
  const { def, as } = cur(), c = ctrlByKey(t.dataset.ctrl), n = parseCh(t.dataset.ch);
  if (!c) return;
  if (t.dataset.drag === 'knob') drag = { kind:'knob', c, n, y:e.clientY, v:getVal(def, as, c, n) };
  else { drag = { kind:'fader', c, n, rect:t.getBoundingClientRect(), geo:FG[t.dataset.geo] }; dragMove(e); }
  const input = document.getElementById((t.dataset.drag === 'knob' ? 'k-' : 'f-')+c.key+'-'+chAttr(n));
  if (input) input.focus({ preventScroll:true });
});
function dragMove(e){
  if (!drag) return;
  const c = drag.c, span = c.max - c.min;
  const nv = drag.kind === 'knob'
    ? snap(c, drag.v + (drag.y - e.clientY)/14 * span/10)
    : snap(c, c.min + drag.geo.inv(e.clientY - drag.rect.top) * span);
  const { def, as } = cur();
  if (nv !== getVal(def, as, c, drag.n)) setCtrl(c, drag.n, nv);
}
window.addEventListener('pointermove', dragMove);
// Generic panels are laid out for the available width: lay them out again when it changes.
window.addEventListener('resize', () => { if (state.weightsOpen || (cur().def.panel === 'generic' && Math.abs(gLayoutWidth() - gLastW) > 24)) update(); });
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointercancel', () => { drag = null; });

// drawer: Escape closes
el('drawer-root').addEventListener('keydown', (e) => {
  if (!state.openId) return;
  if (e.key === 'Escape') { e.stopPropagation(); update({ openId:null }); }
  if (e.key === 'Tab') {
    const controls = Array.from(document.querySelectorAll('.drawer button,.drawer a,.drawer select')).filter(x=>!x.disabled);
    const first = controls[0], last = controls[controls.length-1];
    if (first && (e.shiftKey ? document.activeElement === first : document.activeElement === last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  }
});

// (i) popover: Escape closes it and returns focus to its button
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.infoOpen && !state.openId) { e.preventDefault(); update({ infoOpen:false }); } });
// weight editors: type a number (Enter or leaving the field applies it), ↑/↓ step it; Escape ends editing
document.addEventListener('change', (e) => {
  const t = e.target; if (!t.matches || !t.matches('input[data-wkey]')) return;
  const v = parseFloat(String(t.value).replace(',', '.')), { def } = cur(), c = ctrlByKey(t.dataset.wkey);
  if (isFinite(v)) setWeight(def, c, v); else update({});
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.matches && t.matches('input[data-wkey]') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); const { def } = cur(), c = ctrlByKey(t.dataset.wkey);
    setWeight(def, c, c.weight + (e.key === 'ArrowUp' ? 1 : -1)*W_STEP*(e.shiftKey ? 10 : 1));
  } else if (t.matches && t.matches('input[data-wkey]') && e.key === 'Enter') { e.preventDefault(); t.blur(); t.focus(); }
  else if (e.key === 'Escape' && state.weightsOpen && !state.openId && !state.infoOpen) { e.preventDefault(); update({ weightsOpen:false }); requestAnimationFrame(() => { const b = el('wt-btn'); if (b) b.focus(); }); }
});


// amp picker combobox
function pickAmp(id){ update({ amp:id, openId:null, ampOpen:false, ampActive:0, limit:12, loaded:null, infoOpen:false, weightsOpen:false }); }
const ampq = el('ampq');
// Opening the picker starts at the category list, on the current gear's category.
function openGear(){ if (!state.ampOpen) update({ ampOpen:true, ampPath:[], ampActive:Math.max(0, CATEGORIES.indexOf(gearCategory(cur().def))) }); }
// Searches stay in the fields; focusing one selects its text, so typing replaces it.
const selectAll = (input) => requestAnimationFrame(() => { if (document.activeElement === input) input.select(); });
ampq.addEventListener('focus', () => { openGear(); selectAll(ampq); });
ampq.addEventListener('click', openGear);
ampq.addEventListener('input', (e) => update({ ampQuery:e.target.value, ampOpen:true, ampActive:0 }));
// Leaving the picker without choosing clears the typed text, so the field shows the current gear again.
function closeGear(){ update({ ampOpen:false, ampPath:[] }); }
ampq.addEventListener('blur', closeGear);
// Picker keys (both comboboxes): ↑/↓ move, Enter picks or opens a level, → opens a level,
// ← or Backspace (empty field) goes back up, Escape closes.
function pickerKeys(which, e, activate, close){
  const list = which === 'amp' ? gearEntries() : capEntries(), activeKey = which+'Active', open = state[which+'Open'];
  const active = Math.min(state[activeKey], Math.max(0, list.length - 1)), row = list[active];
  const browsing = !state[which+'Query'].trim();
  if (e.key === 'ArrowDown') { e.preventDefault(); update({ [which+'Open']:true, [activeKey]:Math.min(active + 1, list.length - 1) }); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); update({ [which+'Open']:true, [activeKey]:Math.max(active - 1, 0) }); }
  else if (e.key === 'ArrowRight' && browsing && open && row && row.kind === 'drill') { e.preventDefault(); stepPicker(which, row); }
  else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && browsing && open && state[which+'Path'].length) { e.preventDefault(); stepPicker(which, BACK); }
  else if (e.key === 'Enter') { if (open && row) { e.preventDefault(); activate(row); } }
  else if (e.key === 'Escape') { if (open) { e.preventDefault(); close(); } }
}
ampq.addEventListener('keydown', (e) => pickerKeys('amp', e, activateGear, closeGear));
// capture search combobox: picking a capture loads its settings (or opens its details)
const capq = el('capq');
// Opening the capture picker starts at the category list.
function openCaptures(){ if (!state.capOpen) update({ capOpen:true, capPath:[], capActive:0 }); }
capq.addEventListener('focus', () => { openCaptures(); selectAll(capq); });
capq.addEventListener('click', openCaptures);
capq.addEventListener('input', (e) => update({ capQuery:e.target.value, capOpen:true, capActive:0 }));
capq.addEventListener('blur', () => update({ capOpen:false }));
capq.addEventListener('keydown', (e) => pickerKeys('cap', e, activateCapture, () => update({ capOpen:false })));
// keep focus in the input while clicking an option, so blur doesn't close the list before the click lands
['amp-listbox', 'cap-listbox'].forEach(id => ['mousedown', 'pointerdown'].forEach(type => el(id).addEventListener(type, (e) => e.preventDefault())));

document.addEventListener('change', e => {
  if (e.target.matches('[data-switch]')) setCtrl(ctrlByKey(e.target.dataset.switch), null, e.target.value);
});
render();
window.CF_READY = true;
