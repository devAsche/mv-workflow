// mvae.jsx - reusable parts for building MV compositions in After Effects (ExtendScript / ES3).
// Loaded by the runner's ae_script job before the build script. Everything lives in the MV object.
// Effects and properties are addressed by matchName, so the Japanese UI does not matter.

var MV = MV || {};

// ---------------------------------------------------------------- project
// Items the scripts themselves create: comps named "MV_…" (or "MVテスト…", or the first probe's "probe"),
// plus solids and folders. Anything else in an unsaved project counts as the user's work.
MV._isOwnItem = function (it) {
    if (it.name.indexOf("MV_") === 0 || it.name.indexOf("MVテスト") === 0 || it.name === "probe") return true;
    if (it instanceof FolderItem) return true;
    if (!(it instanceof FootageItem)) return false;
    if (it.mainSource instanceof SolidSource) return true;
    return !!(it.file && /[\\\/]autopilot[\\\/]/i.test(it.file.fsName));
};

MV.newProject = function () {
    // Never throw away the user's work: refuse when the open project has unsaved changes, unless everything in
    // it was made by these scripts (see MV._isOwnItem, or a project the scripts saved under outbox).
    var p = app.project;
    if (p && p.dirty && p.numItems > 0) {
        var ours = p.file && /[\\\/]autopilot[\\\/]outbox[\\\/]/i.test(p.file.fsName);
        if (!ours) {
            ours = true;
            for (var i = 1; i <= p.numItems; i++) if (!MV._isOwnItem(p.item(i))) { ours = false; break; }
        }
        if (!ours) throw new Error("After Effects has an unsaved project open; save or close it first");
        if (p.file) {          // one of ours, but someone may have edited it: keep those edits in a copy next to it
            var d = new Date(), stamp = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + "-" + d.getHours() * 10000 + d.getMinutes() * 100 + d.getSeconds();
            try { p.save(new File(p.file.fsName.replace(/\.aep$/i, "") + "_edited_" + stamp + ".aep")); } catch (e) {}
        }
        p.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    }
    app.newProject();
    return app.project;
};

MV.save = function (path) {
    var f = new File(path);
    if (!f.parent.exists) f.parent.create();
    app.project.save(f);
    return f.fsName;
};

MV._footage = {};
MV.importFile = function (path, asSequence) {
    if (MV._footage[path]) return MV._footage[path];
    var io = new ImportOptions(new File(path));
    if (asSequence) io.sequence = true;
    var item = app.project.importFile(io);
    MV._footage[path] = item;
    return item;
};

MV.comp = function (name, w, h, dur, fps, bg) {
    var c = app.project.items.addComp(name, w || 1920, h || 1080, 1, dur || 10, fps || 30);
    if (bg) c.bgColor = bg;
    return c;
};

MV.hex = function (s) {        // "#ffcc00" -> [1, 0.8, 0]
    s = s.replace("#", "");
    return [parseInt(s.substr(0, 2), 16) / 255, parseInt(s.substr(2, 2), 16) / 255, parseInt(s.substr(4, 2), 16) / 255];
};

MV.solid = function (comp, color, name, w, h) {
    return comp.layers.addSolid(color || [0, 0, 0], name || "solid", w || comp.width, h || comp.height, 1, comp.duration);
};

MV.span = function (layer, tIn, tOut) {   // show a layer only from tIn to tOut (seconds)
    layer.startTime = 0;
    layer.inPoint = Math.max(0, tIn);
    layer.outPoint = tOut;
    return layer;
};

// ---------------------------------------------------------------- fonts and text
MV.fontPS = function (family, style) {
    // PostScript name for a family/style, when AE's font API is there (AE 2024+). Falls back to the input.
    try {
        if (app.fonts && app.fonts.getFontsByFamilyNameAndStyleName) {
            var f = app.fonts.getFontsByFamilyNameAndStyleName(family, style || "Regular");
            if (f && f.length) return f[0].postScriptName;
        }
    } catch (e) {}
    return family;
};

MV.text = function (comp, str, o) {
    o = o || {};
    var L = comp.layers.addText(str);
    var tp = L.property("ADBE Text Properties").property("ADBE Text Document");
    var d = tp.value;
    d.resetCharStyle();
    d.resetParagraphStyle();
    if (o.font) d.font = o.font;
    d.fontSize = o.size || 120;
    d.applyFill = o.fill !== null;
    if (o.fill !== null) d.fillColor = o.fill || [1, 1, 1];
    if (o.stroke) { d.applyStroke = true; d.strokeColor = o.stroke; d.strokeWidth = o.strokeWidth || 4; d.strokeOverFill = false; }
    if (o.tracking !== undefined) d.tracking = o.tracking;
    if (o.leading) { d.autoLeading = false; d.leading = o.leading; }
    if (o.justify) d.justification = o.justify;          // ParagraphJustification.CENTER_JUSTIFY etc.
    else d.justification = ParagraphJustification.CENTER_JUSTIFY;
    if (o.vertical) { try { d.lineOrientation = LineOrientation.VERTICAL_RIGHT_TO_LEFT; } catch (e) {} }
    tp.setValue(d);
    if ((o.hscale && o.hscale !== 1) || (o.vscale && o.vscale !== 1)) MV.setTypeScale(L, o.hscale || 1, o.vscale || 1);
    if (o.skew) MV.animator(L, {skew: o.skew}, {});
    if (!o.noCenter) MV.centerAnchor(L);
    var tr = L.property("ADBE Transform Group");
    tr.property("ADBE Position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
    if (o.name) L.name = o.name;
    return L;
};

MV.centerAnchor = function (L, t) {
    var r = L.sourceRectAtTime(t || 0, false);
    L.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
};

// ---------------------------------------------------------------- keyframes
MV._dims = function (prop) {
    var t = prop.propertyValueType;
    if (t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL || t === PropertyValueType.OneD ||
        t === PropertyValueType.COLOR || t === PropertyValueType.NO_VALUE) return 1;
    if (t === PropertyValueType.TwoD) return 2;
    if (t === PropertyValueType.ThreeD) return 3;
    return 1;
};

MV._ease = function (n, speed, infl) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(new KeyframeEase(speed, infl));
    return a;
};

