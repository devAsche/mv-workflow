// mv_jz_ext.jsx - lets the MV workflow drive the JIZURA After Effects engine (github.com/852wa/JIZURA, MIT) from a cut table.
// build_mvjz.py concatenates this file INSIDE JIZURA's closure, after all of JIZURA's parts, so every jz* function is in scope.
// ExtendScript is ES3: no JSON, no Array.prototype.indexOf / forEach, no trailing commas.
//
// What it changes compared with JIZURA's own planner (jzMakePlan):
//   * the cuts come from our plan: start / end / text per cut (from the char-level timing), and any field we name
//     (layout, enter, exit, hold, decor, treat, bg, cam, trans, scheme, params ...) is used as given. Only the fields we
//     leave out are picked by JIZURA's weighted pickers, from the parts the spec allows ("parts").
//   * char-level timing: a cut may carry "chars" (song time of every non-space glyph). With "sync": "word" every text layer
//     whose text is part of the lyric starts when its first glyph is sung; with "sync": "char" every glyph appears at its
//     own time (enter "mvSync"). Without "sync" the cut moves as JIZURA designs it, starting at the cut start.
//   * illustration under the lyric: a cut may carry "image" (a still); it goes into the cut's wrapper comp just above the
//     scheme background, with a slow camera (default: the median measured on the reference reels) and a shade.
//   * a "kit": decor parts with fixed parameters repeated on every cut (one look across the song).
// Spec format: see pc/autopilot/mv/ae/jz/README.md.

var MVJZ_VERSION = '0.1.5';
var MVJZ_IMG = {};

function mvJzIsArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
function mvJzCopy(o) {
    if (o === null || typeof o !== 'object') return o;
    var r = mvJzIsArr(o) ? [] : {}, k;
    for (k in o) if (o.hasOwnProperty(k)) r[k] = mvJzCopy(o[k]);
    return r;
}
// deep merge: b over a copy of a (arrays and plain values replace)
function mvJzMerge(a, b) {
    var r = mvJzCopy(a) || {}, k, v;
    if (!b) return r;
    for (k in b) if (b.hasOwnProperty(k)) {
        v = b[k];
        if (v && typeof v === 'object' && !mvJzIsArr(v) && r[k] && typeof r[k] === 'object' && !mvJzIsArr(r[k])) r[k] = mvJzMerge(r[k], v);
        else r[k] = mvJzCopy(v);
    }
    return r;
}
var MVJZ_PLANLOG = [];      // planning notes (jzBuildStart clears JZLOG, so they are kept here as well)
function mvJzWarn(m) { if (MVJZ_PLANLOG.length < 200) MVJZ_PLANLOG.push(m); jzWarn('MVJZ: ' + m); }

// ---------------------------------------------------------------- fonts
// spec.fontCandidates = { key: [PostScript names ...] }: new keys (usable in style.fonts / params.font) or names tried
// before JIZURA's own list for an existing key. Nothing is changed unless the spec says so.
function mvJzFonts(map) {
    if (!map) return;
    for (var k in map) if (map.hasOwnProperty(k)) {
        var add = mvJzIsArr(map[k]) ? map[k] : [map[k]], old = JZ_FONT_CANDIDATES[k] || [], out = [], i;
        for (i = 0; i < add.length; i++) if (jzIndexOf(out, add[i]) < 0) out.push(add[i]);
        for (i = 0; i < old.length; i++) if (jzIndexOf(out, old[i]) < 0) out.push(old[i]);
        JZ_FONT_CANDIDATES[k] = out;
        if (JZ_DATA.fonts && !JZ_DATA.fonts[k]) JZ_DATA.fonts[k] = { label: k, family: add[0], weight: 400, kind: 'custom', extra: false };
    }
    JZ_FONT_CACHE = {};
}

// ---------------------------------------------------------------- style
// spec.style: a JIZURA style key ("noir", "paper", ...) or a whole style object; spec.styleOverride is merged over it.
function mvJzStyle(spec) {
    var base = typeof spec.style === 'object' && spec.style ? spec.style : (JZ_DATA.styles[spec.style || 'noir'] || JZ_DATA.styles.noir);
    var st = mvJzMerge(base, spec.styleOverride || null);
    if (!st.schemes || !st.schemes.length) throw new Error('MVJZ: the style has no colour schemes');
    if (!st.fonts) st.fonts = { display: ['gothic_black'], serif: ['mincho'], body: ['gothic_med'], mono: ['mono'] };
    var roles = ['display', 'serif', 'body', 'mono'];
    for (var i = 0; i < roles.length; i++) if (!st.fonts[roles[i]] || !st.fonts[roles[i]].length) st.fonts[roles[i]] = st.fonts.display || ['gothic_black'];
    return st;
}

// ---------------------------------------------------------------- which parts the pickers may use
// spec.parts = { extra, wa, horror, extra2 (JIZURA's part-set switches), tags: ["calm", ...] (only parts with one of these
//   mood tags), allow: { group: [keys] } (only these; overrides the switches and tags), deny: { group: [keys] },
//   noStrong: true (leave out parts JIZURA marks as strong: crash zooms, hard shakes ...) }
// Explicit fields on a cut are used even when the pickers may not choose them.
function mvJzEnabled(spec) {
    var o = spec.parts || {}, en = {}, g, i, k, ord, ok, m, t, hit;
    for (g = 0; g < JZ_GROUPS.length; g++) {
        var G = JZ_GROUPS[g];
        ord = jzOrder(G); en[G] = {};
        for (i = 0; i < ord.length; i++) {
            k = ord[i];
            if (o.allow && o.allow[G]) ok = jzIndexOf(o.allow[G], k) >= 0;
            else {
                ok = jzRandomOk(o, G, k);
                m = jzMeta(G, k);
                if (ok && o.tags && o.tags.length && m.tags && m.tags.length && G !== 'fx') {
                    hit = false;
                    for (t = 0; t < o.tags.length; t++) if (jzIndexOf(m.tags, o.tags[t]) >= 0) { hit = true; break; }
                    ok = hit;
                }
            }
            if (o.noStrong && jzMeta(G, k).strong) ok = false;
            if (o.deny && o.deny[G] && jzIndexOf(o.deny[G], k) >= 0) ok = false;
            en[G][k] = ok;
        }
    }
    if (en.enter) en.enter.mvSync = false;       // ours: only when a cut asks for "sync": "char"
    return en;
}
function mvJzCheck(g, k, dflt) {
    if (k == null || k === '' || k === 'none') return k;
    if (jzHas(g, k)) return k;
    var f = jzFallback(g, k, dflt);
    mvJzWarn(g + ' "' + k + '" is not built in AE; using ' + f);
    return f;
}

