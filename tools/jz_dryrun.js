// jz_dryrun.js - run an MVJZ spec through mvjz_core.jsx on JIZURA's emulated After Effects object model (dev/aeom.js),
// before sending the job to the PC. Reports planning notes, build warnings, fallbacks, unknown properties, expression
// syntax errors and the parts each cut ended up with.
//
//   node tools/jz_dryrun.js --jizura <JIZURA checkout> --core <mvjz_core.jsx> --spec <spec.json> [--plan-out plan.json]
//                           [--fonts all|none|ps1,ps2,...] [--image-size 1600x900]
//
// Needs acorn for the ES3 syntax check (npm install acorn in a scratch folder, then NODE_PATH=<that>/node_modules).
// Images are not read: every "image" path is imported as a still of --image-size.
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
for (const k of ['jizura', 'core', 'spec']) if (!args[k]) { console.error('missing --' + k); process.exit(2); }
const AEOM = require(path.resolve(args.jizura, 'dev', 'aeom.js'));
const SRC = fs.readFileSync(args.core, 'utf8');
try { require('acorn').parse(SRC, { ecmaVersion: 3 }); console.log('ES3 syntax: ok'); }
catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') console.log('ES3 syntax: not checked (acorn not installed)');
  else { console.log('ES3 SYNTAX ERROR', e.message, JSON.stringify(SRC.slice(Math.max(0, e.pos - 160), e.pos + 60))); process.exit(1); }
}
const [IW, IH] = (args['image-size'] || '1600x900').split('x').map(Number);
const fontArg = args.fonts || 'all';
const fontSet = new Set(fontArg === 'all' || fontArg === 'none' ? [] : fontArg.split(','));
const fonts = fontArg === 'all' ? () => true : (ps) => fontSet.has(ps);

const ES3_PRELUDE = `(function(){
  function del(o, list) { for (var i = 0; i < list.length; i++) delete o[list[i]]; }
  del(Array.prototype, ['forEach','map','filter','some','every','reduce','reduceRight','indexOf','lastIndexOf','find','findIndex','includes','fill','flat','flatMap','keys','values','entries','copyWithin']);
  del(Array, ['isArray','from','of']);
  del(Object, ['keys','create','defineProperty','defineProperties','getPrototypeOf','freeze','seal','assign','entries','values','getOwnPropertyNames','fromEntries']);
  del(String.prototype, ['trim','trimStart','trimEnd','trimLeft','trimRight','includes','startsWith','endsWith','repeat','padStart','padEnd','codePointAt','normalize']);
  del(Function.prototype, ['bind']); del(Date, ['now']); del(String, ['fromCodePoint']);
  del(Math, ['sign','trunc','hypot','log2','log10','cbrt']);
  del(Number, ['isFinite','isNaN','isInteger','parseFloat','parseInt']);
  this.JSON = undefined;
}).call(this);`;