// keys(prop, [[t, v], [t, v], ...], ease)  ease: "linear" | "out" (初速最速) | "in" | "inout" | "hold"
MV.keys = function (prop, list, ease) {
    var idx = [];
    for (var i = 0; i < list.length; i++) idx.push(prop.addKey(list[i][0]));
    for (i = 0; i < list.length; i++) prop.setValueAtKey(idx[i], list[i][1]);
    // addKey returns indices that may shift as later keys are added; look keys up again by time
    var n = MV._dims(prop);
    for (i = 0; i < list.length; i++) {
        var k = prop.nearestKeyIndex(list[i][0]);
        if (ease === "hold") { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); continue; }
        if (ease === "linear" || !ease) { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); continue; }
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        var inE = MV._ease(n, 0, 33), outE = MV._ease(n, 0, 33);
        if (ease === "out") { inE = MV._ease(n, 0, 95); outE = MV._ease(n, 0, 0.1); }      // fast start, long settle
        if (ease === "in") { inE = MV._ease(n, 0, 0.1); outE = MV._ease(n, 0, 95); }
        if (ease === "inout") { inE = MV._ease(n, 0, 75); outE = MV._ease(n, 0, 75); }
        try { prop.setTemporalEaseAtKey(k, inE, outE); } catch (e) {}
    }
    return prop;
};

MV.tr = function (L, name) {   // transform property by short name
    var map = {anchor: "ADBE Anchor Point", position: "ADBE Position", scale: "ADBE Scale", rotation: "ADBE Rotate Z",
               opacity: "ADBE Opacity"};
    return L.property("ADBE Transform Group").property(map[name] || name);
};

// ---------------------------------------------------------------- effects
// MV.fx(layer, "APC Colorama", {"APC Colorama-0003": 0})  values keyed by property matchName (searched at any depth)
MV.findProp = function (group, matchName) {
    for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.matchName === matchName) return p;
        if (p.propertyType !== PropertyType.PROPERTY) {
            var q = MV.findProp(p, matchName);
            if (q) return q;
        }
    }
    return null;
};

MV.fx = function (L, matchName, values) {
    var e = L.property("ADBE Effect Parade").addProperty(matchName);
    if (values) for (var k in values) if (values.hasOwnProperty(k)) {
        var p = MV.findProp(e, k);
        if (!p) throw new Error(matchName + ": no property " + k);
        if (values[k] instanceof Array && values[k].length && values[k][0] instanceof Array) MV.keys(p, values[k], "linear");
        else p.setValue(values[k]);
    }
    return e;
};

MV.expr = function (prop, code) { prop.expression = code; return prop; };

// ---------------------------------------------------------------- text animators
// MV.animator(textLayer, {tracking: -40, opacity: 0, position: [0, 80, 0], scale: [300, 300, 100], rotation: 30,
//                         blur: [20, 20]}, {shape: "rampUp", random: true, basedOn: "chars"})
MV.animator = function (L, props, sel) {
    var anims = L.property("ADBE Text Properties").property("ADBE Text Animators");
    var a = anims.addProperty("ADBE Text Animator");
    var ap = a.property("ADBE Text Animator Properties");
    var map = {tracking: "ADBE Text Tracking Amount", opacity: "ADBE Text Opacity", position: "ADBE Text Position 3D",
               scale: "ADBE Text Scale 3D", rotation: "ADBE Text Rotation", skew: "ADBE Text Skew", blur: "ADBE Text Blur",
               fillColor: "ADBE Text Fill Color", fillHue: "ADBE Text Fill Hue", strokeWidth: "ADBE Text Stroke Width",
               charOffset: "ADBE Text Character Offset"};
    var out = {animator: a, props: {}};
    for (var k in props) if (props.hasOwnProperty(k)) {
        var p = ap.addProperty(map[k] || k);
        p.setValue(props[k]);
        out.props[k] = p;
    }
    var s = a.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    out.selector = s;
    out.start = s.property("ADBE Text Percent Start");
    out.end = s.property("ADBE Text Percent End");
    out.offset = s.property("ADBE Text Percent Offset");
    sel = sel || {};
    var adv = s.property("ADBE Text Range Advanced");
    if (sel.random) adv.property("ADBE Text Randomize Order").setValue(1);
    if (sel.shape) {
        var shapes = {square: 1, rampUp: 2, rampDown: 3, triangle: 4, round: 5, smooth: 6};
        adv.property("ADBE Text Range Shape").setValue(shapes[sel.shape]);
    }
    if (sel.basedOn) {
        var b = {chars: 1, charsNoSpaces: 2, words: 3, lines: 4};
        adv.property("ADBE Text Range Type2").setValue(b[sel.basedOn]);
    }
    if (sel.easeHigh !== undefined) adv.property("ADBE Text Levels Max Ease").setValue(sel.easeHigh);
    if (sel.easeLow !== undefined) adv.property("ADBE Text Levels Min Ease").setValue(sel.easeLow);
    return out;
};

// ---------------------------------------------------------------- mattes
MV.matte = function (L, matteLayer, kind) {   // kind: "alpha" | "alphaInv" | "luma" | "lumaInv"
    var types = {alpha: TrackMatteType.ALPHA, alphaInv: TrackMatteType.ALPHA_INVERTED,
                 luma: TrackMatteType.LUMA, lumaInv: TrackMatteType.LUMA_INVERTED};
    if (L.setTrackMatte) { L.setTrackMatte(matteLayer, types[kind || "alpha"]); return L; }
    matteLayer.moveBefore(L);
    L.trackMatteType = types[kind || "alpha"];
    return L;
};

