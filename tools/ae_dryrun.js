// ae_dryrun.js - run a build_shots.jsx job against a small mock of After Effects' object model, in node, before
// spending an AE run on it. Catches script errors, unknown effects or effect parameters (checked against the matchNames
// dumped from AE 25.6), NaN values, expression syntax errors and a stale shape-property reference after addProperty.
// It does not draw anything and does not know AE's value ranges (an out-of-range value still fails only in AE).
//
// usage: node tools/ae_dryrun.js <job.json> --dump <effects_dump_ae25.6.json> [--expr]
//   --expr also evaluates the wire / note expressions of a "staff" lyric at a few times and prints their ranges
const fs = require('fs'), path = require('path');
const ARG = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DUMP = JSON.parse(fs.readFileSync(ARG('--dump') || process.env.AE_DUMP, 'utf8')).trees;
const STATS = {layers: 0, effects: {}, exprs: [], keys: 0, warnings: []};
const SHAPE_KIDS = {
  'ADBE Vector Group': ['ADBE Vectors Group', 'ADBE Vector Transform Group'],
  'ADBE Vector Shape - Group': ['ADBE Vector Shape'],
  'ADBE Vector Shape - Rect': ['ADBE Vector Rect Size', 'ADBE Vector Rect Position', 'ADBE Vector Rect Roundness'],
  'ADBE Vector Shape - Ellipse': ['ADBE Vector Ellipse Size', 'ADBE Vector Ellipse Position'],
  'ADBE Vector Graphic - Stroke': ['ADBE Vector Stroke Color', 'ADBE Vector Stroke Opacity', 'ADBE Vector Stroke Width', 'ADBE Vector Stroke Line Cap', 'ADBE Vector Stroke Line Join'],
  'ADBE Vector Graphic - Fill': ['ADBE Vector Fill Color', 'ADBE Vector Fill Opacity'],
  'ADBE Vector Filter - Trim': ['ADBE Vector Trim Start', 'ADBE Vector Trim End', 'ADBE Vector Trim Offset'],
};
const GROUPS = new Set(['ADBE Vectors Group', 'ADBE Root Vectors Group', 'ADBE Effect Parade', 'ADBE Mask Parade', 'ADBE Text Animators',
  'ADBE Text Selectors', 'ADBE Text Animator Properties', 'ADBE Transform Group', 'ADBE Text Properties', 'ADBE Text Range Advanced']);