// ---------------------------------------------------------------- char timing
// chars: song times of the non-space glyphs of text -> times (seconds from cut start) for every glyph of text, spaces
// taking the time of the next glyph
function mvJzCharTimes(text, chars, start) {
    var cs = jzChars(text), out = [], nonsp = [], i, j = 0;
    for (i = 0; i < cs.length; i++) if (!/[\s\u3000]/.test(cs[i])) nonsp.push(i);
    if (!chars || !chars.length) return null;
    if (chars.length !== nonsp.length) mvJzWarn('"' + text + '": ' + chars.length + ' char times for ' + nonsp.length + ' glyphs');
    var compact = [];
    for (i = 0; i < nonsp.length; i++) {
        var t = chars[Math.min(i, chars.length - 1)];
        if (typeof t === 'object' && t) t = t.start != null ? t.start : t.t;
        compact.push(Math.max(0, t - start));
    }
    for (i = 0; i < cs.length; i++) {
        while (j < nonsp.length && nonsp[j] < i) j++;
        out.push(compact[Math.min(j, compact.length - 1)]);
    }
    return { all: out, compact: compact };
}

// ---------------------------------------------------------------- plan
function mvJzDecorList(list, rng, seedBase) {
    var out = [], i, d, id;
    for (i = 0; i < list.length; i++) {
        d = list[i]; id = typeof d === 'string' ? d : d.id;
        if (!id || !jzHas('decor', id)) { if (id) mvJzWarn('decor "' + id + '" is not built in AE; skipped'); continue; }
        var base = jzDecorParams(seedBase != null ? new JzRng(jzHash(seedBase, id, i)) : rng, id);
        out.push(typeof d === 'string' ? base : mvJzMerge(base, d));
    }
    return out;
}
// cut decor + the kit (a part the kit already has is not doubled)
function mvJzWithKit(decor, kit) {
    var ids = [], out = [], i;
    for (i = 0; i < kit.length; i++) ids.push(kit[i].id);
    for (i = 0; i < decor.length; i++) if (jzIndexOf(ids, decor[i].id) < 0) out.push(decor[i]);
    return out.concat(kit);
}
function mvJzPlan(spec) {
    if (!spec || !spec.cuts || !spec.cuts.length) throw new Error('MVJZ: the spec has no cuts');
    MVJZ_PLANLOG = [];
    mvJzSetBreaks(spec.cuts);
    mvJzFonts(spec.fontCandidates);
    var W = spec.width || 1920, H = spec.height || 1080, fps = spec.fps || 24, seed = spec.seed || 1;
    var st = mvJzStyle(spec), en = mvJzEnabled(spec);
    var fx = mvJzMerge({ motion: 0.6, glitch: 0.3, chroma: 0.5, decor: 0.5, density: 0.6, texture: 0.6, bgSwitch: 0.35, onTwos: true, flash: true, hud: false }, spec.fx || null);
    var lang = spec.lang || 'ja';
    var plan = { version: 2, generator: 'MVJZ ' + MVJZ_VERSION, title: spec.title || '', artist: spec.artist || '', W: W, H: H, width: W, height: H, fps: fps,
        duration: 0, style: st, styleKey: typeof spec.style === 'string' ? spec.style : 'custom', fx: fx, lines: [], cuts: [], events: [], hud: !!fx.hud,
        lang: lang, centerFree: false, zones: null };
    jzSetLang(lang);
    var hist = [], bgHist = [], fxHist = [], nS = st.schemes.length, schemeIdx = 0, prevLine = null, kitSeed = jzHash(seed, 'kit');
    var kit = spec.kit ? mvJzDecorList(spec.kit, null, kitSeed) : [];
    var cuts = spec.cuts, i, lastEnd = 0;
    for (i = 0; i < cuts.length; i++) {
        var sc = cuts[i], rng = new JzRng(jzHash(seed, i + 1, sc.seed || 0));
        var start = +sc.start, end = +sc.end;
        if (!(end > start)) { mvJzWarn('cut ' + (i + 1) + ' has end <= start; skipped'); continue; }
        var dur = end - start, text = sc.text == null ? '' : String(sc.text), nn = jzCount(text);
        var kind = sc.kind || (text ? 'lyric' : 'interlude'), emph = !!sc.emph, line = sc.line == null ? i : sc.line;
        var lastOfLine = !(i + 1 < cuts.length && (cuts[i + 1].line == null ? i + 1 : cuts[i + 1].line) === line);
        if (nS > 1 && sc.scheme == null && prevLine !== null && line !== prevLine && rng.chance(fx.bgSwitch * (emph ? 1.8 : 1))) schemeIdx = (schemeIdx + 1 + rng.int(0, nS - 2)) % nS;
        var scheme = sc.scheme != null ? sc.scheme % nS : schemeIdx;
        var c;
        if (kind === 'title' || kind === 'interlude') {
            // a title may take a lyric layout (e.g. "vcols" to keep it beside a face); otherwise JIZURA's centred title card
            var lay = kind === 'title' ? (sc.layout && jzHas('layout', sc.layout) && sc.layout !== 'interlude' ? sc.layout : 'title') : 'interlude';
            c = { index: 0, text: kind === 'title' ? (text || plan.title) : (text || plan.title || ''), lineText: '', note: sc.note != null ? sc.note : plan.artist, line: -1,
                start: start, end: end, dur: dur, layout: lay, enter: mvJzCheck('enter', sc.enter || 'blur', 'blur'), exit: mvJzCheck('exit', sc.exit || 'blur', 'blur'), hold: 'still',
                inDur: sc.inDur != null ? sc.inDur : 0.3, outDur: sc.outDur != null ? sc.outDur : 0.3,
                params: mvJzMerge(kind === 'title' ? { font: rng.pick(st.fonts.display) } : { variant: 'quiet', showTitle: false, titleText: '' }, sc.params || null),
                decor: sc.decor ? mvJzDecorList(sc.decor, rng) : (kind === 'interlude' ? jzPickDecor(rng, st, en, { decor: Math.max(0.6, fx.decor) }, 'interlude', hist) : []),
                scheme: scheme, seed: jzHash(seed, i, 405) % 1000000, emph: false, recap: false, words: [], stagger: 0.04,
                treat: 'none', treatP: {}, bg: sc.image ? (sc.bg || 'none') : mvJzCheck('bg', sc.bg || 'none', null), bgP: {}, cam: mvJzCheck('cam', sc.cam || 'push', 'push'), camP: {},
                trans: null, transP: {}, transDur: 0 };
            if (c.bg && c.bg !== 'none') c.bgP = mvJzMerge(jzPlanOf('bg', c.bg, rng, st), sc.bgP || null);
            c.decor = mvJzWithKit(c.decor, kit);
        } else {
            var layout = mvJzCheck('layout', sc.layout, 'center') || jzPickLayout(rng, st, en, nn, dur, hist, emph, !!sc.recap, H > W);
            var enter = mvJzCheck('enter', sc.enter, 'blur') || jzPickEnter(rng, st, en, layout, dur, hist, emph, nn);
            var exit = mvJzCheck('exit', sc.exit, 'blur') || jzPickExit(rng, st, en, layout, dur, lastOfLine, hist);
            var hold = mvJzCheck('hold', sc.hold, 'still') || jzPickHold(rng, en, fx, hist);
            // entrance / exit lengths: JIZURA's own rules (15_plan.jsx), unless the cut gives them
            var inDur = jzClamp(dur * 0.36, 0.12, 0.6);
            if (enter === 'type') inDur = jzClamp(nn * 0.055 + 0.1, 0.15, dur * 0.65);
            if (enter === 'assemble') inDur = jzClamp(dur * 0.45, 0.22, 0.75);
            var mIn = jzTab(jzMeta('enter', enter).inDur, dur, nn); if (mIn != null) inDur = mIn;
            if (enter === 'cut') inDur = 0.12;
            var outDur = exit === 'cut' ? 0 : jzClamp(dur * 0.3, 0.14, 0.55);
            if (/^(explode|fall|drift)$/.test(exit)) outDur = jzClamp(dur * 0.38, 0.25, 0.7);
            var mOut = jzTab(jzMeta('exit', exit).outDur, dur, nn); if (mOut != null) outDur = mOut;
            if (sc.inDur != null) inDur = sc.inDur;
            if (sc.outDur != null) outDur = sc.outDur;
            // readable before the voice: the entrance ends by readBy (song time of the first glyph minus the lead)
            if (sc.readBy != null && enter !== 'cut' && sc.inDur == null) inDur = jzClamp(Math.min(inDur, sc.readBy - start), 0.08, inDur);
            if (inDur + outDur > dur * 0.92) { var f = dur * 0.92 / (inDur + outDur); inDur *= f; outDur *= f; }
            var params = mvJzMerge(jzPlanOf('layout', layout, rng, st, { text: text, n: nn, W: W, H: H, dur: dur }), sc.params || null);
            var decor = sc.decor ? mvJzDecorList(sc.decor, rng) : jzPickDecor(rng, st, en, fx, layout, hist);
            decor = mvJzWithKit(decor, kit);
            var treat = mvJzCheck('treat', sc.treat, 'none') || jzPickTreat(rng, st, en, fx, layout, emph, hist);
            var treatP = treat && treat !== 'none' ? mvJzMerge(jzPlanOf('treat', treat, rng, st), sc.treatP || null) : {};
            var bg;
            if (sc.bg != null) bg = mvJzCheck('bg', sc.bg, null) || 'none';
            else if (sc.image) bg = 'none';                       // the illustration is the background
            else { bg = jzPickBg(rng, st, en, fx, bgHist); var LM = jzMeta('layout', layout); if (LM.busy && !jzMeta('bg', bg).subtle) bg = 'none'; }
            bgHist.push(bg);
            var bgP = bg && bg !== 'none' ? mvJzMerge(jzPlanOf('bg', bg, rng, st), sc.bgP || null) : {};
            var cam = mvJzCheck('cam', sc.cam, 'push') || jzPickCam(rng, st, en, fx, layout, emph, hist);
            var camP = mvJzMerge(jzPlanOf('cam', cam, rng, st), sc.camP || null);
            var prevCut = plan.cuts[plan.cuts.length - 1], trans = null, transP = {}, transDur = 0;
            if (prevCut && Math.abs(prevCut.end - start) < 0.06 && prevCut.layout !== 'interlude' && sc.trans !== false && sc.trans !== 'none') {
                if (sc.trans) trans = mvJzCheck('trans', sc.trans, null);
                else if (spec.autoTrans !== false && dur > 0.5) trans = jzPickTrans(rng, st, en, fx, emph, hist);
                if (trans) {
                    transDur = sc.transDur != null ? sc.transDur : jzClamp(jzMeta('trans', trans).dur || 0.35, 0.12, Math.min(0.6, dur * 0.45));
                    transP = mvJzMerge(jzPlanOf('trans', trans, rng, st), sc.transP || null);
                    enter = 'cut'; inDur = 0.12; prevCut.exit = 'cut'; prevCut.outDur = 0;
                }
            }
            c = { index: 0, text: text, lineText: sc.lineText || text, note: sc.note || null, line: line, start: start, end: end, dur: dur,
                layout: layout, enter: enter, exit: exit, hold: hold, inDur: inDur, outDur: outDur, params: params, decor: decor, scheme: scheme,
                seed: jzHash(seed, i, sc.seed || 0) % 1000000, emph: emph, recap: !!sc.recap, words: jzChunk(text), stagger: sc.stagger != null ? sc.stagger : rng.range(0.025, 0.06),
                treat: treat || 'none', treatP: treatP, bg: bg, bgP: bgP, cam: cam, camP: camP, trans: trans, transP: transP, transDur: transDur };
            var dids = []; for (var q = 0; q < decor.length; q++) dids.push(decor[q].id);
            hist.push({ layout: layout, enter: enter, exit: exit, hold: hold, treat: c.treat, cam: cam, trans: trans, decor: dids });
            if (sc.chars && sc.sync) {
                var ct = mvJzCharTimes(text, sc.chars, start);
                if (ct) { c.mvSync = sc.sync === 'char' ? 'char' : 'word'; c.mvCharT = ct.compact; c.mvSyncStyle = sc.syncStyle || 'fade'; c.mvSyncDur = sc.syncDur || 0.12;
                          c.mvLead = sc.lead != null ? sc.lead : (spec.lead != null ? spec.lead : 0.06);
                          mvJzKeepWhole(c, sc, spec); }
            } else if (sc.chars && spec.keepWhole !== false) mvJzWholeScreen(c, sc, spec, mvJzCharTimes(text, sc.chars, start));
            if (spec.autoEvents !== false) mvJzAutoEvents(plan, c, rng, st, en, fx, fxHist, emph, line !== prevLine && !!sc.impact);
        }
        c.mvImage = sc.image || null;
        c.mvShade = sc.shade != null ? sc.shade : (spec.shade != null ? spec.shade : null);
        plan.cuts.push(c);
        if (c.line >= 0 && line !== prevLine) plan.lines.push({ index: plan.lines.length, text: c.lineText, start: start, end: end, visEnd: end, note: c.note, impact: !!sc.impact });
        else if (c.line >= 0 && plan.lines.length) { var PL = plan.lines[plan.lines.length - 1]; PL.end = end; PL.visEnd = end; }
        if (c.line >= 0) prevLine = line;
        if (end > lastEnd) lastEnd = end;
    }
    plan.cuts.sort(function (a, b) { return a.start - b.start; });
    for (i = 0; i < plan.cuts.length; i++) plan.cuts[i].index = i;
    var ex = spec.events || [];
    for (i = 0; i < ex.length; i++) {
        var e = ex[i], known = { chroma: 1, slice: 1, block: 1, shake: 1, flash: 1, invert: 1, zoom: 1, mosaic: 1 };
        if (!known[e.type] && !jzHas('fx', e.type)) { mvJzWarn('event "' + e.type + '" is not built in AE; skipped'); continue; }
        var EM = jzMeta('fx', e.type);
        plan.events.push({ t: +e.t, type: e.type, amp: e.amp != null ? e.amp : (EM.amp || 1), dur: e.dur != null ? e.dur : (EM.dur || 3) / 24 });
    }
    plan.events.sort(function (a, b) { return a.t - b.t; });
    plan.duration = spec.duration || (lastEnd + 0.5);
    if (spec.keyBg) plan.keyBg = spec.keyBg;
    return plan;
}
// a sung line is whole on screen before it leaves (mv-rules-general: readable 0.25 s + 0.1 s per glyph after it, at most 1.4 s):
// the exit is shortened (or made a cut) so it starts after the last glyph is readable, and a glyph sung too close to the
// switch is shown earlier. spec.keepWhole: false turns this off; spec.readHold (0.25) / spec.readPer (0.1) / spec.readMax (1.4).
function mvJzKeepWhole(c, sc, spec) {
    if (spec.keepWhole === false || !c.mvCharT || !c.mvCharT.length) return;
    var T = c.mvCharT, n = T.length, hold = spec.readHold != null ? spec.readHold : 0.25, per = spec.readPer != null ? spec.readPer : 0.1,
        cap = spec.readMax != null ? spec.readMax : 1.4, lead = c.mvLead || 0, k, moved = 0;
    var room = c.dur - (T[n - 1] - lead + hold);
    if (sc.outDur == null && c.exit !== 'cut' && c.outDur > room) {
        if (room >= 0.15) c.outDur = room; else { c.exit = 'cut'; c.outDur = 0; }
    }
    var exitAt = c.dur - (c.outDur || 0), floor = Math.min(c.inDur || 0, exitAt * 0.5);
    for (k = n - 1; k >= 0; k--) {
        var lim = exitAt - Math.min(cap, hold + per * (n - 1 - k)) + lead;
        if (T[k] > lim) { T[k] = Math.max(lim, floor); moved++; }
    }
    for (k = 1; k < n; k++) if (T[k] < T[k - 1]) T[k] = T[k - 1];
    if (moved) MVJZ_PLANLOG.push('cut at ' + jzN(c.start) + ': ' + moved + ' glyph(s) shown early to stay readable');
}
// a line shown as one screen (no sync): every glyph is in by readBy (the per-glyph / per-layer stagger is squeezed into
// the time before the voice; mv-rules-general "the whole screen at once"), and the exit waits until the last glyph is sung
function mvJzWholeScreen(c, sc, spec, ct) {
    if (!ct) return;
    var T = ct.compact, n = T.length, k;
    if (sc.readBy != null && sc.stagger == null && c.enter !== 'cut') {
        var avail = (+sc.readBy - c.start) - (c.inDur || 0);
        c.stagger = jzClamp(avail / (n + 6), 0.004, c.stagger || 0.04);
    }
    var room = c.dur - (T[n - 1] + (spec.wholeHold != null ? spec.wholeHold : 0.1));
    if (sc.outDur == null && c.exit !== 'cut' && c.outDur > room) {
        if (room >= 0.15) c.outDur = room; else { c.exit = 'cut'; c.outDur = 0; }
    }
}
// the per-cut effect events of JIZURA's planner (15_plan.jsx), for cuts we place ourselves
function mvJzAutoEvents(plan, c, rng, st, en, fx, fxHist, emph, impactStart) {
    var F = 1 / 24, cs = c.start, dur = c.dur, g = fx.glitch * (st.glitchBoost || 1);
    function ev(t, type, amp, d) { plan.events.push({ t: t, type: type, amp: amp, dur: d }); }
    if (en.fx.chroma !== false) ev(cs, 'chroma', 1.4 + rng.range(0, 2) * fx.chroma + (emph ? 2.5 : 0), 0.25);
    if (en.fx.slice !== false && rng.chance(g * 0.5 + (emph ? 0.3 : 0))) ev(cs, 'slice', 0.6 + rng.range(0, 0.8) * g + (emph ? 0.5 : 0), rng.pick([2, 3, 4]) * F);
    if (en.fx.block !== false && rng.chance(g * 0.22)) ev(cs + rng.range(0, 0.05), 'block', 0.5 + g, rng.pick([2, 4]) * F);
    if (en.fx.shake !== false && (emph || rng.chance(fx.motion * 0.18))) ev(cs, 'shake', (emph ? 1 : 0.5) * fx.motion, 0.3);
    if (en.fx.flash !== false && fx.flash && impactStart) ev(cs, 'flash', 1, 3 * F);
    if (en.fx.invert !== false && rng.chance(0.035 * g)) ev(cs, 'invert', 1, 2 * F);
    if (en.fx.zoom !== false && ((emph && rng.chance(0.6)) || rng.chance(0.06 * fx.motion))) ev(cs, 'zoom', 0.7 + 0.5 * fx.motion, 0.22);
    if (en.fx.mosaic !== false && rng.chance(0.04 * g)) ev(cs, 'mosaic', 1, 3 * F);
    if (en.fx.slice !== false && dur > 0.8 && rng.chance(g * 0.4)) ev(cs + rng.range(0.35, 0.8) * dur, 'slice', 0.4 + g * 0.4, 2 * F);
    if (plan.cuts.length > 0) {
        var pe = jzPickFx(rng, st, en, fx, emph, fxHist, 'edge');
        if (pe) { var M1 = jzMeta('fx', pe); ev(cs - (M1.pre ? M1.pre * F : 0), pe, (M1.amp || 1) * (0.7 + 0.5 * g + (emph ? 0.3 : 0)), (M1.dur || 4) * F); fxHist.push(pe); }
    }
    if (dur > 1.1) { var pm = jzPickFx(rng, st, en, fx, emph, fxHist, 'mid'); if (pm) { var M2 = jzMeta('fx', pm); ev(cs + rng.range(0.4, 0.75) * dur, pm, (M2.amp || 1) * (0.5 + 0.4 * g), (M2.dur || 3) * F); } }
}