// ---------------------------------------------------------------- output
MV.waitFile = function (path, secs) {
    var f = new File(path), t = 0;
    while (!f.exists && t < (secs || 60) * 1000) { $.sleep(200); t += 200; f = new File(path); }
    return f.exists;
};

MV.still = function (comp, t, path) {   // one frame to PNG (for quick checks, no render queue)
    var f = new File(path);
    if (!f.parent.exists) f.parent.create();
    comp.saveFrameToPng(t, f);
    if (!MV.waitFile(path, 60)) throw new Error("frame not written: " + path);
    return f.fsName;
};

MV.findTemplate = function (list, words) {    // template names are localised; pick the first containing every word
    for (var i = 0; i < list.length; i++) {
        var ok = true;
        for (var w = 0; w < words.length; w++) if (list[i].indexOf(words[w]) < 0) { ok = false; break; }
        if (ok) return list[i];
    }
    return null;
};

// Add a render-queue item. kind "h264": AE's own H.264 (mp4, with the comp's audio); "tiff" or "png": an image
// sequence (AE 25.6 here has no PNG template, so "png" falls back to TIFF); "lossless": AVI lossless.
// Returns {item, template, file}.
MV.addRender = function (comp, outPath, kind) {
    var rq = app.project.renderQueue.items.add(comp);
    var om = rq.outputModule(1);
    var tries = {png: [["PNG"], ["TIFF"]], tiff: [["TIFF"]], h264: [["H.264", "15"], ["H.264"]], lossless: [["ロスレス"], ["Lossless"]]}[kind] || [];
    var used = null;
    for (var i = 0; i < tries.length && !used; i++) used = MV.findTemplate(om.templates, tries[i]);
    if (tries.length && !used) throw new Error("no output-module template for " + kind + " in: " + om.templates.join(" | "));
    if (used) om.applyTemplate(used);
    if (used && /TIFF|PNG/i.test(used) && outPath.indexOf("[#") < 0)
        outPath = outPath.replace(/\.[^.\\\/]*$/, "") + "_[#####]" + (/TIFF/i.test(used) ? ".tif" : ".png");
    var f = new File(outPath);
    if (!f.parent.exists) f.parent.create();
    om.file = f;
    return {item: rq, template: used, file: outPath};
};

// ================================================================ v1.6: building blocks for the techniques
// Numbers in comments refer to the technique list in research (B = the 1-minute AE technique song).

MV.fps = function (comp) { return 1 / comp.frameDuration; };
MV.f = function (comp, n) { return n * comp.frameDuration; };       // n frames in seconds

