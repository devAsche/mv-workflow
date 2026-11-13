// build_shots.jsx - build an MV section in After Effects from a shot list passed in the job's params.
// No lyrics or song data live in this file (the repository is public): everything comes from MVJOB.params.
//
// params = {
//   name: "MV_test", w: 1920, h: 1080, fps: 30, dur: 23.6,
//   offset: 53.6,                 // song time at comp time 0; every time below is song time
//   audio: "C:\\...\\song.wav",
//   fonts: {main: ["GenEiKoburiMin6-R", ...], latin: [...]},   // first installed one wins
//   type: {font: "main", hscale: 0.8, kana: 0.84, skew: 0, tracking: 0},   // defaults for every lyric (one typeface per song)
//   shots: [{t0, t1, bg: {...}, char: {...}, texts: [...], fx: [...]}, ...],
//   finish: {grade: {...}, vignette: 45},
//   stills: [song times], save: "name.aep", render: "h264" | "tiff" | null,
//   stillMode: "rq" (stills and qa frames through the render queue as TIFF, when saveFrameToPng does not write)
//              "queue" (stills, qa frames and the render are only queued, the project is saved and closed, and the runner's
//              ae_render job renders the whole queue with aerender; stills come out as name_NNNNN.tif, NNNNN = frame)
// }
// bg:    {img | solid, extra, move: [[t, scale%, [x, y]]...], ease, punch: {t, big, dur}, mono: {tint, amount}, keep, keepTol,
//         blur, dim, blinds: {t, dur, angle, width}, mosaic: {t, dur, from}, jolt: [t0, t1, amp], kira: t,
//         look: [[t, zoom%, [fx, fy] source px, [sx, sy] screen point]...]  (a camera on one detail: feet, umbrella, hands),
//         pivot: [x, y] source px (the anchor: move positions then place this point, rot turns around it),
//         rot: deg | [[t, deg]...], tilt: deg (same as a fixed rot), flip or mirror: true (左右反転 about the pivot),
//         negative, swap: [hi, mid, lo, keep%] (palette swap), hls: [hue, light, sat],
//         tile: {cols, rows, mirror, phase, slide: [px/s, px/s]}, mirror4, ripple: {c: [x, y], r, w, h, speed},
//         ground: colour (a solid under the picture), win: {shape: rect|ellipse|eye, size: [w, h], pos, fit, border, width}
//         (fit true: the whole picture sits small inside the window; false: the window looks onto the full-frame picture),
//         inside: {img: cut-out PNG, h, pos, rim} (the picture shows only inside the silhouette),
//         blend: "screen" | "add" | "multiply" | "overlay" | "soft_light" ... (a second picture laid over the first, in bgs),
//         opacity: % | [[t, %]...], blur: px | [[t, px]...] (a rack focus)}
// bgs:   [bg, ...] with tIn/tOut each, when one shot changes its background
// shot:  also cut: cut-out PNG the same pixel size as bg.img (built with the bg's own framing, moves and effects except blur,
//        so it sits exactly on the figure; lyrics with behind: true go between), cutDim: its dim (default the bg's), view: "face" | "eyes" | "hand" | "back" | "feet" | "item" |
//        "scene" | "type" ... (not drawn; tools/plan_check.py counts how many cuts show a face),
//        motion: ["rain", "drops", "hair", "parallax", ...] (not drawn: what moves inside the picture, besides the camera;
//        plan_check wants two or more per shot longer than a beat)
// char:  {img, h, pos, tIn, slam: {t, from, dur}, move: [[t, scale%]...], hops: [t...], hop: px, echo: {color, offset}, jolt: [t0, t1, amp]}
// texts: {text, font, size, pos, fill, stroke, strokeWidth, tIn, tOut,
//         mode: "line" | "chars" | "vchars",
//         line:   words: [[text, start, end]...] (reveal word by word; popPct makes each word grow in), punch: {t, big}, open: {t, from, to, dur}, hop: {t, dur, h},
//                 rgb: [t0, t1], strobe: [t0, t1], kira: t, turb: [t0, t1, amount], rough: true,
//                 image: {img, strobe: [t0, t1], kira: t, jolt: [t0, t1, amp], outline: color}, opacity, grow: [from%, to%]
//         chars:  words (each character appears at its time), pop, stretch, drop, smear: {dur, angle, len}, strobe: [t0, t1],
//                 scatter: {t, dur, dist}, crumble: {t, dur}, x/top (vchars)}
//         write:  handwritten (accent words): hand: key in params.hand (or the word itself: {chars: [{char, strokes, drips}], bbox,
//                 lines}), times: [song time each character starts], durs: [s] | dur, size: height of the word in px, width: pen px,
//                 drips, dripDur, lines: {t, dur, width, opacity, gap} (the title's hairlines), rough, taper, move: [[t, scale%, [x, y]]],
//                 fade: [t0, t1], accent: true (plan_check counts it)
//         staff:  lyric characters falling onto wires that ring and carry them left (a scrolling score): words: [[char, start]...],
//                 wires: [wire index per character], xs: [landing x per character], ys: [y per wire], slope, sag, flow (px/s), amp,
//                 dipW, ring, drops: [{t, wire, x, amp}] (drops without letters), wireColor, wireWidth, wireOpacity, lift, fall, bead
//         both:   hscale, vscale, kana, skew (shape of the type), slice: [{t, shift, frac, dur}], stretchAt: [t, k], behind: true
//                 (placed under the character cut-out), plate: "strip" | "box" | "scrim" | "halo" or {kind, color, opacity, pad, dur}
//                 (something under the letters so they read on any picture; type.plate sets it for every lyric), qa: false
// fx:    {flash: t, color, dur, peak} | {burst: t, colors, pos, stroke} | {ring: t, pos, size, color, dur} |
//        {frame: t, size, pos, color, width} | {bars: t, band, out, still} (still: no slam, for a letterbox kept across cuts) | {black: [t0, t1]} | {rule: t, pos, len, vertical, color, width, dur} |
//        {drops: t | [t...], pos: [x, y] | [[x, y]...], area: [x0, y0, x1, y1], rings, size, color, squash, dur} (raindrop rings) |
//        {box: t, pos, size: [w, h], color, opacity, dur, out, vertical, wipe} (a dark box under lyrics) |
//        bars also take to: band height and at: [t0, t1] (the band narrows) |
//        {rain: [t0, t1] | true, layer: "far" | "mid" | "near", speed, angle, sw, sh, contrast, brightness, blur, soft, color, opacity,
//         evolve, seed} (drawn rain; near rain goes over the lyrics, far and mid under) |
//        {light: [t0, t1], from: [x, y], to: [x, y], size: [w, h], angle, color, peak, blur, glow} (a light sliding past) |
//        {splash: t | [t...], pos: [x, y] | [[x, y]...], n, r0, r1, width, color, dur, dir, spread, squash} (drops bursting) |
//        {slide: t, from, to, size, color, dur, trail} (a drop running down) | {pole: [t0, t1], x: [from, to], w, color, blur, arm}
//        (a dark pole crossing in front of the picture)
//        (bars, frames, drops, boxes, rain, lights, splashes, slides, poles and any fx with under: true are placed below the
//        lyrics, with the bars over the rest of them; the others go above)
// top:   [fx...] built after every shot, over the whole piece (a rain layer that runs through every cut)
// hand:  {key: word} the handwritten words texts in mode "write" refer to (kept out of this public file)
// finish: {tone: {hi, mid, lo, mix}, unify: {keep, amount, tol, soft, hue, sat}, wash: {color, amount}, vignette, feather, grade: {...}}
// pass:  "plate" builds everything but the lyrics, for tools/motion_check.py to judge the pictures alone
// result.upscale lists picture layers scaled past 105% of their own pixels at any key (they look soft; v4 review)
// qa:    {contrast: true}: for every lyric at its settled time, a still with it, one without it and one of it alone on magenta
//        (qa_NNN_on/off/solo.png, qa.json); tools/qa_contrast.py measures how well each lyric stands out from what is around it