global.PropertyType = {PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3};
global.PropertyValueType = {NO_VALUE: 0, ThreeD_SPATIAL: 1, ThreeD: 2, TwoD_SPATIAL: 3, TwoD: 4, OneD: 5, COLOR: 6, SHAPE: 7};
global.KeyframeInterpolationType = {LINEAR: 1, BEZIER: 2, HOLD: 3};
global.BlendingMode = new Proxy({}, {get: (t, k) => 'BM_' + String(k)});
global.TrackMatteType = {ALPHA: 1, ALPHA_INVERTED: 2, LUMA: 3, LUMA_INVERTED: 4, NO_TRACK_MATTE: 0};
global.ParagraphJustification = {CENTER_JUSTIFY: 1, LEFT_JUSTIFY: 2, RIGHT_JUSTIFY: 3};
global.LineOrientation = {VERTICAL_RIGHT_TO_LEFT: 1};
global.CloseOptions = {DO_NOT_SAVE_CHANGES: 1};
global.KeyframeEase = function (s, i) { if (!(i > 0 && i <= 100)) throw new Error('KeyframeEase influence out of range: ' + i); this.speed = s; this.influence = i; };
global.Shape = function () { this.vertices = []; this.inTangents = []; this.outTangents = []; this.closed = true; };
global.$ = {sleep: () => {}, evalFile: () => {}};
function defVal(mn) {
  if (/Scale$|ADBE Scale/.test(mn)) return [100, 100];
  if (/Position|Anchor|Size/.test(mn)) return [0, 0];
  if (/Opacity/.test(mn)) return 100;
  if (/Color/.test(mn)) return [1, 1, 1, 1];
  return 0;
}
class Prop {
  constructor(mn, parent, isGroup, val) {
    this.matchName = mn; this.name = mn; this.parentProperty = parent; this.kids = []; this.isGroup = isGroup;
    this.propertyType = isGroup ? PropertyType.NAMED_GROUP : PropertyType.PROPERTY;
    this._v = val !== undefined ? val : defVal(mn); this._keys = []; this._expr = '';
    this.propertyValueType = Array.isArray(this._v) ? (this._v.length === 2 ? PropertyValueType.TwoD : PropertyValueType.ThreeD) : PropertyValueType.OneD;
    if (/Color/.test(mn)) this.propertyValueType = PropertyValueType.COLOR;
    if (mn === 'ADBE Position' || mn === 'ADBE Anchor Point') this.propertyValueType = PropertyValueType.TwoD_SPATIAL;
    this._valid = true;
  }
  get numProperties() { return this.kids.length; }
  get numKeys() { return this._keys.length; }
  set expression(c) {
    if (typeof c !== 'string') throw new Error('expression not a string');
    try { new Function('time', 'value', 'thisComp', 'wiggle', 'createPath', c); } catch (e) { throw new Error('expression syntax on ' + this.matchName + ': ' + e.message + '\n' + c.slice(0, 300)); }
    this._expr = c; STATS.exprs.push([this.matchName, c]);
  }
  get expression() { return this._expr; }
  _chk() { if (!this._valid) throw new Error('Object is invalid: ' + this.matchName); }
  property(k) {
    this._chk();
    if (typeof k === 'number') { const c = this.kids[k - 1]; if (!c) throw new Error('no property index ' + k + ' in ' + this.matchName); c._valid = true; return c; }
    let c = this.kids.find(x => x.matchName === k || x.name === k);
    if (c) c._valid = true;
    if (!c) {
      if (this.strict) return null;
      c = new Prop(k, this, GROUPS.has(k) || !!SHAPE_KIDS[k]); this.kids.push(c);
      if (SHAPE_KIDS[k]) for (const m of SHAPE_KIDS[k]) c.kids.push(new Prop(m, c, GROUPS.has(m)));
    }
    return c;
  }
  addProperty(mn) {
    this._chk();
    // AE: adding to a group invalidates references to its existing children
    const inval = (p) => { p._valid = false; for (const q of p.kids) inval(q); };
    if (this.matchName === 'ADBE Vectors Group' || this.matchName === 'ADBE Root Vectors Group') for (const x of this.kids) inval(x);
    const grp = this.matchName === 'ADBE Effect Parade' || !!SHAPE_KIDS[mn] || GROUPS.has(mn) ||
      ['ADBE Vector Group', 'ADBE Text Animator', 'ADBE Text Selector', 'ADBE Mask Atom'].indexOf(mn) >= 0;
    const c = new Prop(mn, this, grp);
    if (this.matchName === 'ADBE Effect Parade') {
      const tr = DUMP[mn]; if (!tr) throw new Error('unknown effect matchName: ' + mn);
      STATS.effects[mn] = (STATS.effects[mn] || 0) + 1;
      const add = (g, list) => { for (const p of list) { const q = new Prop(p.m, g, !!p.c, p.v); if (p.c) add(q, p.c); g.kids.push(q); } };
      add(c, tr.props); c.strict = true;
    } else if (SHAPE_KIDS[mn]) { for (const m of SHAPE_KIDS[mn]) c.kids.push(new Prop(m, c, GROUPS.has(m))); c.strict = true; }
    else if (mn === 'ADBE Vector Group') { c.property('ADBE Vectors Group'); c.property('ADBE Vector Transform Group'); }
    this.kids.push(c);
    return c;
  }
  setValue(v) { this._chk(); if (this.isGroup) throw new Error('setValue on group ' + this.matchName); if (v === undefined || (typeof v === 'number' && isNaN(v))) throw new Error('bad value for ' + this.matchName + ': ' + v); if (Array.isArray(v) && v.some(x => typeof x === 'number' && isNaN(x))) throw new Error('NaN in ' + this.matchName); this._v = v; }
  get value() { return this._v; }
  valueAtTime(t) { let v = this._v; const ks = this._keys.slice().sort((a, b) => a.t - b.t); for (const k of ks) if (k.t <= t + 1e-9) v = k.v; if (ks.length && t < ks[0].t) v = ks[0].v; return v; }
  addKey(t) { if (typeof t !== 'number' || isNaN(t)) throw new Error('bad key time on ' + this.matchName); STATS.keys++; let k = this._keys.findIndex(x => Math.abs(x.t - t) < 1e-6); if (k < 0) { this._keys.push({t, v: this._v}); this._keys.sort((a, b) => a.t - b.t); k = this._keys.findIndex(x => Math.abs(x.t - t) < 1e-6); } return k + 1; }
  setValueAtKey(i, v) { if (v === undefined) throw new Error('undefined key value on ' + this.matchName); if (Array.isArray(v) && v.some(x => typeof x === 'number' && isNaN(x))) throw new Error('NaN key on ' + this.matchName); this._keys[i - 1].v = v; }
  nearestKeyIndex(t) { let b = 1, d = 1e9; this._keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); b = i + 1; } }); return b; }
  setInterpolationTypeAtKey() {}
  setTemporalEaseAtKey(k, a, b) { const n = Array.isArray(this._v) && this.propertyValueType !== PropertyValueType.TwoD_SPATIAL && this.propertyValueType !== PropertyValueType.COLOR ? this._v.length : 1; if (a.length !== n || b.length !== n) throw new Error('ease dims ' + a.length + ' vs ' + n + ' on ' + this.matchName); }
  keyValue(i) { return this._keys[i - 1].v; } keyTime(i) { return this._keys[i - 1].t; }
}
class TextDoc { constructor(s) { this.text = s; this.fontSize = 120; this.font = 'x'; this.horizontalScale = 1; this.verticalScale = 1; this.tracking = 0; } resetCharStyle() {} resetParagraphStyle() {} }
class Layer {
  constructor(comp, kind, src) {
    STATS.layers++;
    this.containingComp = comp; this.kind = kind; this.source = src || null; this.name = kind; this.enabled = true;
    this.startTime = 0; this.inPoint = 0; this.outPoint = comp.duration; this.motionBlur = false; this.adjustmentLayer = false; this.blendingMode = 'BM_NORMAL';
    this.root = new Prop('root', null, true);
    const tg = this.root.property('ADBE Transform Group');
    tg.property('ADBE Anchor Point').setValue([0, 0]);
    tg.property('ADBE Position').setValue([comp.width / 2, comp.height / 2]);
    tg.property('ADBE Scale').setValue([100, 100]);
    tg.property('ADBE Rotate Z').setValue(0);
    tg.property('ADBE Opacity').setValue(100);
    this.root.property('ADBE Effect Parade'); this.root.property('ADBE Mask Parade');
    if (kind === 'shape') this.root.property('ADBE Root Vectors Group');
    if (kind === 'text') { const tp = this.root.property('ADBE Text Properties'); tp.property('ADBE Text Document').setValue(new TextDoc(src)); tp.property('ADBE Text Animators'); this.source = null; this._text = src; }
    if (kind === 'av' && src) this.root.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([src.width / 2, src.height / 2]);
  }
  get transform() { const tg = this.root.property('ADBE Transform Group'); return {scale: tg.property('ADBE Scale')}; }
  property(k) { return this.root.property(k); }
  get index() { return this.containingComp._layers.indexOf(this) + 1; }
  sourceRectAtTime() {
    if (this.kind === 'text') { const d = this.root.property('ADBE Text Properties').property('ADBE Text Document').value; const n = String(d.text).length; return {left: -n * d.fontSize * 0.45 * d.horizontalScale, top: -d.fontSize * 0.85, width: n * d.fontSize * 0.9 * d.horizontalScale, height: d.fontSize}; }
    if (this.source) return {left: 0, top: 0, width: this.source.width, height: this.source.height};
    return {left: -100, top: -50, width: 200, height: 100};
  }
  duplicate() { const d = new Layer(this.containingComp, this.kind, this.kind === 'text' ? this._text : this.source); this.containingComp._layers.unshift(d); return d; }
  moveAfter(o) { const L = this.containingComp._layers; L.splice(L.indexOf(this), 1); L.splice(L.indexOf(o) + 1, 0, this); }
  moveBefore(o) { const L = this.containingComp._layers; L.splice(L.indexOf(this), 1); L.splice(L.indexOf(o), 0, this); }
  moveToEnd() { const L = this.containingComp._layers; L.splice(L.indexOf(this), 1); L.push(this); }
  remove() { const L = this.containingComp._layers; L.splice(L.indexOf(this), 1); }
  setTrackMatte(m, t) { this.trackMatte = m; }
}
class Comp {
  constructor(name, w, h, pa, dur, fps) { this.name = name; this.width = w; this.height = h; this.duration = dur; this.frameDuration = 1 / fps; this._layers = []; this.motionBlur = false; this.bgColor = [0, 0, 0]; }
  get numLayers() { return this._layers.length; }
  layer(i) { return this._layers[i - 1]; }
  _add(L) { this._layers.unshift(L); return L; }
  get layers() { const c = this; return {
    addSolid: (col, name, w, h) => { if (!(w > 0 && h > 0)) throw new Error('solid size'); const L = new Layer(c, 'av', {width: w, height: h, mainSource: {}}); L.name = name; return c._add(L); },
    addText: (s) => c._add(new Layer(c, 'text', s)),
    addShape: () => c._add(new Layer(c, 'shape')),
    add: (item) => c._add(new Layer(c, 'av', item)),
  }; }
  saveFrameToPng(t, f) { if (typeof t !== 'number' || isNaN(t)) throw new Error('bad still time'); c_stills.push(t); f._exists = true; }
}
const c_stills = [];
global.FileSource = function () {}; global.SolidSource = function () {}; global.FootageItem = function () {}; global.FolderItem = function () {};
global.RQItemStatus = {QUEUED: 1, DONE: 2};
const RQ = {_items: [], get numItems() { return this._items.length; }, item(i) { return this._items[i - 1]; },
  items: {add: (comp) => { const it = {comp, status: RQItemStatus.QUEUED, render: true, timeSpanStart: 0, timeSpanDuration: comp.duration,
    _om: {templates: ['H.264 - 15', 'TIFF シーケンス (アルファ付き)'], applyTemplate() {}, file: null},
    outputModule() { return this._om; }, remove() { RQ._items.splice(RQ._items.indexOf(this), 1); }}; RQ._items.push(it); return it; }},
  render() { for (const it of this._items) if (it.render && it.status === RQItemStatus.QUEUED) { it.status = RQItemStatus.DONE;
    if (it._om.file) { const f = it._om.file.fsName.replace('[#####]', String(Math.round(it.timeSpanStart * 30)).padStart(5, '0')); WRITTEN.add(f); } } }};