// shape layer: kind "ellipse" | "rect"; o: {fill, stroke, strokeWidth, roundness, pos, name}
MV.shape = function (comp, kind, size, o) {
    o = o || {};
    var L = comp.layers.addShape();
    var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var v = g.property("ADBE Vectors Group");
    if (kind === "rect") {
        var r = v.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue(size);
        if (o.roundness) r.property("ADBE Vector Rect Roundness").setValue(o.roundness);
    } else {
        v.addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue(size);
    }
    if (o.stroke) {
        var s = v.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(o.stroke);
        s.property("ADBE Vector Stroke Width").setValue(o.strokeWidth || 8);
    }
    if (o.fill) v.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(o.fill);
    MV.tr(L, "position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
    if (o.name) L.name = o.name;
    return L;
};

MV.blur = function (L, on) { L.motionBlur = on !== false; L.containingComp.motionBlur = true; return L; };

// 12 両脇からドーン: slide in from off-screen with a fast start and a long settle. from: left|right|top|bottom
MV.slam = function (L, t, from, dur, o) {
    o = o || {};
    var c = L.containingComp, p = MV.tr(L, "position"), end = o.to || p.value;
    var dx = {left: -1, right: 1, top: 0, bottom: 0}[from], dy = {left: 0, right: 0, top: -1, bottom: 1}[from];
    var dist = o.dist || (dx ? c.width : c.height) * 1.1;
    MV.keys(p, [[t, [end[0] + dx * dist, end[1] + dy * dist]], [t + (dur || 0.25), end]], "out");
    MV.blur(L);
    return L;
};

// 9 極大→小: one frame very large, then snap to the normal size
MV.punch = function (L, t, big, dur) {
    var s = MV.tr(L, "scale"), v = s.valueAtTime(t, false), k = big || 400;
    MV.keys(s, [[t, [v[0] * k / 100, v[1] * k / 100]], [t + (dur || 0.12), v]], "out");
    return L;
};

// zoom on a still: [[t, scale%, [x, y]], ...]; ease "out" gives the "グン" push, "inout" a camera-like move
MV.move = function (L, list, ease) {
    var s = [], p = [];
    for (var i = 0; i < list.length; i++) {
        s.push([list[i][0], [list[i][1], list[i][1]]]);
        if (list[i][2]) p.push([list[i][0], list[i][2]]);
    }
    MV.keys(MV.tr(L, "scale"), s, ease || "out");
    if (p.length) MV.keys(MV.tr(L, "position"), p, ease || "out");
    MV.blur(L);
    return L;
};

// 8 ストロボ: opacity 100/0 alternating every n frames between t0 and t1, then stays visible
MV.strobe = function (L, t0, t1, n) {
    var c = L.containingComp, step = MV.f(c, n || 2), list = [], on = true;
    for (var t = t0; t < t1; t += step) { list.push([t, on ? 100 : 0]); on = !on; }
    list.push([t1, 100]);
    MV.keys(MV.tr(L, "opacity"), list, "hold");
    return L;
};

// 25 明転 / 暗転: full-screen colour that fades out (flash) quickly
MV.flash = function (comp, t, color, dur, peak) {
    var L = MV.solid(comp, color || [1, 1, 1], "flash");
    MV.span(L, t, t + (dur || 0.3) + comp.frameDuration);
    MV.keys(MV.tr(L, "opacity"), [[t, peak || 100], [t + (dur || 0.3), 0]], "out");
    return L;
};

// 15 中央から円ブワァ: rings that scale up from 0, each copy a little later and in another colour
MV.burst = function (comp, t, colors, o) {
    o = o || {};
    var out = [], d = o.size || comp.width * 1.6;
    for (var i = 0; i < colors.length; i++) {
        var L = MV.shape(comp, "ellipse", [d, d], {fill: o.stroke ? null : colors[i], stroke: o.stroke ? colors[i] : null,
                                                    strokeWidth: o.strokeWidth || 30, pos: o.pos, name: "burst" + i});
        var t0 = t + MV.f(comp, (o.lag || 2) * i);
        MV.span(L, t0, t0 + (o.dur || 0.6) + (o.hold || 0));
        MV.keys(MV.tr(L, "scale"), [[t0, [0, 0]], [t0 + (o.dur || 0.6), [100, 100]]], "out");
        out.push(L);
    }
    return out;
};

// 18 白枠フェードイン: thick outline frame that shrinks onto the subject while fading in
MV.frameIn = function (comp, t, size, o) {
    o = o || {};
    var L = MV.shape(comp, "rect", size || [comp.width * 0.7, comp.height * 0.7],
                     {stroke: o.color || [1, 1, 1], strokeWidth: o.width || 14, pos: o.pos, name: "frameIn"});
    MV.keys(MV.tr(L, "scale"), [[t, [140, 140]], [t + (o.dur || 0.4), [100, 100]]], "out");
    MV.keys(MV.tr(L, "opacity"), [[t, 0], [t + (o.dur || 0.4), 100]], "out");
    return L;
};

// bands for vertical lyrics slamming in from the sides (black and white strips behind the text)
MV.band = function (comp, t, x, w, color, from) {
    var L = MV.shape(comp, "rect", [w, comp.height * 1.2], {fill: color || [0, 0, 0], pos: [x, comp.height / 2], name: "band"});
    MV.slam(L, t, from || (x < comp.width / 2 ? "top" : "bottom"), 0.22);
    return L;
};

// 26 小刻みブルブル (only for a moment): red and cyan copies of a text layer jitter around it, then vanish
MV.rgbSplit = function (L, t0, t1, amp) {
    var out = [], cols = [[1, 0, 0.2], [0, 0.9, 1]];
    for (var i = 0; i < 2; i++) {
        var d = L.duplicate();
        d.moveAfter(L);
        d.name = L.name + (i ? " cyan" : " red");
        var td = d.property("ADBE Text Properties").property("ADBE Text Document"), v = td.value;
        v.applyFill = true; v.fillColor = cols[i]; v.applyStroke = false;
        td.setValue(v);
        d.blendingMode = BlendingMode.SCREEN;
        MV.span(d, t0, t1);
        MV.expr(MV.tr(d, "position"), "wiggle(" + (12 - i * 3) + "," + (amp || 10) + ")");
        out.push(d);
    }
    return out;
};

// 3 文字ブワァ開く: tracking from tight to wide with a fast start
MV.openText = function (L, t, from, to, dur) {
    var td = L.property("ADBE Text Properties").property("ADBE Text Document");
    var a = MV.animator(L, {tracking: 1}, {});
    a.props.tracking.setValue(0);
    MV.keys(a.props.tracking, [[t, from === undefined ? -60 : from], [t + (dur || 0.5), to || 0]], "out");
    return a;
};

// ---- split letters (A: SplitText + TAバラバラ). Each character becomes its own layer at the place it has in the line,
// so every letter can get its own direction, spin and timing.
MV._seed = 12345;
MV.rand = function (lo, hi) {          // small seeded generator, so a rebuild gives the same layout
    MV._seed = (MV._seed * 16807) % 2147483647;
    return lo + (hi - lo) * ((MV._seed - 1) / 2147483646);
};

MV.splitText = function (comp, str, o) {
    o = o || {};
    var size = o.size || 160, h = o.hscale || 1, k = o.kana || 1, trk = (o.tracking || 0) / 1000, chars = [], i;
    var sizes = [], adv = [], wide = true;
    for (i = 0; i < str.length; i++) if (!MV.isWide(str.charAt(i))) wide = false;
    if (wide) {
        for (i = 0; i < str.length; i++) {
            var c0 = str.charAt(i), sz = MV.isKana(c0) ? size * k : size;
            sizes.push(sz);
            adv.push(c0 === "　" ? size * 0.5 : sz * h + size * trk);
        }
    } else {                      // Latin or mixed: measure the growing string with one size
        var tmp = MV.text(comp, str.charAt(0), {font: o.font, size: size, tracking: o.tracking, hscale: h,
                                                justify: ParagraphJustification.LEFT_JUSTIFY, noCenter: true});
        var tp = tmp.property("ADBE Text Properties").property("ADBE Text Document"), prev = 0;
        for (i = 1; i <= str.length; i++) {
            var d = tp.value; d.text = str.substr(0, i); tp.setValue(d);
            var r = tmp.sourceRectAtTime(0, false), right = r.left + r.width;
            sizes.push(size); adv.push(right - prev); prev = right;
        }
        tmp.remove();
    }
    var total = 0;
    for (i = 0; i < adv.length; i++) total += adv[i];
    var pos = o.pos || [comp.width / 2, comp.height / 2], x = pos[0] - total / 2;
    for (i = 0; i < str.length; i++) {
        var ch = str.charAt(i), cx = x + adv[i] / 2;
        x += adv[i];
        if (ch === " " || ch === "　") continue;
        var L = MV.text(comp, ch, {font: o.font, size: sizes[i], fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth,
                                   hscale: h, vscale: o.vscale, skew: o.skew, noCenter: true, name: (o.name || "char") + " " + ch});
        var lift = sizes[i] * 0.38 * (o.vscale || 1);        // optical middle of a CJK glyph above the baseline
        MV.tr(L, "anchor").setValue([0, -lift]);
        MV.tr(L, "position").setValue([cx, pos[1]]);
        chars.push(L);
    }
    return chars;
};

// letters fly in from random directions, one after another
MV.scatterIn = function (chars, t, o) {
    o = o || {};
    var dur = o.dur || 0.4, stag = o.stagger === undefined ? 0.035 : o.stagger, dist = o.dist || 700;
    for (var i = 0; i < chars.length; i++) {
        var L = chars[i], p = MV.tr(L, "position").value, a = MV.rand(0, Math.PI * 2), k = MV.rand(0.5, 1);
        var ti = t + (o.order === "random" ? MV.rand(0, stag * chars.length) : i * stag);
        MV.keys(MV.tr(L, "position"), [[ti, [p[0] + Math.cos(a) * dist * k, p[1] + Math.sin(a) * dist * k]], [ti + dur, p]], "out");
        MV.keys(MV.tr(L, "rotation"), [[ti, MV.rand(-1, 1) * (o.rot || 160)], [ti + dur, 0]], "out");
        MV.keys(MV.tr(L, "scale"), [[ti, [o.scale || 260, o.scale || 260]], [ti + dur, [100, 100]]], "out");
        MV.keys(MV.tr(L, "opacity"), [[ti, 0], [ti + dur * 0.3, 100]], "linear");
        if (L.inPoint > ti) L.inPoint = ti;
        MV.blur(L);
    }
    return chars;
};

// ノイズでグシャぁ: letters fall apart (drop, tilt, blur, fade) in random order
MV.crumbleOut = function (chars, t, o) {
    o = o || {};
    var dur = o.dur || 0.55;
    for (var i = 0; i < chars.length; i++) {
        var L = chars[i], ti = t + MV.rand(0, o.spread || 0.25), p = MV.tr(L, "position").valueAtTime(ti, false);
        MV.keys(MV.tr(L, "position"), [[ti, p], [ti + dur, [p[0] + MV.rand(-1, 1) * 160, p[1] + MV.rand(0.4, 1) * (o.fall || 380)]]], "in");
        MV.keys(MV.tr(L, "rotation"), [[ti, 0], [ti + dur, MV.rand(-1, 1) * 100]], "in");
        MV.keys(MV.tr(L, "opacity"), [[ti + dur * 0.4, 100], [ti + dur, 0]], "linear");
        var e = MV.fx(L, "ADBE Gaussian Blur 2");
        MV.keys(MV.findProp(e, "ADBE Gaussian Blur 2-0001"), [[ti, 0], [ti + dur, 30]], "in");
        MV.blur(L);
    }
    return chars;
};

// each letter appears at its own time: times[i] for chars[i] (lyric timing), with a small pop
MV.charsAt = function (chars, times, o) {
    o = o || {};
    for (var i = 0; i < chars.length; i++) {
        var L = chars[i], ti = times[Math.min(i, times.length - 1)];
        L.inPoint = Math.max(0, ti);
        var s = MV.tr(L, "scale").valueAtTime(ti, false);
        if (o.stretch) MV.keys(MV.tr(L, "scale"), [[ti, [s[0] * 0.85, s[1] * o.stretch]], [ti + (o.dur || 0.12), s]], "out");
        else if (o.pop !== 1) MV.keys(MV.tr(L, "scale"), [[ti, [s[0] * (o.pop || 1.6), s[1] * (o.pop || 1.6)]], [ti + (o.dur || 0.15), s]], "out");
        if (o.drop) {
            var p = MV.tr(L, "position").valueAtTime(ti, false);
            MV.keys(MV.tr(L, "position"), [[ti, [p[0], p[1] - o.drop]], [ti + (o.dur || 0.15) * 1.6, p]], "out");
            MV.blur(L);
        }
    }
    return chars;
};

MV.spanAll = function (layers, tIn, tOut) {
    for (var i = 0; i < layers.length; i++) { if (tIn !== null) layers[i].inPoint = Math.max(layers[i].inPoint, tIn); layers[i].outPoint = tOut; }
    return layers;
};

// typewriter / character reveal with hold steps (for quiet verses)
MV.typeOn = function (L, t, dur) {
    var a = MV.animator(L, {opacity: 0}, {basedOn: "chars"});
    a.selector.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(1);
    MV.keys(a.start, [[t, 0], [t + (dur || 1), 100]], "linear");
    return a;
};

// 7 / 17 文字の中に絵: show `imgLayer` only inside the shape of `textLayer`
MV.textMatte = function (imgLayer, textLayer) {
    textLayer.moveBefore(imgLayer);
    return MV.matte(imgLayer, textLayer, "alpha");
};

// 6 枠線クローン大量: outline-only copies stacked as lines
MV.outlineClones = function (comp, str, n, o) {
    o = o || {};
    var lines = [];
    for (var i = 0; i < n; i++) lines.push(str);
    return MV.text(comp, lines.join("\r"), {font: o.font, size: o.size || 160, fill: null, stroke: o.color || [1, 1, 1],
                                            strokeWidth: o.strokeWidth || 3, leading: o.leading || (o.size || 160) * 1.05,
                                            pos: o.pos, name: "outline clones"});
};

// adjustment layer spanning the comp (for grades and short glitch bursts)
MV.adjust = function (comp, name, tIn, tOut) {
    var L = MV.solid(comp, [1, 1, 1], name || "adjust");
    L.adjustmentLayer = true;
    if (tIn !== undefined) MV.span(L, tIn, tOut);
    return L;
};

// ================================================================ v1.6b: footage, fonts and effect-based techniques
// Effect property matchNames below were read from AE 25.6 (research/ae/effects_dump_ae25.6.json in project files).

// first installed font out of a list of PostScript names or family names; null when none is found
MV.pickFont = function (cands) {
    for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        try {
            if (app.fonts.getFontsByPostScriptName) {
                var f = app.fonts.getFontsByPostScriptName(c);
                if (f && f.length) return f[0].postScriptName;
            }
            var g = app.fonts.getFontsByFamilyNameAndStyleName(c.split("/")[0], c.split("/")[1] || "Regular");
            if (g && g.length) return g[0].postScriptName;
        } catch (e) {}
    }
    return null;
};

