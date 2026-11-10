// build_shots.jsx - build an MV section in After Effects from a shot list passed in the job's params.
// No lyrics or song data live in this file (the repository is public): everything comes from MVJOB.params.
//
// params = {
//   name: "MV_test", w: 1920, h: 1080, fps: 30, dur: 23.6,
//   offset: 53.6,                 // song time at comp time 0; every time below is song time
//   audio: "C:\\...\\song.wav",
//   fonts: {mincho: ["NewTegomin-Regular", ...], gothic: [...]},   // first installed one wins
//   shots: [{t0, t1, bg: {...}, char: {...}, texts: [...], fx: [...]}, ...],
//   finish: {grade: {...}, vignette: 45},
//   stills: [song times], save: "name.aep", render: "h264" | "tiff" | null
// }
// bg:    {img | solid, extra, move: [[t, scale%, [x, y]]...], ease, punch: {t, big, dur}, mono: {tint, amount}, keep, keepTol,
//         blur, dim, blinds: {t, dur, angle, width}, mosaic: {t, dur, from}, jolt: [t0, t1, amp], kira: t}
// char:  {img, h, pos, tIn, slam: {t, from, dur}, hops: [t...], hop: px, echo: {color, offset}, jolt: [t0, t1, amp]}
// texts: {text, font, size, pos, fill, stroke, strokeWidth, tIn, tOut,
//         mode: "line" | "chars" | "vchars",
//         line:   words: [[text, start, end]...] (reveal word by word; popPct makes each word grow in), punch: {t, big}, open: {t, from, to, dur}, hop: {t, dur, h},
//                 rgb: [t0, t1], strobe: [t0, t1], kira: t, turb: [t0, t1, amount], rough: true,
//                 image: {img, strobe: [t0, t1], kira: t, jolt: [t0, t1, amp], outline: color}, opacity, grow: [from%, to%]
//         chars:  words (each character appears at its time), pop, drop, scatter: {t, dur, dist}, crumble: {t, dur}, x/top (vchars)}
// fx:    {flash: t, color, dur, peak} | {burst: t, colors, pos, stroke} | {ring: t, pos, size, color, dur} |
//        {frame: t, size, pos, color, width} | {bars: t, band, out} | {black: [t0, t1]}
//        (bars, frames and any fx with under: true are placed below the lyrics; the rest above)