const WRITTEN = new Set();
global.File = function (p) { this.fsName = p; this.exists = true; this.length = 10; this.encoding = ''; };
Object.defineProperty(File.prototype, 'name', {get() { return this.fsName.split(/[\\\/]/).pop(); }});
File.prototype.remove = function () { WRITTEN.delete(this.fsName); return true; };
File.prototype.rename = function (n) { WRITTEN.delete(this.fsName); this.fsName = this.fsName.replace(/[^\\\/]*$/, n); WRITTEN.add(this.fsName); return true; };
Object.defineProperty(File.prototype, 'parent', {get() { const d = this.fsName.replace(/[\\\/][^\\\/]*$/, ''); return {exists: true, create() {}, fsName: d,
  getFiles: (mask) => { const re = new RegExp('^' + mask.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$'); return [...WRITTEN].filter(f => f.startsWith(d) && re.test(f.slice(d.length + 1))).map(f => new File(f)); }}; }});
File.prototype.open = function () { return true; }; File.prototype.write = function () {}; File.prototype.close = function () {};
global.Folder = function () {};
global.ImportOptions = function (f) { this.file = f; };
const IMG = {};
global.app = {
  version: 'mock', project: null,
  newProject() { this.project = {dirty: false, numItems: 0, file: null, items: {addComp: (n, w, h, pa, d, f) => new Comp(n, w, h, pa, d, f)},
    importFile: (io) => { const p = io.file.fsName; const s = IMG[p] || (/\.wav$/i.test(p) ? null : [3072, 1728]); const it = Object.create(FootageItem.prototype); it.width = s ? s[0] : 0; it.height = s ? s[1] : 0; it.mainSource = Object.create(FileSource.prototype); it.mainSource.isStill = !!s; return it; },
    save() {}, renderQueue: RQ}; },
  fonts: {getFontsByPostScriptName: (n) => [{postScriptName: n}], getFontsByFamilyNameAndStyleName: () => []},
  beginSuppressDialogs() {}, endSuppressDialogs() {},
};
function run(jobPath, sizes) {
  Object.assign(IMG, sizes || {});
  const job = JSON.parse(fs.readFileSync(jobPath, 'utf8').replace(/^\uFEFF/, ''));
  global.MVLOG = []; global.mvlog = (s) => MVLOG.push(String(s));
  global.mvJSON = (v) => JSON.stringify(v);
  global.MVJOB = {params: job.params, outdir: 'C:\\out', workdir: 'C:\\w'};
  const dir = path.join(__dirname, '..', 'pc', 'autopilot', 'mv', 'ae');
  const lib = fs.readFileSync(path.join(dir, 'mvae.jsx'), 'utf8').replace(/^\uFEFF/, '');
  const bs = fs.readFileSync(path.join(dir, 'build_shots.jsx'), 'utf8').replace(/^\uFEFF/, '');
  (0, eval)(lib + '\n;global.MV = MV;');
  (0, eval)(bs);
  return {result: MVJOB.result, log: MVLOG, stats: STATS, stills: c_stills};
}

if (require.main === module) {
  const job = process.argv[2], J = JSON.parse(fs.readFileSync(job, 'utf8').replace(/^\uFEFF/, ''));
  const sizes = {};      // picture sizes are not known here: 3072x1728 unless the job says otherwise (params.sizes)
  Object.assign(sizes, J.params.sizes || {});
  let r;
  try { r = run(job, sizes); } catch (e) { console.log('FAIL', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); }
  console.log('OK: layers', r.result.layers, 'stills', r.stills.length, 'expressions', r.stats.exprs.length, 'keys', r.stats.keys);
  console.log('effects', JSON.stringify(r.stats.effects));
  if (r.result.upscale.length) console.log('pictures past their pixels', JSON.stringify(r.result.upscale));
  if (process.argv.indexOf('--expr') > 0) {
    const thisComp = {width: J.params.w, height: J.params.h}, OFF = J.params.offset || 0;
    const wires = r.stats.exprs.filter(e => e[0] === 'ADBE Vector Shape');
    for (const s of J.params.shots) for (const x of s.texts || []) if (x.mode === 'staff') {
      for (let t = s.t0 + 0.1; t < s.t1; t += 0.5) {
        const ys = wires.map(w => { let P; new Function('time', 'thisComp', 'createPath', w[1])(t - OFF, thisComp, (p) => (P = p)); const yy = P.map(p => p[1]); return Math.round(Math.min(...yy)) + '-' + Math.round(Math.max(...yy)); });
        console.log('  ' + t.toFixed(2), 'wire y', ys.join(' '));
      }
    }
  }
}
module.exports = {run};