// a still or movie as a layer; fit "cover" (fill the frame) or "height" (character cut-outs), extra in %
MV.layerFrom = function (comp, path, o) {
    o = o || {};
    var L = comp.layers.add(MV.importFile(path));
    var sw = L.source.width, sh = L.source.height, k;
    if (o.fit === "height") k = comp.height * (o.h || 1) / sh * 100;
    else k = Math.max(comp.width / sw, comp.height / sh) * 100 * (o.extra || 1);
    MV.tr(L, "scale").setValue([k, k]);
    if (o.pos) MV.tr(L, "position").setValue(o.pos);
    if (o.name) L.name = o.name;
    if (o.tIn !== undefined) MV.span(L, o.tIn, o.tOut);
    return L;
};

// reveal a text layer word by word at given times: words [[text, t], ...] (the layer's text is the words joined)
MV.typeWords = function (L, words, o) {
    o = o || {};
    var n = 0, i;
    for (i = 0; i < words.length; i++) n += words[i][0].length;
    var a = MV.animator(L, {opacity: 0}, {basedOn: "chars"});
    a.selector.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(1);   // square
    var list = [], done = 0;
    for (i = 0; i < words.length; i++) { done += words[i][0].length; list.push([words[i][1], done / n * 100]); }
    list.unshift([Math.max(0, words[0][1] - 0.01), 0]);
    MV.keys(a.start, list, o.ease || "hold");
    if (o.pop) {             // each new word pops from a little larger
        var b = MV.animator(L, {scale: [o.pop, o.pop, 100]}, {basedOn: "chars"});
        b.selector.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(1);
        var l2 = [], d2 = 0;
        for (i = 0; i < words.length; i++) {
            d2 += words[i][0].length;
            l2.push([words[i][1], (d2 - words[i][0].length) / n * 100]);
            l2.push([words[i][1] + 0.12, d2 / n * 100]);
        }
        MV.keys(b.start, l2, "out");
    }
    return a;
};