(function () {
    var P = MVJOB.params, OFF = P.offset || 0, t0run = new Date().getTime();
    function T(t) { return t - OFF; }
    function col(c) { return c === null || c === undefined ? c : (typeof c === "string" ? MV.hex(c) : c); }
    function cols(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(col(a[i])); return o; }
    function out(name) { return MVJOB.outdir + "\\" + name; }

    MV.newProject();
    if (P.stillMode) MV.STILL_MODE = P.stillMode;          // "rq": stills through the render queue (TIFF); "queue": for aerender
    var QUEUE = MV.STILL_MODE === "queue";
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
        var L, tA = b.tIn !== undefined ? T(b.tIn) : a, tZ = b.tOut !== undefined ? T(b.tOut) : z, win = b.win, cover = true;
        if (b.ground) spanRange(MV.solid(comp, col(b.ground), "ground"), tA, tZ);
        if (b.solid) L = MV.solid(comp, col(b.solid), "bg");
        else L = MV.layerFrom(comp, b.img, {fit: "cover", extra: b.extra || 1.12, name: "bg " + b.img.replace(/^.*[\\\/]/, "")});
        spanRange(L, tA, tZ);
        if (b.cutout) cover = false;                         // a cut-out figure: free size and place, not clamped to cover the frame
        if (win && win.fit !== false && !b.solid) {          // the whole picture, small, inside the window
            var kw = Math.max(win.size[0] / L.source.width, win.size[1] / L.source.height) * 100 * (b.extra || 1.04);
            MV.tr(L, "scale").setValue([kw, kw]);
            MV.tr(L, "position").setValue(win.pos || [W / 2, H / 2]);
            cover = false;
        }
        if (b.pivot) MV.tr(L, "anchor").setValue(b.pivot);
        var flipped = b.flip || b.mirror, about = MV.tr(L, "anchor").value;
        if (flipped) MV.flip(L, about);
        if (b.negative) MV.negative(L);
        if (b.swap) MV.tritone(L, col(b.swap[0]), col(b.swap[1]), col(b.swap[2]), b.swap[3] || 0);
        if (b.mono) MV.mono(L, col(b.mono.tint), b.mono.amount);
        if (b.keep) MV.keepColor(L, col(b.keep), b.keepTol);
        if (b.hls) MV.hls(L, b.hls);
        if (b.blur instanceof Array) {
            var be = MV.blurFx(L, 0), bk = [];
            for (var bi = 0; bi < b.blur.length; bi++) bk.push([T(b.blur[bi][0]), b.blur[bi][1]]);
            MV.keys(MV.findProp(be, "ADBE Gaussian Blur 2-0001"), bk, "inout");
        } else if (b.blur) MV.blurFx(L, b.blur);
        if (b.dim) MV.dim(L, b.dim);
        if (b.tile) MV.tile(L, b.tile.cols, b.tile.rows, b.tile);
        if (b.mirror4) MV.mirror4(L);
        if (b.ripple) MV.ripple(L, b.ripple);
        var base = MV.tr(L, "scale").value[0];
        if (b.move) {
            var m = [];
            for (var i = 0; i < b.move.length; i++) m.push([T(b.move[i][0]), base * b.move[i][1] / 100, b.move[i][2] || null]);
            MV.move(L, m, b.ease || "inout");
        }
        if (b.look) {                                         // a camera on one detail of the picture
            var lm = [], sw = L.source.width, shh = L.source.height;
            for (var j = 0; j < b.look.length; j++) {
                var lk = b.look[j], f = lk[2] ? [flipped ? 2 * about[0] - lk[2][0] : lk[2][0], lk[2][1]] : [sw / 2, shh / 2], kk = base * lk[1] / 100;
                lm.push([T(lk[0]), kk, MV.focusPos(L, kk, f, lk[3] || (cover ? null : ((win && win.pos) || [W / 2, H / 2])), !cover)]);
            }
            MV.move(L, lm, b.ease || "inout");
        }
        var rot = b.rot !== undefined ? b.rot : b.tilt;
        if (rot !== undefined) {
            if (typeof rot === "number") MV.tr(L, "rotation").setValue(rot);
            else { var rk = []; for (var ri = 0; ri < rot.length; ri++) rk.push([T(rot[ri][0]), rot[ri][1]]); MV.keys(MV.tr(L, "rotation"), rk, b.ease || "inout"); }
        }
        if (b.drift) {                                        // an extra sideways/vertical move added on top of look (figure layers)
            var dk = [];
            for (var di = 0; di < b.drift.length; di++) dk.push("[" + T(b.drift[di][0]) + "," + b.drift[di][1] + "," + b.drift[di][2] + "]");
            MV.expr(MV.tr(L, "position"), "var k=[" + dk.join(",") + "], o=[k[0][1],k[0][2]];" +
                "for (var i=0;i<k.length-1;i++) if (time>=k[i][0] && time<k[i+1][0]) " +
                "o=[ease(time,k[i][0],k[i+1][0],k[i][1],k[i+1][1]), ease(time,k[i][0],k[i+1][0],k[i][2],k[i+1][2])];" +
                "if (time>=k[k.length-1][0]) o=[k[k.length-1][1],k[k.length-1][2]]; value + o;");
        }
        if (b.fill) MV.silhouette(L, col(b.fill));
        if (b.smear) MV.smear(L, T(b.smear.t), b.smear.dur, b.smear.angle, b.smear.len);
        if (b.trail) {                                        // copies that follow the layer's own move a little late
            for (var tq = 1; tq <= (b.trail.n || 3); tq++) {
                var tc = L.duplicate();
                tc.moveAfter(L);
                tc.name = L.name + " trail " + tq;
                var lag = (b.trail.lag || 0.06) * tq;
                MV.expr(MV.tr(tc, "position"), "valueAtTime(time - " + lag + ")");
                MV.expr(MV.tr(tc, "scale"), "valueAtTime(time - " + lag + ")");
                MV.expr(MV.tr(tc, "rotation"), "valueAtTime(time - " + lag + ")");
                MV.tr(tc, "opacity").setValue((b.trail.opacity || 40) * Math.pow(0.6, tq - 1));
                if (b.trail.color) MV.silhouette(tc, col(b.trail.color));
            }
        }
        if (b.ghosts) {                                       // filled copies, each a step larger (outline clones of a figure)
            for (var gq = 1; gq <= (b.ghosts.n || 3); gq++) {
                var gc = L.duplicate();
                gc.moveAfter(L);
                gc.name = L.name + " ghost " + gq;
                MV.silhouette(gc, col(b.ghosts.color || "#e8ebf5"));
                MV.expr(MV.tr(gc, "scale"), "value * " + (1 + (b.ghosts.step || 0.04) * gq));
                MV.tr(gc, "opacity").setValue((b.ghosts.opacity || 18) * Math.pow(0.7, gq - 1));
                if (b.ghosts.t !== undefined) MV.keys(MV.tr(gc, "opacity"), [[T(b.ghosts.t), 0], [T(b.ghosts.t) + 0.1, (b.ghosts.opacity || 18) * Math.pow(0.7, gq - 1)],
                                                                         [T(b.ghosts.t) + (b.ghosts.dur || 0.8), 0]], "out");
            }
        }
        if (b.strobe) MV.strobe(L, T(b.strobe[0]), T(b.strobe[1]), b.strobe[2] || 2);
        if (b.punch) MV.punch(L, T(b.punch.t), b.punch.big || 160, b.punch.dur || 0.3);
        if (b.blinds) MV.blindsIn(L, T(b.blinds.t), b.blinds.dur, b.blinds.angle, b.blinds.width);
        if (b.mosaic) MV.mosaicIn(L, T(b.mosaic.t), b.mosaic.dur, b.mosaic.from);
        if (b.jolt) MV.jolt(L, T(b.jolt[0]), T(b.jolt[1]), 24, b.jolt[2] || 20);
        if (b.kira !== undefined) MV.kira(L, T(b.kira), 5);
        if (b.blend) MV.blendMode(L, b.blend);
        if (b.opacity instanceof Array) {
            var ok = [];
            for (var oi = 0; oi < b.opacity.length; oi++) ok.push([T(b.opacity[oi][0]), b.opacity[oi][1]]);
            MV.keys(MV.tr(L, "opacity"), ok, "inout");
        } else if (b.opacity !== undefined) MV.tr(L, "opacity").setValue(b.opacity);
        if (win) {
            var wo = MV.windowOn(comp, L, win.shape || "rect", win.size, win.pos || [W / 2, H / 2], {border: col(win.border), width: win.width});
            if (win.open) {                                   // the window grows from win.open.from (% of its size) = an iris / slit reveal
                var wf = win.open.from || [0, 100], wt = T(win.open.t !== undefined ? win.open.t : tA), wd = win.open.dur || 0.6;
                var wk = [[wt, wf], [wt + wd, [100, 100]]];
                if (win.open.close !== undefined) wk.push([T(win.open.close), [100, 100]], [T(win.open.close) + (win.open.cdur || 0.4), wf]);
                MV.keys(MV.tr(wo.matte, "scale"), wk, win.open.ease || "out");
                if (wo.border) MV.keys(MV.tr(wo.border, "scale"), wk, win.open.ease || "out");
            }
        }
        if (b.inside) MV.insideOf(comp, L, b.inside.img, {h: b.inside.h, pos: b.inside.pos, rim: col(b.inside.rim)});
        return L;
    }

    // the figure cut out of the bg (same pixel size), framed and moved exactly like the bg; no blur, its own dim
    function buildCut(bg, path, dimV, a, z) {
        var cb = {};
        for (var ck in bg) if (bg.hasOwnProperty(ck)) cb[ck] = bg[ck];
        cb.img = path; cb.solid = undefined; cb.blur = undefined; cb.ground = undefined; cb.blend = undefined; cb.opacity = undefined;
        cb.dim = dimV !== undefined ? dimV : bg.dim;
        var c = buildBg(cb, a, z);
        c.name = "cut " + path.replace(/^.*[\\\/]/, "");
        return c;
    }

    function buildChar(c, a, z) {
        var L = MV.layerFrom(comp, c.img, {fit: "height", h: c.h || 0.92, pos: c.pos || [W * 0.68, H * 0.55], name: "char"});
        spanRange(L, c.tIn !== undefined ? T(c.tIn) : a, z);
        if (c.slam) MV.slam(L, T(c.slam.t), c.slam.from || "right", c.slam.dur || 0.3);
        if (c.move) {
            var base = MV.tr(L, "scale").value[0], m = [];
            for (var j = 0; j < c.move.length; j++) m.push([T(c.move[j][0]), [base * c.move[j][1] / 100, base * c.move[j][1] / 100]]);
            MV.keys(MV.tr(L, "scale"), m, c.ease || "inout");
        }
        if (c.hops) for (var i = 0; i < c.hops.length; i++) MV.bounce(L, T(c.hops[i]), 0.3, c.hop || 60);
        if (c.jolt) MV.jolt(L, T(c.jolt[0]), T(c.jolt[1]), 20, c.jolt[2] || 15);
        if (c.echo) { var e = MV.echo(L, col(c.echo.color || "#ffd400"), c.echo.offset); spanRange(e, L.inPoint, z); }
        return L;
    }

    var TY = P.type || {};
    function pick(x, k, dflt) { return x[k] !== undefined ? x[k] : (TY[k] !== undefined ? TY[k] : dflt); }
    function textOpts(x) {
        return {font: font(pick(x, "font", null)), size: x.size || 120, fill: x.fill === null ? null : col(x.fill || "#ffffff"),
                stroke: col(x.stroke), strokeWidth: x.strokeWidth, pos: x.pos, tracking: pick(x, "tracking", 0), name: x.name || x.text,
                hscale: pick(x, "hscale", 1), vscale: x.vscale, kana: pick(x, "kana", 1), skew: pick(x, "skew", 0),
                x: x.x, top: x.top, gap: x.gap, colGap: x.colGap};
    }
    function slices(list, x) {          // one slice per lyric (a second mask would add to the first); returns the lower halves
        var extra = [];
        if (!x.slice || !x.slice.length) return extra;
        var sl = x.slice[0];
        for (var r = 0; r < list.length; r++) extra.push(MV.slice(list[r], T(sl.t), {shift: sl.shift, frac: sl.frac, dur: sl.dur})[1]);
        return extra;
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
        if (x.stretchAt) MV.stretch(L, T(x.stretchAt[0]), x.stretchAt[1], x.stretchAt[2]);
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
        slices([L], x);
        return {vis: vis, text: L};
    }

    function buildChars(x, a, z) {
        var o = textOpts(x), chars;
        if (x.mode === "vchars") chars = MV.splitV(comp, x.text, o);
        else chars = MV.splitText(comp, x.text, o);
        MV.spanAll(chars, a, z);
        if (x.words) {
            var times = MV.charTimes(x.words);
            for (var i = 0; i < times.length; i++) times[i] = T(times[i]);
            MV.charsAt(chars, times, {pop: x.pop || 1.4, stretch: x.stretch, drop: x.drop, dur: x.popDur, from: a, until: z});
            if (x.smear) for (var m = 0; m < chars.length; m++)
                MV.smear(chars[m], times[Math.min(m, times.length - 1)], x.smear.dur, x.smear.angle, x.smear.len);
        }
        if (x.strobe) for (var sb = 0; sb < chars.length; sb++) MV.strobe(chars[sb], T(x.strobe[0]), T(x.strobe[1]), 2);
        chars = chars.concat(slices(chars, x));
        if (x.scatter) MV.scatterIn(chars, T(x.scatter.t), {dur: x.scatter.dur, dist: x.scatter.dist, order: x.scatter.order});
        if (x.crumble) MV.crumbleOut(chars, T(x.crumble.t), {dur: x.crumble.dur, spread: x.crumble.spread});
        if (x.hopAt) for (var h = 0; h < chars.length; h++) MV.bounce(chars[h], T(x.hopAt) + h * 0.05, 0.3, x.hopH || 40);
        return chars;
    }

    // handwritten word (accent): strokes from params.hand, written at the given song times
    function buildWrite(x, a, z) {
        var word = typeof x.hand === "string" ? (P.hand || {})[x.hand] : x.hand;
        if (!word) throw new Error("no handwritten word: " + x.hand);
        var times = [], i;
        for (i = 0; x.times && i < x.times.length; i++) times.push(T(x.times[i]));
        if (!times.length) times.push(a);
        var r = MV.write(comp, word, {pos: x.pos, h: x.size || 300, width: x.width, color: col(x.fill || "#ffffff"), times: times,
                                      durs: x.durs, dur: x.dur, drips: x.drips, dripDur: x.dripDur, rough: x.rough, ease: x.ease,
                                      taper: x.taper, corner: x.corner, name: x.name || x.text,
                                      lines: x.lines ? {t: T(x.lines.t), dur: x.lines.dur, width: x.lines.width, opacity: x.lines.opacity, gap: x.lines.gap} : null});
        var L = r.layer;
        L.outPoint = z;
        if (L.inPoint < a) MV.setIn(L, a);
        if (x.opacity !== undefined) MV.tr(L, "opacity").setValue(x.opacity);
        if (x.move) {
            var base = MV.tr(L, "scale").value[0], m = [];
            for (i = 0; i < x.move.length; i++) m.push([T(x.move[i][0]), base * x.move[i][1] / 100, x.move[i][2] || null]);
            MV.move(L, m, x.ease === "out" ? "out" : "inout");
        }
        if (x.fade) MV.keys(MV.tr(L, "opacity"), [[T(x.fade[0]), x.opacity === undefined ? 100 : x.opacity], [T(x.fade[1]), 0]], "inout");
        return {layer: L, end: r.end};
    }

    // characters that fall onto wires and ride them left
    function buildStaff(x, a, z) {
        var notes = [], drops = [], i;
        for (i = 0; i < x.words.length; i++) {
            var c = x.words[i][0].replace(/[ 　]/g, "");
            if (!c) continue;
            notes.push({t: T(x.words[i][1]), wire: x.wires[Math.min(i, x.wires.length - 1)], x: x.xs[Math.min(i, x.xs.length - 1)], text: c, amp: x.amp});
        }
        for (i = 0; x.drops && i < x.drops.length; i++)
            drops.push({t: T(x.drops[i].t), wire: x.drops[i].wire, x: x.drops[i].x, amp: x.drops[i].amp});
        return MV.staff(comp, {ys: x.ys, slope: x.slope, sag: x.sag, flow: x.flow, dipW: x.dipW, ring: x.ring, amp: x.amp,
                               color: col(x.wireColor), width: x.wireWidth, opacity: x.wireOpacity, notes: notes, drops: drops,
                               font: font(pick(x, "font", null)), size: x.size || 56, fill: col(x.fill || "#ffffff"), hscale: pick(x, "hscale", 1),
                               lift: x.lift, fall: x.fall, fallDur: x.fallDur, bead: x.bead, tIn: a, tOut: z});
    }

    // a time when a lyric has fully appeared and has not started to leave (plate sizes and the contrast check use it)
    function settle(x, xa, xz) {
        var fd = comp.frameDuration, t = xa + Math.min(0.6, (xz - xa) * 0.5);
        if (x.words && x.words.length) {
            var last = x.words[x.words.length - 1], e = last.length > 2 ? last[2] : last[1];
            t = T(Math.min(e, last[1] + 0.6)) + 0.25;
        }
        if (x.scatter) t = Math.max(t, T(x.scatter.t) + (x.scatter.dur || 0.4) + 0.035 * x.text.length + 0.05);
        if (x.crumble) t = Math.min(t, T(x.crumble.t) - 2 * fd);
        if (x.slice && x.slice.length) {
            var s0 = T(x.slice[0].t), s1 = s0 + (x.slice[0].dur || 0.25);
            if (t > s0 - 2 * fd && t < s1 + 2 * fd) t = s1 + 2 * fd;
        }
        return Math.max(xa + fd, Math.min(t, xz - 2 * fd));
    }

    // vertical lyrics: one group of letters per column (for one strip per column)
    function columns(chars, t, size) {
        var groups = [], xs = [];
        for (var i = 0; i < chars.length; i++) {
            var px = MV.tr(chars[i], "position").valueAtTime(t, false)[0], k = -1;
            for (var j = 0; j < xs.length; j++) if (Math.abs(xs[j] - px) < size * 0.6) { k = j; break; }
            if (k < 0) { xs.push(px); groups.push([]); k = groups.length - 1; }
            groups[k].push(chars[i]);
        }
        return groups;
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
            var bs;
            if (f.still) {                          // already in place (the letterbox carried on from the shot before)
                // tall enough to still reach the frame edge when the band later narrows (to)
                var bh = (H - (f.band || 420)) / 2, bc = col(f.color || "#000000");
                var bt = (H - Math.min(f.band || 420, f.to === undefined ? 1e9 : f.to)) / 2 + 4;
                bs = [MV.shape(comp, "rect", [W * 1.2, bt], {fill: bc, pos: [W / 2, bh - bt / 2], name: "bar top"}),
                      MV.shape(comp, "rect", [W * 1.2, bt], {fill: bc, pos: [W / 2, H - bh + bt / 2], name: "bar bottom"})];
            } else bs = MV.bars(comp, T(f.bars), f.band || 420, {dur: f.dur, minBand: f.to});
            if (f.to !== undefined) {                 // the band narrows (or opens) between at[0] and at[1]
                var at = f.at || [f.bars + 0.4, f.bars + 1.6], dd = ((f.band || 420) - f.to) / 2;
                for (var bk2 = 0; bk2 < 2; bk2++) {
                    var bp = MV.tr(bs[bk2], "position"), bv = bp.valueAtTime(T(at[0]), false);
                    MV.keys(bp, [[T(at[0]), bv], [T(at[1]), [bv[0], bv[1] + (bk2 ? -dd : dd)]]], "inout");
                }
            }
            MV.spanAll(bs, T(f.bars), f.out !== undefined ? T(f.out) : z);
            return bs;
        }
        if (f.drops !== undefined) {
            var dts = f.drops instanceof Array ? f.drops : [f.drops], rr = [], ar = f.area || [W * 0.12, H * 0.55, W * 0.88, H * 0.95];
            for (var d = 0; d < dts.length; d++) {
                var dp = f.pos ? (f.pos[0] instanceof Array ? f.pos[d % f.pos.length] : f.pos) : [MV.rand(ar[0], ar[2]), MV.rand(ar[1], ar[3])];
                rr = rr.concat(MV.drop(comp, T(dts[d]), dp, {rings: f.rings, size: f.size, color: col(f.color), squash: f.squash, dur: f.dur,
                                                            width: f.width, gap: f.gap, peak: f.peak}));
            }
            return rr;
        }
        if (f.box !== undefined) {
            var bx = MV.box(comp, T(f.box), f.pos, f.size, {color: col(f.color || "#0b1220"), opacity: f.opacity, dur: f.dur,
                                                             vertical: f.vertical, wipe: f.wipe});
            spanRange(bx, T(f.box), f.out !== undefined ? T(f.out) : z);
            return bx;
        }
        if (f.black) { var bl = MV.solid(comp, [0, 0, 0], "black"); spanRange(bl, T(f.black[0]), T(f.black[1])); return bl; }
        if (f.rain !== undefined) {
            var rl = MV.rain(comp, {layer: f.layer, speed: f.speed, angle: f.angle, sw: f.sw, sh: f.sh, contrast: f.contrast,
                                    brightness: f.brightness, blur: f.blur, blurDir: f.blurDir, soft: f.soft, color: col(f.color),
                                    opacity: f.opacity, evolve: f.evolve, seed: f.seed, cover: f.cover});
            spanRange(rl, f.rain instanceof Array ? T(f.rain[0]) : a, f.rain instanceof Array ? T(f.rain[1]) : z);
            if (f.fade) MV.keys(MV.tr(rl, "opacity"), [[T(f.fade[0]), f.fade[2] === undefined ? 0 : f.fade[2]], [T(f.fade[1]), f.fade[3] === undefined ? MV.tr(rl, "opacity").value : f.fade[3]]], "inout");
            return rl;
        }
        if (f.light !== undefined) return MV.lightSweep(comp, T(f.light[0]), T(f.light[1]), f.from, f.to,
                                                        {size: f.size, angle: f.angle, color: col(f.color), peak: f.peak, blur: f.blur, glow: f.glow, ease: f.ease});
        if (f.splash !== undefined) {
            var sts = f.splash instanceof Array ? f.splash : [f.splash], sp = [];
            for (var si = 0; si < sts.length; si++) {
                var spos = f.pos ? (f.pos[0] instanceof Array ? f.pos[si % f.pos.length] : f.pos) : [W / 2, H / 2];
                sp.push(MV.splash(comp, T(sts[si]), spos, {n: f.n, r0: f.r0, r1: f.r1, width: f.width, color: col(f.color), dur: f.dur,
                                                            dir: f.dir, spread: f.spread, squash: f.squash, opacity: f.opacity}));
            }
            return sp;
        }
        if (f.slide !== undefined) return MV.slideDrop(comp, T(f.slide), f.from, f.to, {size: f.size, color: col(f.color), dur: f.dur, trail: f.trail});
        if (f.pole !== undefined) return MV.pole(comp, T(f.pole[0]), T(f.pole[1]), {x: f.x, w: f.w, color: col(f.color), blur: f.blur, arm: f.arm, ease: f.ease});
        if (f.rule !== undefined) {
            var ru = MV.rule(comp, T(f.rule), f.pos, f.len || 400, f.vertical, col(f.color || "#ffd400"), f.width, f.dur);
            spanRange(ru, T(f.rule), f.out !== undefined ? T(f.out) : z);
            return ru;
        }
        throw new Error("unknown fx: " + mvJSON(f));
    }

    var QA = [];
    for (var s = 0; s < P.shots.length; s++) {
        var S = P.shots[s], a = T(S.t0), z = T(S.t1);
        MV._seed = 1000 + s * 7919;                 // stable random layout per shot
        if (S.bg) buildBg(S.bg, a, z);
        for (var g = 0; S.bgs && g < S.bgs.length; g++) buildBg(S.bgs[g], a, z);
        var charL = S.char ? buildChar(S.char, a, z) : null;
        var cutL = S.cut && S.bg ? buildCut(S.bg, S.cut, S.cutDim, a, z) : null, fg = cutL || charL;
        // bars, frames, drops and boxes sit under the lyrics; flashes, bursts, rings and black frames go on top of everything
        var under = function (f) {
            if (f.over) return false;
            return f.bars !== undefined || f.frame !== undefined || f.drops !== undefined || f.box !== undefined || f.light !== undefined ||
                   f.splash !== undefined || f.slide !== undefined || f.rain !== undefined || f.pole !== undefined || f.under;
        };
        // bars last of these, so rain, light and the pole stay inside the picture and the letterbox stays clean for the lyrics
        for (var u = 0; S.fx && u < S.fx.length; u++) if (under(S.fx[u]) && S.fx[u].bars === undefined) buildFx(S.fx[u], a, z);
        for (u = 0; S.fx && u < S.fx.length; u++) if (under(S.fx[u]) && S.fx[u].bars !== undefined) buildFx(S.fx[u], a, z);
        for (var i = 0; S.texts && P.pass !== "plate" && i < S.texts.length; i++) {
            var x = S.texts[i], xa = x.tIn !== undefined ? T(x.tIn) : a, xz = x.tOut !== undefined ? T(x.tOut) : z;
            var before = comp.numLayers, groups, imageText = false, ts = settle(x, xa, xz), qaOnly = null;
            if (x.mode === "write") {
                var wr = buildWrite(x, xa, xz);
                groups = [[wr.layer]];
                ts = Math.max(xa + comp.frameDuration, Math.min(wr.end + 0.1, xz - 2 * comp.frameDuration));
            } else if (x.mode === "staff") {
                var sf = buildStaff(x, xa, xz);
                groups = [sf.notes];
                qaOnly = sf.notes.concat(sf.beads);
                ts = Math.max(xa + comp.frameDuration, Math.min(T(x.words[x.words.length - 1][1]) + 0.4, xz - 2 * comp.frameDuration));
            } else if (x.mode === "chars" || x.mode === "vchars") {
                var chs = buildChars(x, xa, xz);
                groups = x.mode === "vchars" ? columns(chs, ts, x.size || 90) : [chs];
            } else {
                var bl = buildLine(x, xa, xz);
                groups = [[bl.text]];
                imageText = bl.vis !== bl.text;
            }
            var made = [], n = comp.numLayers - before;          // new layers sit at the top (index 1..n)
            for (var q = 1; q <= n; q++) made.push(comp.layer(q));
            if (x.behind && fg) for (q = 0; q < made.length; q++) made[q].moveAfter(q ? made[q - 1] : fg);
            var pl = pick(x, "plate", null);
            if (pl && typeof pl === "string") pl = {kind: pl};
            if (pl && !(pl.kind === "halo" && imageText))
                MV.plate(comp, groups, ts, {kind: pl.kind, color: col(pl.color), opacity: pl.opacity, pad: pl.pad, dur: pl.dur, soft: pl.soft,
                                            wipe: pl.wipe, size: x.size || 120});
            if (P.qa && x.qa !== false) {
                var shown = [], cand = qaOnly || made;
                for (q = 0; q < cand.length; q++) if (cand[q].enabled) shown.push(cand[q]);
                QA.push({layers: shown, t: ts, shot: s + 1, text: i + 1, label: x.name || x.text, plate: pl ? pl.kind : null,
                         size: x.size || 120, mode: x.mode || "line", fill: imageText ? null : (x.fill === undefined ? "#ffffff" : x.fill), accent: !!x.accent,
                         stroke: x.stroke || null});
            }
        }
        for (i = 0; S.fx && i < S.fx.length; i++) if (!under(S.fx[i])) buildFx(S.fx[i], a, z);
        mvlog("shot " + (s + 1) + " " + S.t0 + "-" + S.t1 + " done, layers " + comp.numLayers);
    }

    MV._seed = 99991;
    for (var tp = 0; P.top && tp < P.top.length; tp++) buildFx(P.top[tp], 0, comp.duration);

    // pictures blown up past their own pixels look soft (v4 review: 225-300% on a 2016 px picture)
    var UP = [];
    for (var ui = 1; ui <= comp.numLayers; ui++) {
        var UL = comp.layer(ui), src = null;
        try { src = UL.source; if (!(src instanceof FootageItem) || !(src.mainSource instanceof FileSource) || !src.mainSource.isStill) continue; }
        catch (er) { continue; }
        var sp = UL.transform.scale, mx = Math.abs(sp.value[0]), mt = null;
        for (var k = 1; k <= sp.numKeys; k++) { var kv = Math.abs(sp.keyValue(k)[0]); if (kv > mx) { mx = kv; mt = sp.keyTime(k); } }
        if (mx > 105) UP.push({layer: UL.name, scale: Math.round(mx), at: mt === null ? null : Math.round((mt + OFF) * 100) / 100,
                               px: src.width + "x" + src.height});
    }
    if (UP.length) mvlog("pictures scaled past their pixels: " + UP.length);

    if (P.finish) {
        var F = P.finish;
        if (F.tone) MV.tone(comp, {hi: col(F.tone.hi), mid: col(F.tone.mid), lo: col(F.tone.lo), mix: F.tone.mix});
        if (F.unify) MV.unify(comp, {keep: col(F.unify.keep), amount: F.unify.amount, tol: F.unify.tol, soft: F.unify.soft,
                                     hue: F.unify.hue, sat: F.unify.sat});
        if (F.wash) MV.wash(comp, col(F.wash.color), F.wash.amount);
        if (F.vignette) MV.vignette(comp, F.vignette, F.feather);
        if (F.grade) MV.grade(comp, F.grade);
    }

    var res = {fonts: fontLog, layers: comp.numLayers, stills: [], upscale: UP};
    if (P.save) res.project = MV.save(out(P.save));
    for (i = 0; P.stills && i < P.stills.length; i++) {
        var st = P.stills[i], nm = "still_" + (i < 9 ? "0" : "") + (i + 1) + "_" + String(st).replace(".", "s") + ".png";
        res.stills.push(MV.still(comp, T(st), out(nm)));
    }
    if (P.qa && QA.length) {          // contrast check: each lyric with and without its own layers, at its settled time
        var qj = [];
        for (i = 0; i < QA.length; i++) {
            var e = QA[i], id = ("00" + (i + 1)).slice(-3);
            MV.still(comp, e.t, out("qa_" + id + "_on.png"));
            if (QUEUE) {
                // switching layers off does not reach a render that runs later, so the solo still gets its own comp:
                // copies of this lyric's layers (bottom first, so the stacking stays) over a magenta key. No off still;
                // qa_contrast.py works from on + solo.
                var qc = MV.comp("MV_qa_" + id, W, H, comp.duration, 1 / comp.frameDuration, [0, 0, 0]);
                for (q = e.layers.length - 1; q >= 0; q--) e.layers[q].copyToComp(qc);
                MV.solid(qc, [1, 0, 1], "qa key").moveToEnd();
                MV.still(qc, e.t, out("qa_" + id + "_solo.png"));
                qj.push({id: id, shot: e.shot, text: e.text, label: e.label, t: Math.round((e.t + OFF) * 100) / 100, plate: e.plate,
                         size: e.size, mode: e.mode, fill: e.fill, stroke: e.stroke});
                continue;
            }
            for (q = 0; q < e.layers.length; q++) e.layers[q].enabled = false;
            MV.still(comp, e.t, out("qa_" + id + "_off.png"));
            // solo: only this lyric over a magenta key, so the check knows every letter, including ones a picture hides
            var was = [];
            for (var li = 1; li <= comp.numLayers; li++) { var LL = comp.layer(li); was.push(LL.enabled); try { LL.enabled = false; } catch (er) {} }
            for (q = 0; q < e.layers.length; q++) e.layers[q].enabled = true;
            var key = MV.solid(comp, [1, 0, 1], "qa key");
            key.moveToEnd();
            MV.still(comp, e.t, out("qa_" + id + "_solo.png"));
            key.remove();
            for (li = 1; li <= comp.numLayers; li++) { try { comp.layer(li).enabled = was[li - 1]; } catch (er) {} }
            qj.push({id: id, shot: e.shot, text: e.text, label: e.label, t: Math.round((e.t + OFF) * 100) / 100, plate: e.plate,
                     size: e.size, mode: e.mode, fill: e.fill, stroke: e.stroke});
        }
        var qf = new File(out("qa.json"));
        qf.encoding = "UTF-8"; qf.open("w"); qf.write(mvJSON({w: W, h: H, items: qj})); qf.close();
        res.qa = qj.length;
        if (P.save) MV.save(out(P.save));       // the switching above leaves the project marked as changed
    }
    if (P.render) {
        var r = MV.addRender(comp, out(comp.name + (P.render === "h264" ? ".mp4" : "")), P.render);
        res.render = {template: r.template, file: r.file};
        if (P.save) MV.save(out(P.save));
    }
    if (QUEUE) {                  // everything is queued: save, close (frees AE's memory before aerender opens the file)
        if (!P.save) throw new Error("stillMode queue needs params.save (aerender renders the saved project)");
        res.project = MV.save(out(P.save));
        res.queued = app.project.renderQueue.numItems;
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } else if (P.render) {
        var tr0 = new Date().getTime();
        app.project.renderQueue.render();
        res.render.secs = Math.round((new Date().getTime() - tr0) / 1000);
        res.render.status = String(r.item.status);
    }
    res.secs = Math.round((new Date().getTime() - t0run) / 1000);
    MVJOB.result = res;
})();