// ---------------------------------------------------------------- sync: text layers follow the sung glyphs
function mvJzLayerText(L) {
    try { return String(L.property('ADBE Text Properties').property('ADBE Text Document').value.text); } catch (e) { return null; }
}
function mvJzCompact(s) { return String(s).replace(/[\s\u3000]+/g, ''); }
// glyph offset of a text layer inside the cut's lyric (non-space glyphs), or -1. A text that occurs more than once
// ("A B A") takes the first occurrence no earlier layer of this cut has taken; copies of a text taken already (repeats,
// echoes) share its first occurrence.
function mvJzOffset(c, txt) {
    if (!txt) return -1;
    var S = '\u0001', a = S + jzChars(mvJzCompact(c.text)).join(S) + S, b = jzChars(mvJzCompact(txt)).join(S);
    if (!b) return -1;
    b = S + b + S;
    var used = c.mvUsed || (c.mvUsed = {}), first = -1, p = a.indexOf(b), off;
    while (p >= 0) {
        off = a.substr(0, p + 1).split(S).length - 2;
        if (first < 0) first = off;
        if (!used[off]) { used[off] = true; return off; }
        p = a.indexOf(b, p + 1);
    }
    return first;
}
var mvJzMotion0 = jzMotion;
jzMotion = function (ctx, L, o) {
    var c = ctx.cut;
    if (!c || !c.mvSync || !c.mvCharT || (o && o.text === false)) return mvJzMotion0(ctx, L, o);
    var txt = mvJzLayerText(L), off = mvJzOffset(c, txt);
    if (off < 0) return mvJzMotion0(ctx, L, o);
    var o2 = {}, k;
    for (k in o) if (o.hasOwnProperty(k)) o2[k] = o[k];
    // a layer is fully in (readable) "lead" seconds before its first glyph is sung: it starts lead + entrance earlier
    var lead = c.mvLead || 0, D = Math.max(0.03, c.mvSyncDur || 0.12);
    var d = Math.max(0, c.mvCharT[Math.min(off, c.mvCharT.length - 1)] - lead - (c.inDur || 0)), s0 = c.stagger;
    o2.mi = d > 0.0005 ? 1 : 0;
    if (c.mvSync === 'char') {
        var cs = jzChars(txt), ts = [], j = off, i;
        for (i = 0; i < cs.length; i++) {           // every character of the layer (AE's textIndex counts spaces too)
            ts.push(jzN(Math.max(0, c.mvCharT[Math.min(j, c.mvCharT.length - 1)] - lead - D)));
            if (!/[\s\u3000\r\n]/.test(cs[i])) j++;
        }
        c.mvTS = '[' + ts.join(',') + ']';
        o2.enter = 'mvSync'; o2.mi = 0;
    }
    c.stagger = d;
    try { return mvJzMotion0(ctx, L, o2); }
    finally { c.stagger = s0; c.mvTS = null; }
};
// every glyph appears at its own sung time (cut-relative times in c.mvTS); styles: fade, pop, drop, rise, blur
jzReg('enter', 'mvSync', { selfHide: true, apply: function (m) {
    var c = m.c, D = jzN(Math.max(0.03, c.mvSyncDur || 0.12)), sty = c.mvSyncStyle || 'fade', sz = m.size;
    var core = m.HD + 'var TS=' + (c.mvTS || '[0]') + ';var i=Math.min(textIndex-1,TS.length-1);var x=cl((time-TS[i])/' + D + ');';
    jzAnimator(m.L, 'MV Sync Hide', [['ADBE Text Opacity', 0]], core + 'time<TS[i]?100:(1-oc(x))*100');
    if (sty === 'pop') jzAnimator(m.L, 'MV Sync Pop', [['ADBE Text Scale 3D', [0, 0, 100]]], core + 'x<=0?100:(1-ob(x,2.2))*100');
    else if (sty === 'drop') jzAnimator(m.L, 'MV Sync Drop', [['ADBE Text Position 3D', [0, -0.35 * sz, 0]]], core + '(1-oe(x))*100');
    else if (sty === 'rise') jzAnimator(m.L, 'MV Sync Rise', [['ADBE Text Position 3D', [0, 0.3 * sz, 0]]], core + '(1-oe(x))*100');
    else if (sty === 'blur') jzAnimator(m.L, 'MV Sync Blur', [['ADBE Text Blur', [14, 14]]], core + '(1-oc(x))*100');
} });