// 4 一瞬キラッ: Colorama phase turns once in `frames`, then blends back to the original
MV.kira = function (L, t, frames) {
    var c = L.containingComp, d = MV.f(c, frames || 5);
    var e = MV.fx(L, "APC Colorama");
    MV.keys(MV.findProp(e, "APC Colorama-0008"), [[t, 0], [t + d, 360]], "linear");
    MV.keys(MV.findProp(e, "APC Colorama-0036"), [[t - c.frameDuration, 100], [t, 0], [t + d, 0], [t + d + c.frameDuration, 100]], "hold");
    return e;
};

// 19 ブラインドイン: stripes close to reveal the layer
MV.blindsIn = function (L, t, dur, angle, width) {
    var e = MV.fx(L, "ADBE Venetian Blinds", {"ADBE Venetian Blinds-0002": angle || 60, "ADBE Venetian Blinds-0003": width || 60});
    MV.keys(MV.findProp(e, "ADBE Venetian Blinds-0001"), [[t, 100], [t + (dur || 0.3), 0]], "out");
    return e;
};

// ノイズでグシャ / 汚し: turbulent displace that ramps in (and optionally out)
MV.turb = function (L, t0, t1, amount, size) {
    var e = MV.fx(L, "ADBE Turbulent Displace", {"ADBE Turbulent Displace-0003": size || 40});
    var a = MV.findProp(e, "ADBE Turbulent Displace-0002");
    MV.keys(a, [[t0, 0], [t1, amount || 120]], "in");
    MV.expr(MV.findProp(e, "ADBE Turbulent Displace-0006"), "time * 720");
    return e;
};

// 汚れた文字: rough, eaten edges that crawl slowly
MV.roughText = function (L, border, scale) {
    var e = MV.fx(L, "ADBE Roughen Edges", {"ADBE Roughen Edges-0002": border || 6, "ADBE Roughen Edges-0005": scale || 60});
    MV.expr(MV.findProp(e, "ADBE Roughen Edges-0009"), "time * 90");
    return e;
};

// モザイクで切り替え: blocks get finer between t and t+dur
MV.mosaicIn = function (L, t, dur, from) {
    var e = MV.fx(L, "ADBE Mosaic");
    var h = MV.findProp(e, "ADBE Mosaic-0001"), v = MV.findProp(e, "ADBE Mosaic-0002");
    var k = from || 12, c = L.containingComp;
    MV.keys(h, [[t, k], [t + (dur || 0.25), 1000]], "hold");
    MV.keys(v, [[t, Math.round(k * c.height / c.width)], [t + (dur || 0.25), 1000]], "hold");
    return e;
};

// 14 シルエット (塗り) and black-and-white tint for a mood shift
MV.silhouette = function (L, color) { return MV.fx(L, "ADBE Fill", {"ADBE Fill-0002": color.length === 4 ? color : color.concat([1])}); };
MV.mono = function (L, tint, amount) {
    var e = MV.fx(L, "ADBE Black&White");
    if (tint) MV.fx(L, "ADBE Tint", {"ADBE Tint-0001": [0.02, 0.03, 0.08, 1], "ADBE Tint-0002": tint.concat([1]), "ADBE Tint-0003": amount || 100});
    return e;
};
MV.keepColor = function (L, color, tol) {     // 色抜き: everything grey except one colour (the yellow umbrella)
    return MV.fx(L, "ADBE Leave Color", {"ADBE Leave Color-0001": 100, "ADBE Leave Color-0002": color.concat([1]),
                                          "ADBE Leave Color-0003": tol || 25, "ADBE Leave Color-0004": 20});
};
MV.blurFx = function (L, amount) { return MV.fx(L, "ADBE Gaussian Blur 2", {"ADBE Gaussian Blur 2-0001": amount, "ADBE Gaussian Blur 2-0003": 1}); };
MV.dim = function (L, exposure) { return MV.fx(L, "ADBE Exposure2", {"ADBE Exposure2-0003": exposure}); };

