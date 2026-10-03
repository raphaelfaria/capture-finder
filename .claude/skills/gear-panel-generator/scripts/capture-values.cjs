// Usage: node capture-values.cjs <ampId> [path/to/data/captures.json]
// Lists every recorded value per control (incl. channels), N/A entries and uninterpreted lines for an amp.
const fs = require('fs'), path = require('path');
const id = process.argv[2];
const file = process.argv[3] || path.resolve(process.cwd(), 'data/captures.json');
if (!id) { console.error('usage: capture-values.cjs <ampId> [captures.json]'); process.exit(2); }
const caps = JSON.parse(fs.readFileSync(file, 'utf8')).filter(c => c.ampId === id);
const vals = {}, na = {}, unk = {};
const bump = (o, k, v) => { (o[k] = o[k] || {})[v] = ((o[k] || {})[v] || 0) + 1; };
caps.forEach(c => {
  const s = c.settings; if (!s) return;
  [s.values || {}, ...Object.values(s.byChannel || {})].forEach(v => Object.entries(v).forEach(([k, x]) => bump(vals, k, String(x))));
  (s.notApplicable || []).forEach(x => bump(na, x.key, x.channel == null ? 'any' : 'ch' + x.channel));
  (c.uninterpretedSettings || []).forEach(u => bump(unk, 'line', u));
});
console.log(id + ': ' + caps.length + ' captures, ' + caps.filter(c => c.settings).length + ' with readable settings, ' + caps.filter(c => !c.settings).length + ' unreadable');
Object.entries(vals).forEach(([k, v]) => console.log(' ', k, JSON.stringify(Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 12))));
console.log('  N/A:', JSON.stringify(na));
console.log('  uninterpreted:', JSON.stringify(unk.line || {}));