// ---------------------------------------------------------------- line breaks on phrase boundaries
// A cut may carry "breaks": indices of the non-space glyphs of its text where a new line may start (phrase boundaries;
// tools/jz_spec.py makes them with BudouX). JIZURA breaks a line by kana / kanji changes and cuts vertical columns by
// count, which can split a word (kaori -> ka / ori) or leave one glyph alone in a column; with the hints a break falls
// on a phrase boundary whenever one fits. Texts without hints break as JIZURA does.
var MVJZ_BREAKS = {};
function mvJzSetBreaks(cuts) {
    MVJZ_BREAKS = {};
    for (var i = 0; i < cuts.length; i++) {
        var c = cuts[i];
        if (c && c.text && c.breaks && c.breaks.length) MVJZ_BREAKS['k' + mvJzCompact(c.text)] = c.breaks;
    }
}
function mvJzBreaksOf(text) { var k = 'k' + mvJzCompact(text); return MVJZ_BREAKS.hasOwnProperty(k) ? MVJZ_BREAKS[k] : null; }
// text -> lines: about nWant lines (one fewer or one more when that keeps the breaks on phrase boundaries), as even as
// can be, longer than maxPer only when that saves a break inside a phrase (the layouts fit the text to their box), no
// line starting with a small kana / closing mark
function mvJzHintLines(text, maxPer, hints, nWant) {
    var arr = jzChars(text), n = arr.length, fi = [], ok = {}, cand = [], k, i, f = 0;
    for (k = 0; k <= n; k++) { fi.push(f); if (k < n && !/[\s\u3000\r\n]/.test(arr[k])) f++; }
    for (i = 0; i < hints.length; i++) ok['p' + hints[i]] = true;
    for (k = 1; k < n; k++) {
        if (/[\s\u3000\r\n]/.test(arr[k])) continue;
        cand.push({ k: k, good: ok['p' + fi[k]] === true || /[\s\u3000]/.test(arr[k - 1]),
            bad: jzIsNoStart(arr, k) || '\u3063\u3083\u3085\u3087\u3041\u3043\u3045\u3047\u3049\u30c3\u30e3\u30e5\u30e7\u30fc\u3001\u3002\u2026'.indexOf(arr[k]) >= 0 });
    }
    function solve(nL) {
        var ideal = f / nL, memo = {};
        function lineCost(g) { var ov = Math.max(0, g - maxPer); return (g - ideal) * (g - ideal) + ov * ov * 8; }
        function best(s, l) {
            if (l === 1) return { c: lineCost(fi[n] - fi[s]), cuts: [] };
            var key = s + '_' + l;
            if (memo[key]) return memo[key];
            var r = { c: 1e12, cuts: [] };
            for (var j = 0; j < cand.length; j++) {
                var cd = cand[j], g = fi[cd.k] - fi[s];
                if (cd.k <= s || g < 1) continue;
                var sub = best(cd.k, l - 1), cost = lineCost(g) + (cd.good ? 0 : 80) + (cd.bad ? 400 : 0) + sub.c;
                if (cost < r.c) r = { c: cost, cuts: [cd.k].concat(sub.cuts) };
            }
            memo[key] = r;
            return r;
        }
        return best(0, nL);
    }
    var nL = Math.max(1, Math.min(nWant, f)), r = solve(nL), d, r2;
    for (d = -1; d <= 1; d += 2) {
        if (nL + d < 1 || nL + d > f) continue;
        r2 = solve(nL + d); r2.c += 12;
        if (r2.c < r.c) r = r2;
    }
    var cuts = [0].concat(r.cuts).concat([n]), out = [];
    for (i = 0; i < cuts.length - 1; i++) out.push(jzTrim(arr.slice(cuts[i], cuts[i + 1]).join('')));
    return out;
}
var mvJzSplit0 = jzSplitLines;
jzSplitLines = function (text, maxPer) {
    var h = text ? mvJzBreaksOf(text) : null;
    if (!h || jzIsLatinText(text)) return mvJzSplit0(text, maxPer);
    var n = jzChars(text).length;
    if (n <= maxPer) return text;
    return mvJzHintLines(text, maxPer, h, Math.ceil(n / maxPer)).join('\r');
};
// vertical columns ("split" variant) on phrase boundaries, sized by the longest column
var mvJzVcols0 = JZ_REG.layout.vcols.build;
JZ_REG.layout.vcols.build = function (ctx) {
    var W = ctx.W, H = ctx.H, sc = ctx.sc, c = ctx.cut, text = c.text.replace(/[\s\u3000]+/g, ''), n = jzCount(text), h = mvJzBreaksOf(c.text);
    var variant = jzP(ctx, 'variant', n <= 5 ? 'repeat' : 'split');
    if (!h || (variant === 'repeat' && n <= 9)) return mvJzVcols0(ctx);
    var font = jzFontOf(ctx, 'font', 'serif'), bb = null, i, mx = 1;
    var perCol = Math.max(2, Math.min(jzP(ctx, 'perCol', 4) + 1, Math.ceil(n / Math.ceil(n / 7))));
    var colsA = n <= perCol ? [text] : mvJzHintLines(text, perCol, h, Math.ceil(n / perCol));
    for (i = 0; i < colsA.length; i++) mx = Math.max(mx, jzCount(colsA[i]));
    var sz = Math.min(H * 0.74 / (mx * 1.03), W * 0.8 / (colsA.length * 1.4)), top = H / 2 - mx * sz * 1.03 / 2;
    for (i = 0; i < colsA.length; i++) {
        var x = W / 2 + ((colsA.length - 1) / 2 - i) * sz * 1.4;
        var cL = jzText(ctx, jzVertical(colsA[i]), { font: font, size: sz, color: sc.fg, x: x, y: 0, leading: sz * 1.03 });
        var hh = jzSize(cL)[1]; jzXf(cL, 'ADBE Position').setValue([x, top + hh / 2]);
        jzAnimate(ctx, cL, { size: sz, mi: i * 3 });
        bb = jzUnion(bb, jzBB(cL));
    }
    return bb;
};