// a thin ring that grows and fades (raindrop ripple / accent)
MV.ring = function (comp, t, pos, size, color, dur) {
    var L = MV.shape(comp, "ellipse", [size, size], {stroke: color || [1, 1, 1], strokeWidth: 6, pos: pos, name: "ring"});
    MV.span(L, t, t + (dur || 0.8));
    MV.keys(MV.tr(L, "scale"), [[t, [10, 10]], [t + (dur || 0.8), [100, 100]]], "out");
    MV.keys(MV.tr(L, "opacity"), [[t, 100], [t + (dur || 0.8), 0]], "in");
    return L;
};

// letters hop one after another (a travelling bump)
MV.hop = function (L, t, dur, height) {
    var a = MV.animator(L, {position: [0, -(height || 80), 0]}, {shape: "triangle", basedOn: "chars"});
    a.end.setValue(30);
    MV.keys(a.offset, [[t, -30], [t + (dur || 0.6), 100]], "linear");
    return a;
};

// vignette: black solid with a feathered, inverted ellipse mask
MV.vignette = function (comp, amount, feather) {
    var L = MV.solid(comp, [0, 0, 0], "vignette");
    var m = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var s = new Shape(), w = comp.width, h = comp.height, k = 0.5523;
    s.vertices = [[w / 2, -h * 0.08], [w * 1.06, h / 2], [w / 2, h * 1.08], [-w * 0.06, h / 2]];
    s.inTangents = [[-w * 0.56 * k, 0], [0, -h * 0.58 * k], [w * 0.56 * k, 0], [0, h * 0.58 * k]];
    s.outTangents = [[w * 0.56 * k, 0], [0, h * 0.58 * k], [-w * 0.56 * k, 0], [0, -h * 0.58 * k]];
    s.closed = true;
    m.property("ADBE Mask Shape").setValue(s);
    m.property("ADBE Mask Feather").setValue([feather || 380, feather || 380]);
    m.inverted = true;
    MV.tr(L, "opacity").setValue(amount || 55);
    return L;
};

// finishing grade on an adjustment layer: glow on highlights, a little grain, slightly richer colour
MV.grade = function (comp, o) {
    o = o || {};
    var L = MV.adjust(comp, "grade");
    MV.fx(L, "ADBE Glo2", {"ADBE Glo2-0002": o.glowThreshold || 170, "ADBE Glo2-0003": o.glowRadius || 80, "ADBE Glo2-0004": o.glow || 0.35});
    MV.fx(L, "ADBE Vibrance", {"ADBE Vibrance-0001": o.vibrance || 15});
    MV.fx(L, "ADBE Noise2", {"ADBE Noise2-0001": o.grain || 3, "ADBE Noise2-0002": 0});
    return L;
};

// ================================================================ v1.6c: vertical lyrics, character moves, frame accents

// 縦書き: one layer per character, columns right to left ("\n" starts the next column). o: {font, size, x, top, gap, colGap, fill,
// stroke, strokeWidth, name}. Long-vowel marks turn 90 degrees, small kana and 、。 sit in the upper right of their cell.
MV.splitV = function (comp, str, o) {
    o = o || {};
    var size = o.size || 90, k = o.kana || 1, gap = o.gap || 1.08, colGap = size * (o.colGap || 1.45);
    var cols = str.split("\n"), chars = [];
    for (var c = 0; c < cols.length; c++) {
        var x = (o.x || comp.width * 0.8) - c * colGap, y = o.top || comp.height * 0.12;
        for (var i = 0; i < cols[c].length; i++) {
            var ch = cols[c].charAt(i), sz = MV.isKana(ch) && "ー".indexOf(ch) < 0 ? size * k : size, step = sz * gap;
            if (ch === " " || ch === "　") { y += size * gap * 0.5; continue; }
            var L = MV.text(comp, ch, {font: o.font, size: sz, fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth,
                                       hscale: o.hscale, noCenter: true, name: (o.name || "v") + " " + ch});
            MV.tr(L, "anchor").setValue([0, -sz * 0.38]);
            var px = x, py = y + step / 2;
            if ("ーー〜～…".indexOf(ch) >= 0) MV.tr(L, "rotation").setValue(90);
            if ("ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ".indexOf(ch) >= 0) { px += sz * 0.12; py -= sz * 0.12; }
            if ("、。".indexOf(ch) >= 0) { px += sz * 0.55; py -= sz * 0.55; }
            MV.tr(L, "position").setValue([px, py]);
            y += step;
            chars.push(L);
        }
    }
    return chars;
};

// per-character times from word timings [[text, start, end], ...]: the characters of a word share its span evenly
MV.charTimes = function (words) {
    var out = [];
    for (var i = 0; i < words.length; i++) {
        var w = words[i][0].replace(/[ 　\n]/g, ""), t0 = words[i][1], t1 = words[i].length > 2 ? words[i][2] : t0;
        for (var k = 0; k < w.length; k++) out.push(t0 + (t1 - t0) * k / w.length);
    }
    return out;
};

// a short jump of a whole layer (character cut-out on an accent)
MV.bounce = function (L, t, dur, height) {
    var p = MV.tr(L, "position"), v = p.valueAtTime(t, false), d = dur || 0.3, h = height || 60;
    MV.keys(p, [[t, v], [t + d * 0.38, [v[0], v[1] - h]], [t + d, v]], "inout");
    return L;
};

// 一瞬だけ揺らす: wiggle on position only between t0 and t1 (never a constant beat shake)
MV.jolt = function (L, t0, t1, freq, amp) {
    MV.expr(MV.tr(L, "position"), "var a = " + t0 + ", b = " + t1 + "; (time >= a && time < b) ? wiggle(" + (freq || 24) + ", " + (amp || 20) + ") : value");
    return L;
};