const env = AEOM.makeEnv({ fonts });
for (const k of ['JSON', 'Math', 'Date', 'String', 'Number', 'Array', 'Object', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isFinite', 'isNaN', 'encodeURIComponent', 'decodeURIComponent']) delete env.ctx[k];
const ctx = env.ctx;
ctx.$.global = ctx;
const imported = [];
ctx.File = function (p) { this.fsName = String(p); this.name = path.basename(String(p)); this.exists = true; };
ctx.ImportOptions = function (f) { this.file = f; };
env.app.project.importFile = function (io) {
  const f = { name: io.file.name, id: env.nextId = (env.nextId || 0) + 1, file: io.file, width: IW, height: IH, duration: null, typeName: 'Footage', parentFolder: null, mainSource: { isStill: true } };
  imported.push(io.file.fsName);
  return f;
};
vm.createContext(ctx);
vm.runInContext(ES3_PRELUDE, ctx);
vm.runInContext(SRC, ctx, { filename: path.basename(args.core) });
if (!ctx.MVJZ) { console.log('MVJZ not defined after loading the core'); process.exit(1); }
console.log('MVJZ', ctx.MVJZ.version, '| JIZURA', ctx.MVJZ.jizura);

const specText = fs.readFileSync(args.spec, 'utf8');
ctx.__specText = specText;
let res;
try { res = vm.runInContext('MVJZ.run(MVJZ.parse(__specText), {})', ctx); }
catch (e) { console.log('RUN ERROR', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); process.exit(1); }

const s = env.stats;
console.log(`comps ${s.comps}  layers ${s.layers}  animators ${s.animators}  expressions ${s.exprs}  images ${res.images} (${imported.length} imported)`);
console.log('effects', JSON.stringify(s.effects));
const unknown = [...s.unknown]; console.log('unknown matchNames', unknown.length ? unknown : 'none');
console.log('expression syntax errors', s.exprErrors.length); s.exprErrors.slice(0, 6).forEach(e => console.log('   ', e));
const probs = s.problems.slice(); if (s.invalidRefs) probs.push(s.invalidRefs + ' access(es) through invalid references');
let hid = 0;
for (const c of env.comps) c._layers.forEach((L, i) => { if (L.enabled) return; const below = c._layers[i + 1]; if (below && below.trackMatteType && below.trackMatteType !== 'none') return; hid++; });
if (hid) probs.push(hid + ' hidden layer(s) left (MV Art cuts with keepPaper:false hide the paper on purpose)');
console.log('problems', probs.length); [...new Set(probs)].slice(0, 12).forEach(p => console.log('   ', p));
console.log('planning notes', res.planLog.length); Array.from(res.planLog).slice(0, 20).forEach(w => console.log('   ', w));
console.log('build log', res.log.length); [...new Set(Array.from(res.log))].slice(0, 20).forEach(w => console.log('   ', w));
console.log('fallbacks', res.fallbacks, Array.from(res.fallbackKeys).join(' '));
console.log('missing fonts', Array.from(res.missingFonts).join(', ') || 'none');
const plan = res.plan;
console.log('cuts', plan.cuts.length, 'events', plan.events.length, 'duration', plan.duration);
for (const c of Array.from(plan.cuts)) {
  const dec = Array.from(c.decor || []).map(d => d.id).join('+');
  console.log(`  ${String(c.index + 1).padStart(3)} ${c.start.toFixed(2)}-${c.end.toFixed(2)} ${(c.layout + '/' + c.enter + '/' + c.exit + '/' + c.hold).padEnd(40)} cam ${c.cam}${c.trans ? ' trans ' + c.trans : ''}${c.treat && c.treat !== 'none' ? ' treat ' + c.treat : ''}${c.bg && c.bg !== 'none' ? ' bg ' + c.bg : ''}${dec ? ' decor ' + dec : ''}${c.mvSync ? ' sync ' + c.mvSync : ''}${c.mvImage ? ' +image' : ''}`);
}
// layers inside one wrapper with an image: the art must sit right above the scheme background, below the lyric
for (const c of env.comps) {
  const names = c._layers.map(L => L.name);
  const a = names.indexOf('MV Art');
  if (a < 0) continue;
  const bg = names.indexOf('JZ BG'), content = names.indexOf('content');
  const ok = bg === a + 1 && (content < 0 || content < a);
  if (!ok) console.log('  ORDER PROBLEM in', c.name, names.join(' | '));
}
console.log('layer order check done');
// sync: per-glyph animators (sync "char") and text layers whose motion starts later than the cut (sync "word")
{
  let syncAnim = 0, late = 0;
  const walk = (p, f) => { f(p); (p.children || []).forEach(ch => walk(ch, f)); };
  for (const c of env.comps) for (const L of c._layers) {
    walk(L, (p) => {
      if (p.matchName === 'ADBE Text Animator' && /^MV Sync/.test(p.name)) syncAnim++;
      if (p._expr && /,DL=([0-9.]+),/.test(p._expr) && +RegExp.$1 > 0.2 && p.matchName === 'ADBE Opacity') late++;
    });
  }
  console.log('sync check: MV Sync animators', syncAnim, '| opacity expressions starting > 0.2 s into the cut', late);
}
if (args['plan-out']) { fs.writeFileSync(args['plan-out'], JSON.stringify(plan, null, 1)); console.log('plan written to', args['plan-out']); }