// mixed (sizes by kind of glyph, two rows for a long line): JIZURA's own code (ae/30_layouts.jsx, v0.13.0, MIT) with the
// rows broken on a phrase boundary instead of the exact middle
JZ_REG.layout.mixed.build = function (ctx) {
    var W = ctx.W, H = ctx.H, sc = ctx.sc, c = ctx.cut, seed = c.seed;
    // Latin lyrics keep the spaces between words and break rows between words (same as the browser)
    var srcT = jzTrim(c.text).replace(/[\s\u3000]+/g, ' '), latin = jzIsLatinText(srcT) && srcT.indexOf(' ') > 0, rowChars = [], n = 0, off = 0, r, i;
    if (latin) {
        var len = jzChars(srcT).length, parts = (len > 9 ? jzSplitLines(srcT, Math.ceil(len / (len > 30 ? 3 : 2))) : srcT).split('\r');
        for (r = 0; r < parts.length; r++) rowChars.push(jzChars(parts[r]));
    } else {
        var chars = jzChars(srcT.replace(/ /g, '')), per = Math.ceil(chars.length / (chars.length > 9 ? 2 : 1)), hm = mvJzBreaksOf(c.text), hl;
        if (chars.length > 9 && hm) { hl = mvJzHintLines(chars.join(''), per, hm, 2); for (r = 0; r < hl.length; r++) rowChars.push(jzChars(hl[r])); }   // MVJZ: rows on phrases
        else if (chars.length > 9) { rowChars.push(chars.slice(0, per)); rowChars.push(chars.slice(per)); } else rowChars.push(chars);
    }
    var rows = rowChars.length;
    for (r = 0; r < rows; r++) n += rowChars[r].length;
    var fB = jzFontOf(ctx, 'fontBig', 'display'), fS = jzFontOf(ctx, 'fontSmall', 'serif'), smallK = jzP(ctx, 'smallK', 0.52), rotA = jzP(ctx, 'rotAmp', 6), mode = jzP(ctx, 'mode', 'line');
    var bb = null;
    for (r = 0; r < rows; off += rowChars[r].length, r++) {
        var row = rowChars[r], Ls = [], ks = [], widths = [], sum = 0;
        for (i = 0; i < row.length; i++) {
            var ch = row[i], gi = off + i;
            if (ch === ' ') { Ls.push(null); ks.push(0.8); widths.push(26); sum += 26; continue; }
            var k = jzIsKanji(ch) ? 1 : jzIsKata(ch) ? 0.88 : jzIsLatin(ch) ? 0.8 : jzIsPunct(ch) ? 0.42 : smallK + jzR(seed, gi, 3) * 0.14;
            var font = (jzIsKanji(ch) || jzIsKata(ch)) ? fB : (jzR(seed, gi, 4) < 0.55 ? fS : fB);
            var L = jzText(ctx, ch, { font: font, size: 100 * k, color: sc.fg, x: 0, y: 0 });
            var sz = jzSize(L); Ls.push(L); ks.push(k); widths.push(Math.max(sz[0], 100 * k * 0.6)); sum += widths[i];
        }
        if (!sum) continue;
        var s = Math.min(W * 0.86 / sum, (H * (rows > 2 ? 0.24 : rows > 1 ? 0.3 : 0.4)) / 100);
        var x = W / 2 - sum * s / 2, base = 100 * s, baseline = H / 2 + base * 0.38 + (r - (rows - 1) / 2) * base * 1.05;
        for (i = 0; i < Ls.length; i++) {
            if (!Ls[i]) { x += widths[i] * s; continue; }
            var gi2 = off + i, src = Ls[i].property('ADBE Text Properties').property('ADBE Text Document'), td = src.value;
            td.fontSize = 100 * ks[i] * s; if (gi2 === (jzP(ctx, 'accentIdx', 99) % n) && !jzIsKanji(row[i])) td.fillColor = jzHex(sc.accent);
            src.setValue(td); jzAnchor(Ls[i]);
            var size = 100 * ks[i] * s, y = baseline - size / 2 + (jzR(seed, gi2, 5) * 2 - 1) * base * 0.06;
            if (mode === 'stair') y += (i - (Ls.length - 1) / 2) * base * 0.12;
            if (mode === 'wave') y += Math.sin(i * 1.1) * base * 0.1;
            jzXf(Ls[i], 'ADBE Position').setValue([x + widths[i] * s / 2, y]);
            jzXf(Ls[i], 'ADBE Rotate Z').setValue((jzR(seed, gi2, 6) * 2 - 1) * rotA);
            jzMotion(ctx, Ls[i], { size: size, mi: gi2 });
            bb = jzUnion(bb, jzBB(Ls[i]));
            x += widths[i] * s;
        }
    }
    return bb;
};
// ---------------------------------------------------------------- after the build: illustrations under the lyric
function mvJzImport(path) {
    if (MVJZ_IMG[path]) return MVJZ_IMG[path];
    var f = new File(path);
    if (!f.exists) throw new Error('MVJZ: image not found: ' + path);
    var it = app.project.importFile(new ImportOptions(f));
    MVJZ_IMG[path] = it;
    return it;
}
function mvJzFindLayer(C, name) { for (var i = 1; i <= C.numLayers; i++) if (C.layer(i).name === name) return C.layer(i); return null; }
// wrapper comps of the built project, by cut index (main-comp layers are named "001 lyric..." with the wrapper as source)
function mvJzWrappers(comp) {
    var out = {}, i, L, m;
    for (i = 1; i <= comp.numLayers; i++) {
        L = comp.layer(i);
        m = /^(\d{3}) /.exec(L.name);
        if (m && L.source && L.source.numLayers != null) out[parseInt(m[1], 10) - 1] = { layer: L, comp: L.source };
    }
    return out;
}
// image = "path" or { path, focus: [x, y] (0..1 point of the picture kept in the centre), zoom: 1 (extra cover factor),
//   cam: { zoom: %/s (default 0.75, negative = pull out), rot: deg/s (0.3), pan: [px/s, px/s] at 1920 wide ([12, 0]) } | false,
//   keepPaper: true, opacity: 100 }
function mvJzPlaceImage(wc, cut, sc, W, H, spec) {
    var im = typeof cut.mvImage === 'string' ? { path: cut.mvImage } : cut.mvImage, item = mvJzImport(im.path);
    var bgL = mvJzFindLayer(wc, 'JZ BG');
    var L = wc.layers.add(item);
    L.name = 'MV Art';
    if (bgL) L.moveBefore(bgL); else L.moveToEnd();
    var dur = wc.duration;
    try { L.startTime = 0; L.inPoint = 0; L.outPoint = dur; } catch (eo) {}
    var iw = item.width || W, ih = item.height || H;
    var defCam = spec.imageCam != null ? spec.imageCam : { zoom: 0.75, rot: 0.3, pan: [12, 0] };
    var cam = im.cam === false ? { zoom: 0, rot: 0, pan: [0, 0] } : mvJzMerge(defCam, im.cam || null);
    var rng = new JzRng(jzHash(cut.seed, 'art'));
    var dirs = rng.chance(0.5) ? 1 : -1, ux = W / 1920;
    var rot = (cam.rot || 0) * dur * (im.cam && im.cam.rot != null ? 1 : dirs);
    var pan = cam.pan || [0, 0], px = pan[0] * ux * dur * (im.cam && im.cam.pan ? 1 : -dirs), py = (pan[1] || 0) * ux * dur;
    var z = (cam.zoom || 0) / 100 * dur;
    // cover the frame through the whole move: rotation needs cos + aspect * sin, the pan needs its distance on each side
    var th = Math.abs(rot) * Math.PI / 180, need = Math.cos(th) + Math.max(W, H) / Math.min(W, H) * Math.sin(th);
    var cover = Math.max((W + 2 * Math.abs(px)) / iw, (H + 2 * Math.abs(py)) / ih) * need * 100 * (im.zoom || 1);
    var fo = im.focus || [0.5, 0.5];
    var A = jzXf(L, 'ADBE Anchor Point'), P = jzXf(L, 'ADBE Position'), S = jzXf(L, 'ADBE Scale'), R = jzXf(L, 'ADBE Rotate Z');
    // keep the focus point where the frame (plus the pan and the rotation) still lies inside the picture
    var s0 = cover / 100, halfW = (W / 2 + Math.abs(px) / 2) * need / s0, halfH = (H / 2 + Math.abs(py) / 2) * need / s0;
    A.setValue([jzClamp(iw * fo[0], Math.min(halfW, iw / 2), Math.max(iw - halfW, iw / 2)), jzClamp(ih * fo[1], Math.min(halfH, ih / 2), Math.max(ih - halfH, ih / 2))]);
    var s1 = z >= 0 ? cover : cover * (1 - z), s2 = z >= 0 ? cover * (1 + z) : cover;
    if (dur > 0 && (z !== 0 || rot !== 0 || px !== 0 || py !== 0)) {
        S.setValueAtTime(0, [s1, s1]); S.setValueAtTime(dur, [s2, s2]);
        P.setValueAtTime(0, [W / 2 - px / 2, H / 2 - py / 2]); P.setValueAtTime(dur, [W / 2 + px / 2, H / 2 + py / 2]);
        if (rot !== 0) { R.setValueAtTime(0, -rot / 2); R.setValueAtTime(dur, rot / 2); }
    } else { S.setValue([cover, cover]); P.setValue([W / 2, H / 2]); }
    if (im.opacity != null) jzXf(L, 'ADBE Opacity').setValue(im.opacity);
    // shade between picture and lyric (rule 2026-11-18: the picture stays clear, only the area under the lyric darkens).
    //   "halo" (default): a blurred, filled copy of the cut's lyric under it, dark under light text and light under dark
    //   "full": a solid over the whole picture. shade = number (opacity) | { mode, color, opacity, blur (px at 1080) } | false
    var sh = cut.mvShade, light = jzLum(sc.fg) > 0.5;
    if (sh !== false && sh !== 0) {
        var so = sh && typeof sh === 'object' ? sh : {}, mode = so.mode || spec.shadeMode || 'halo';
        var col = so.color || (light ? '#000000' : '#ffffff');
        var op = typeof sh === 'number' ? sh : (so.opacity != null ? so.opacity : (mode === 'halo' ? (light ? 75 : 70) : (light ? 32 : 30)));
        var CL = mode === 'halo' ? mvJzFindLayer(wc, 'content') : null;
        if (CL) {
            var HL = CL.duplicate();
            HL.name = 'MV Halo';
            HL.moveBefore(L);
            var fe = jzEffect(HL, 'ADBE Fill', 'MV Halo Fill'); jzEP(fe, 3, jzHex(col)); jzEP(fe, 7, 1);
            var bl = jzEffect(HL, 'ADBE Gaussian Blur 2', 'MV Halo Blur'); jzEP(bl, 1, (so.blur != null ? so.blur : 46) * H / 1080); jzEP(bl, 3, 0);
            jzXf(HL, 'ADBE Opacity').setValue(op);
        } else {
            var SL = wc.layers.addSolid(jzHex(col), 'MV Shade', W, H, 1, dur);
            SL.moveBefore(L);
            jzXf(SL, 'ADBE Opacity').setValue(op);
        }
    }
    if (im.keepPaper === false) { var pp = mvJzFindLayer(wc, 'JZ Paper'); if (pp) pp.enabled = false; }
    return L;
}
function mvJzPost(comp, plan, spec) {
    var wr = mvJzWrappers(comp), n = 0, i, W = plan.width, H = plan.height;
    for (i = 0; i < plan.cuts.length; i++) {
        var c = plan.cuts[i];
        if (!c.mvImage) continue;
        if (!wr[i]) { mvJzWarn('cut ' + (i + 1) + ': wrapper comp not found; image skipped'); continue; }
        var sc = plan.style.schemes[(c.scheme || 0) % plan.style.schemes.length];
        try { mvJzPlaceImage(wr[i].comp, c, sc, W, H, spec); n++; }
        catch (e) { mvJzWarn('cut ' + (i + 1) + ' image: ' + e.toString() + (e.line ? ' (line ' + e.line + ')' : '')); }
    }
    return { images: n };
}