// ズレ影: a flat-coloured copy behind the layer, offset by [dx, dy], following all of its keys
MV.echo = function (L, color, offset) {
    var d = L.duplicate();
    d.moveAfter(L);
    d.name = L.name + " echo";
    MV.silhouette(d, color);
    var o = offset || [16, 12];
    MV.expr(MV.tr(d, "position"), "value + [" + o[0] + ", " + o[1] + "]");
    return d;
};

// black bars that slam in from top and bottom, leaving a band of height bandH (目元だけ見せる帯)
MV.bars = function (comp, t, bandH, o) {
    o = o || {};
    var h = (comp.height - bandH) / 2 + 20, out = [];
    var top = MV.shape(comp, "rect", [comp.width * 1.2, h], {fill: o.color || [0, 0, 0], pos: [comp.width / 2, h / 2 - 20], name: "bar top"});
    var bot = MV.shape(comp, "rect", [comp.width * 1.2, h], {fill: o.color || [0, 0, 0], pos: [comp.width / 2, comp.height - h / 2 + 20], name: "bar bottom"});
    MV.slam(top, t, "top", o.dur || 0.3, {dist: h});
    MV.slam(bot, t, "bottom", o.dur || 0.3, {dist: h});
    out.push(top, bot);
    return out;
};

// a text-shaped window onto an image: the image shows only inside the letters; returns {img, text}
MV.imageInText = function (comp, imgPath, textLayer, o) {
    o = o || {};
    var img = MV.layerFrom(comp, imgPath, {fit: "cover", extra: o.extra || 1.1, name: "in-text " + textLayer.name});
    img.moveAfter(textLayer);
    MV.matte(img, textLayer, "alpha");
    textLayer.enabled = false;
    return {img: img, text: textLayer};
};

// ================================================================ v1.7: one typeface, shaped type (長体・かな小さめ・縦伸び・スライス)
MV.KANA = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ" +
          "ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶー";
MV.isKana = function (ch) { return MV.KANA.indexOf(ch) >= 0; };
MV.isWide = function (ch) { return ch.charCodeAt(0) >= 0x3000; };

// 長体 (h < 1) / 平体 and 縦長 (v > 1). AE's scripting unit for these is checked once: 0.5 must halve the width.
MV._typeUnit = null;
MV.setTypeScale = function (L, h, v) {
    var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), d;
    if (MV._typeUnit === null) {
        var w0 = L.sourceRectAtTime(0, false).width;
        d = tp.value; d.horizontalScale = 0.5; tp.setValue(d);
        var w1 = L.sourceRectAtTime(0, false).width;
        MV._typeUnit = (w0 > 0 && w1 < w0 * 0.1) ? 100 : 1;
        mvlog("type scale unit: " + MV._typeUnit + " (width " + Math.round(w0) + " -> " + Math.round(w1) + " at 0.5)");
    }
    d = tp.value;
    d.horizontalScale = h * MV._typeUnit;
    d.verticalScale = v * MV._typeUnit;
    tp.setValue(d);
    return L;
};

// 縦にビヨッ: the layer starts stretched tall and snaps back (on an accent)
MV.stretch = function (L, t, k, dur) {
    var s = MV.tr(L, "scale"), v = s.valueAtTime(t, false);
    MV.keys(s, [[t, [v[0] * 0.85, v[1] * (k || 2)]], [t + (dur || 0.12), v]], "out");
    return L;
};

MV.rectMask = function (L, x0, y0, x1, y1) {
    var m = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"), sh = new Shape();
    sh.vertices = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    sh.closed = true;
    m.property("ADBE Mask Shape").setValue(sh);
    return m;
};

// スライス: the layer is cut by a horizontal line and the two halves jump apart for a moment, then meet again
MV.slice = function (L, t, o) {
    o = o || {};
    var c = L.containingComp, fd = c.frameDuration, r = L.sourceRectAtTime(t, false), pad = 600;
    var y = r.top + r.height * (o.frac || 0.55), shift = o.shift || 60, dur = o.dur || 0.25;
    var bot = L.duplicate();
    bot.name = L.name + " lower";
    MV.rectMask(L, r.left - pad, r.top - pad, r.left + r.width + pad, y);
    MV.rectMask(bot, r.left - pad, y, r.left + r.width + pad, r.top + r.height + pad);
    var parts = [[L, shift], [bot, -shift]];
    for (var i = 0; i < 2; i++) {
        var p = MV.tr(parts[i][0], "position"), v = p.valueAtTime(t, false);
        MV.keys(p, [[t - fd, v], [t, [v[0] + parts[i][1], v[1]]], [t + dur, v]], "out");
    }
    return [L, bot];
};

// 方向ブラー: a streak that clears (rain-like entrance); angle 0 = vertical
MV.smear = function (L, t, dur, angle, len) {
    var e = MV.fx(L, "ADBE Motion Blur", {"ADBE Motion Blur-0001": angle || 0});
    MV.keys(MV.findProp(e, "ADBE Motion Blur-0002"), [[t, len || 120], [t + (dur || 0.3), 0]], "out");
    return e;
};

// a thin line that draws itself (the one colour accent)
MV.rule = function (comp, t, pos, len, vertical, color, width, dur) {
    var w = width || 4, L = MV.shape(comp, "rect", vertical ? [w, len] : [len, w], {fill: color || [1, 0.83, 0], pos: pos, name: "rule"});
    MV.keys(MV.tr(L, "scale"), [[t, vertical ? [100, 0] : [0, 100]], [t + (dur || 0.6), [100, 100]]], "out");
    return L;
};

// colour wash over everything (soft light), used by the finishing grade to tie the scenes together
MV.wash = function (comp, color, amount) {
    var L = MV.solid(comp, color, "wash");
    L.blendingMode = BlendingMode.SOFT_LIGHT;
    MV.tr(L, "opacity").setValue(amount || 25);
    return L;
};