(function () {
    var P = MVJOB.params, OFF = P.offset || 0, t0run = new Date().getTime();
    function T(t) { return t - OFF; }
    function col(c) { return c === null || c === undefined ? c : (typeof c === "string" ? MV.hex(c) : c); }
    function cols(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(col(a[i])); return o; }
    function out(name) { return MVJOB.outdir + "\\" + name; }

    MV.newProject();
    var comp = MV.comp(P.name || "MV_build", P.w, P.h, P.dur, P.fps, [0, 0, 0]);
    var W = comp.width, H = comp.height;

    // fonts
    var FONTS = {}, fontLog = {};
    for (var k in P.fonts) if (P.fonts.hasOwnProperty(k)) { FONTS[k] = MV.pickFont(P.fonts[k]); fontLog[k] = FONTS[k]; }
    function font(name) { return name ? (FONTS[name] !== undefined ? FONTS[name] : MV.pickFont([name])) : null; }

    if (P.audio) {
        var au = comp.layers.add(MV.importFile(P.audio));
        au.startTime = -OFF;
        au.name = "audio";
    }

    function spanRange(L, a, b) { MV.span(L, a, b); return L; }

    function buildBg(b, a, z) {
        var L;
        if (b.solid) L = MV.solid(comp, col(b.solid), "bg");
        else L = MV.layerFrom(comp, b.img, {fit: "cover", extra: b.extra || 1.12, name: "bg " + b.img.replace(/^.*[\\\/]/, "")});
        spanRange(L, a, z);
        if (b.mono) MV.mono(L, col(b.mono.tint), b.mono.amount);
        if (b.keep) MV.keepColor(L, col(b.keep), b.keepTol);
        if (b.blur) MV.blurFx(L, b.blur);
        if (b.dim) MV.dim(L, b.dim);
        var base = MV.tr(L, "scale").value[0];
        if (b.move) {
            var m = [];
            for (var i = 0; i < b.move.length; i++) m.push([T(b.move[i][0]), base * b.move[i][1] / 100, b.move[i][2] || null]);
            MV.move(L, m, b.ease || "inout");
        }
        if (b.punch) MV.punch(L, T(b.punch.t), b.punch.big || 160, b.punch.dur || 0.3);
        if (b.blinds) MV.blindsIn(L, T(b.blinds.t), b.blinds.dur, b.blinds.angle, b.blinds.width);
        if (b.mosaic) MV.mosaicIn(L, T(b.mosaic.t), b.mosaic.dur, b.mosaic.from);
        if (b.jolt) MV.jolt(L, T(b.jolt[0]), T(b.jolt[1]), 24, b.jolt[2] || 20);
        if (b.kira !== undefined) MV.kira(L, T(b.kira), 5);
        return L;
    }

    function buildChar(c, a, z) {
        var L = MV.layerFrom(comp, c.img, {fit: "height", h: c.h || 0.92, pos: c.pos || [W * 0.68, H * 0.55], name: "char"});
        spanRange(L, c.tIn !== undefined ? T(c.tIn) : a, z);
        if (c.slam) MV.slam(L, T(c.slam.t), c.slam.from || "right", c.slam.dur || 0.3);
        if (c.hops) for (var i = 0; i < c.hops.length; i++) MV.bounce(L, T(c.hops[i]), 0.3, c.hop || 60);
        if (c.jolt) MV.jolt(L, T(c.jolt[0]), T(c.jolt[1]), 20, c.jolt[2] || 15);
        if (c.echo) { var e = MV.echo(L, col(c.echo.color || "#ffd400"), c.echo.offset); spanRange(e, L.inPoint, z); }
        return L;
    }

    function textOpts(x) {
        return {font: font(x.font), size: x.size || 120, fill: x.fill === null ? null : col(x.fill || "#ffffff"),
                stroke: col(x.stroke), strokeWidth: x.strokeWidth, pos: x.pos, tracking: x.tracking, name: x.name || x.text,
                x: x.x, top: x.top, gap: x.gap, colGap: x.colGap};
    }

    function buildLine(x, a, z) {
        var o = textOpts(x);
        var L = MV.text(comp, x.text, o);
        var vis = L;                       // the layer people see (the image when the text is a window onto it)
        spanRange(L, a, z);
        if (x.opacity !== undefined) MV.tr(L, "opacity").setValue(x.opacity);
        if (x.words) {
            var w = [];
            for (var i = 0; i < x.words.length; i++) w.push([x.words[i][0].replace(/^[ 　]+/, ""), T(x.words[i][1])]);
            MV.typeWords(L, w, {pop: x.popPct});
        }
        if (x.grow) MV.keys(MV.tr(L, "scale"), [[a, [x.grow[0], x.grow[0]]], [z, [x.grow[1], x.grow[1]]]], "linear");
        if (x.punch) MV.punch(L, T(x.punch.t), x.punch.big || 300, x.punch.dur || 0.15);
        if (x.open) MV.openText(L, T(x.open.t), x.open.from, x.open.to, x.open.dur);
        if (x.hop) MV.hop(L, T(x.hop.t), x.hop.dur, x.hop.h);
        if (x.turb) MV.turb(L, T(x.turb[0]), T(x.turb[1]), x.turb[2]);
        if (x.rough) MV.roughText(L);
        if (x.image) {
            var outline = null;
            if (x.image.outline) {
                outline = L.duplicate();
                outline.name = L.name + " outline";
                var td = outline.property("ADBE Text Properties").property("ADBE Text Document"), v = td.value;
                v.applyFill = false; v.applyStroke = true; v.strokeColor = col(x.image.outline); v.strokeWidth = x.image.outlineWidth || 4;
                td.setValue(v);
            }
            var r = MV.imageInText(comp, x.image.img, L, {extra: x.image.extra});
            spanRange(r.img, a, z);
            vis = r.img;
            if (x.image.strobe) MV.strobe(r.img, T(x.image.strobe[0]), T(x.image.strobe[1]), 2);
            if (x.image.kira !== undefined) MV.kira(r.img, T(x.image.kira), 5);
            if (x.image.jolt) MV.jolt(r.img, T(x.image.jolt[0]), T(x.image.jolt[1]), 24, x.image.jolt[2] || 20);
            if (outline && x.rgb) { var rs = MV.rgbSplit(outline, T(x.rgb[0]), T(x.rgb[1]), 14); }
        } else if (x.rgb) MV.rgbSplit(L, T(x.rgb[0]), T(x.rgb[1]), 14);
        if (x.strobe && !x.image) MV.strobe(L, T(x.strobe[0]), T(x.strobe[1]), 2);
        if (x.kira !== undefined && !x.image) MV.kira(L, T(x.kira), 5);
        return vis;
    }

    function buildChars(x, a, z) {
        var o = textOpts(x), chars;
        if (x.mode === "vchars") chars = MV.splitV(comp, x.text, o);
        else chars = MV.splitText(comp, x.text, o);
        MV.spanAll(chars, a, z);
        if (x.words) {
            var times = MV.charTimes(x.words);
            for (var i = 0; i < times.length; i++) times[i] = T(times[i]);
            MV.charsAt(chars, times, {pop: x.pop || 1.4, drop: x.drop, dur: x.popDur});
        }
        if (x.scatter) MV.scatterIn(chars, T(x.scatter.t), {dur: x.scatter.dur, dist: x.scatter.dist, order: x.scatter.order});
        if (x.crumble) MV.crumbleOut(chars, T(x.crumble.t), {dur: x.crumble.dur, spread: x.crumble.spread});
        if (x.hopAt) for (var h = 0; h < chars.length; h++) MV.bounce(chars[h], T(x.hopAt) + h * 0.05, 0.3, x.hopH || 40);
        return chars;
    }

    function buildFx(f, a, z) {
        if (f.flash !== undefined) return MV.flash(comp, T(f.flash), col(f.color || "#ffffff"), f.dur || 0.25, f.peak || 100);
        if (f.burst !== undefined) return MV.burst(comp, T(f.burst), cols(f.colors || ["#ffd400", "#ffffff"]),
                                                   {pos: f.pos, stroke: f.stroke !== false, strokeWidth: f.width || 24, dur: f.dur || 0.6});
        if (f.ring !== undefined) return MV.ring(comp, T(f.ring), f.pos, f.size || 360, col(f.color || "#ffffff"), f.dur || 0.8);
        if (f.frame !== undefined) {
            var fr = MV.frameIn(comp, T(f.frame), f.size, {pos: f.pos, color: col(f.color || "#ffffff"), width: f.width, dur: f.dur});
            spanRange(fr, T(f.frame), f.out !== undefined ? T(f.out) : z);
            return fr;
        }
        if (f.bars !== undefined) {
            var bs = MV.bars(comp, T(f.bars), f.band || 420, {dur: f.dur});
            MV.spanAll(bs, T(f.bars), f.out !== undefined ? T(f.out) : z);
            return bs;
        }
        if (f.black) { var bl = MV.solid(comp, [0, 0, 0], "black"); spanRange(bl, T(f.black[0]), T(f.black[1])); return bl; }
        throw new Error("unknown fx: " + mvJSON(f));
    }

    for (var s = 0; s < P.shots.length; s++) {
        var S = P.shots[s], a = T(S.t0), z = T(S.t1);
        MV._seed = 1000 + s * 7919;                 // stable random layout per shot
        if (S.bg) buildBg(S.bg, a, z);
        if (S.char) buildChar(S.char, a, z);
        // bars and frames sit under the lyrics; flashes, bursts, rings and black frames go on top of everything
        var under = function (f) { return f.bars !== undefined || f.frame !== undefined || f.under; };
        for (var u = 0; S.fx && u < S.fx.length; u++) if (under(S.fx[u])) buildFx(S.fx[u], a, z);
        for (var i = 0; S.texts && i < S.texts.length; i++) {
            var x = S.texts[i], xa = x.tIn !== undefined ? T(x.tIn) : a, xz = x.tOut !== undefined ? T(x.tOut) : z;
            if (x.mode === "chars" || x.mode === "vchars") buildChars(x, xa, xz);
            else buildLine(x, xa, xz);
        }
        for (i = 0; S.fx && i < S.fx.length; i++) if (!under(S.fx[i])) buildFx(S.fx[i], a, z);
        mvlog("shot " + (s + 1) + " " + S.t0 + "-" + S.t1 + " done, layers " + comp.numLayers);
    }

    if (P.finish) {
        if (P.finish.vignette) MV.vignette(comp, P.finish.vignette, P.finish.feather);
        if (P.finish.grade) MV.grade(comp, P.finish.grade);
    }

    var res = {fonts: fontLog, layers: comp.numLayers, stills: []};
    if (P.save) res.project = MV.save(out(P.save));
    for (i = 0; P.stills && i < P.stills.length; i++) {
        var st = P.stills[i], nm = "still_" + (i < 9 ? "0" : "") + (i + 1) + "_" + String(st).replace(".", "s") + ".png";
        res.stills.push(MV.still(comp, T(st), out(nm)));
    }
    if (P.render) {
        var r = MV.addRender(comp, out(comp.name + (P.render === "h264" ? ".mp4" : "")), P.render);
        res.render = {template: r.template, file: r.file};
        if (P.save) MV.save(out(P.save));
        var tr0 = new Date().getTime();
        app.project.renderQueue.render();
        res.render.secs = Math.round((new Date().getTime() - tr0) / 1000);
        res.render.status = String(r.item.status);
    }
    res.secs = Math.round((new Date().getTime() - t0run) / 1000);
    MVJOB.result = res;
})();