// plan + build + post in one call. opt: { light, roles, audioItem, audioStart, hud, ghosts }
function mvJzRun(spec, opt) {
    var plan = mvJzPlan(spec);
    var comp = jzBuild(plan, opt || {});
    var post = mvJzPost(comp, plan, spec);
    return { comp: comp, plan: plan, images: post.images, planLog: MVJZ_PLANLOG.slice(0), log: JZLOG.slice(0), fallbacks: JZ_FALLBACKS, fallbackKeys: JZ_FALLBACK_KEYS.slice(0), missingFonts: jzMissingFonts() };
}
// fonts each key resolves to on this machine (for checking a style before a build)
function mvJzFontReport(keys) {
    var out = {}, i;
    if (!keys) { keys = []; for (var k in JZ_FONT_CANDIDATES) if (JZ_FONT_CANDIDATES.hasOwnProperty(k)) keys.push(k); }
    for (i = 0; i < keys.length; i++) out[keys[i]] = jzFont(keys[i]);
    return out;
}

$.global.MVJZ = { version: MVJZ_VERSION, jizura: JZ_PANEL_VERSION, plan: mvJzPlan, post: mvJzPost, run: mvJzRun, build: jzBuild, parse: jzParseJSON,
    fonts: mvJzFonts, fontReport: mvJzFontReport, enabled: mvJzEnabled, log: function () { return JZLOG; }, planLog: function () { return MVJZ_PLANLOG; }, data: JZ_DATA, groups: JZ_GROUPS,
    order: jzOrder, meta: jzMeta };
