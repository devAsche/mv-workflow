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
// move a layer's in point without moving its out point. 2026-11-13: setting inPoint on a trimmed text layer moved its out
// point by the same amount (a carried-over line lost its first letter at tOut while the later letters stayed on screen,
// each as long as it had come in late)
MV.setIn = function (layer, t) {
    var out = layer.outPoint;
    layer.inPoint = t;
    if (Math.abs(layer.outPoint - out) > 1e-6) layer.outPoint = out;
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

// one frame through the render queue, as TIFF (AE 25.6 has no PNG output template): path "x.png" writes "x.tif".
// For when saveFrameToPng stops writing (2026-11-12: the call returned and no file ever appeared, even for a plain solid).
MV.stillRQ = function (comp, t, path) {
    var rq = app.project.renderQueue, i;
    for (i = 1; i <= rq.numItems; i++) { try { if (rq.item(i).status === RQItemStatus.QUEUED) rq.item(i).render = false; } catch (e) {} }
    var it = rq.items.add(comp);
    it.timeSpanStart = t;
    it.timeSpanDuration = comp.frameDuration;
    var om = it.outputModule(1), tpl = MV.findTemplate(om.templates, ["TIFF"]);
    if (!tpl) throw new Error("no TIFF output template in: " + om.templates.join(" | "));
    om.applyTemplate(tpl);
    var base = path.replace(/\.(png|tif)$/i, ""), dir = new File(base).parent;
    if (!dir.exists) dir.create();
    om.file = new File(base + "_[#####].tif");
    rq.render();
    var name = new File(base).name, got = dir.getFiles(name + "_*.tif"), out = base + ".tif";
    try { it.remove(); } catch (e) {}
    if (!got.length) throw new Error("render-queue still not written: " + out);
    var g = got[got.length - 1], o = new File(out);
    if (o.exists) o.remove();
    g.rename(o.name);
    return o.fsName;
};

// "queue": only add the render-queue item (one frame, TIFF) and return the file it will write; nothing renders here.
// The saved project is rendered afterwards by aerender (the runner's ae_render job). For when rendering from a script
// inside the open AE does nothing (2026-11-12: renderQueue.render() returned at once, items stayed queued).
MV.stillQueue = function (comp, t, path) {
    var fd = comp.frameDuration, fr = Math.round(t / fd);
    var it = app.project.renderQueue.items.add(comp);
    it.timeSpanStart = fr * fd;
    it.timeSpanDuration = fd;
    var om = it.outputModule(1), tpl = MV.findTemplate(om.templates, ["TIFF"]);
    if (!tpl) throw new Error("no TIFF output template in: " + om.templates.join(" | "));
    om.applyTemplate(tpl);
    var base = path.replace(/\.(png|tif)$/i, ""), dir = new File(base).parent;
    if (!dir.exists) dir.create();
    om.file = new File(base + "_[#####].tif");
    return base + "_" + ("0000" + fr).slice(-5) + ".tif";
};

MV.STILL_MODE = "png";           // "rq": every still through the render queue (TIFF); "queue": queued for aerender
MV.still = function (comp, t, path) {   // one frame to PNG (for quick checks, no render queue)
    if (MV.STILL_MODE === "rq") return MV.stillRQ(comp, t, path);
    if (MV.STILL_MODE === "queue") return MV.stillQueue(comp, t, path);
    var f = new File(path);
    if (!f.parent.exists) f.parent.create();
    comp.saveFrameToPng(t, f);
    if (!MV.waitFile(path, 60)) throw new Error("frame not written: " + path);
    var last = -1, same = 0;
    for (var i = 0; i < 50 && same < 2; i++) {          // the file can appear before AE has finished writing it
        var n = new File(path).length;
        if (n > 0 && n === last) same++; else same = 0;
        last = n;
        $.sleep(100);
    }
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
        if (L.inPoint > ti) MV.setIn(L, ti);
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

// each letter appears at its own time: times[i] for chars[i] (lyric timing), with a small pop. o.from: letters sung before
// this time (a line carried over a cut) are there from the start without popping again; o.until: letters sung at or after
// it (the next shot's) are switched off here
MV.charsAt = function (chars, times, o) {
    o = o || {};
    for (var i = 0; i < chars.length; i++) {
        var L = chars[i], ti = times[Math.min(i, times.length - 1)];
        if (o.until !== undefined && ti >= o.until - 0.001) { L.enabled = false; continue; }
        if (o.from !== undefined && ti <= o.from + 0.001) { MV.setIn(L, Math.max(L.inPoint, o.from)); continue; }
        MV.setIn(L, Math.max(0, ti));
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
    for (var i = 0; i < layers.length; i++) { if (tIn !== null) MV.setIn(layers[i], Math.max(layers[i].inPoint, tIn)); layers[i].outPoint = tOut; }
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
// o.minBand: the narrowest band the bars will later close to (they are made tall enough to still reach the frame edge)
MV.bars = function (comp, t, bandH, o) {
    o = o || {};
    var edge = (comp.height - bandH) / 2, h = (comp.height - Math.min(bandH, o.minBand === undefined ? bandH : o.minBand)) / 2 + 20, out = [];
    var top = MV.shape(comp, "rect", [comp.width * 1.2, h], {fill: o.color || [0, 0, 0], pos: [comp.width / 2, edge - h / 2], name: "bar top"});
    var bot = MV.shape(comp, "rect", [comp.width * 1.2, h], {fill: o.color || [0, 0, 0], pos: [comp.width / 2, comp.height - edge + h / 2], name: "bar bottom"});
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

// ================================================================ v1.8: readable lyrics, views of one picture, rain, one palette, checks
// From the learning notes (2026-11-11): lyrics on strips or boxes so any background reads; one picture shown many ways
// (a crop on a detail, flipped, tilted, in rows, small in a frame, through a shape, inside a silhouette); ripples for rain;
// one palette over every cut; and still pairs for an automatic contrast check (tools/qa_contrast.py).

// comp-space box [x0, y0, x1, y1] around layers at time t (ignores rotation)
MV.bounds = function (layers, t) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i], r = L.sourceRectAtTime(t, false);
        if (!r || r.width <= 0 || r.height <= 0) continue;
        var p = MV.tr(L, "position").valueAtTime(t, false), a = MV.tr(L, "anchor").valueAtTime(t, false);
        var s = MV.tr(L, "scale").valueAtTime(t, false), sx = s[0] / 100, sy = s[1] / 100;
        var xa = p[0] + (r.left - a[0]) * sx, xb = p[0] + (r.left + r.width - a[0]) * sx;
        var ya = p[1] + (r.top - a[1]) * sy, yb = p[1] + (r.top + r.height - a[1]) * sy;
        x0 = Math.min(x0, xa, xb); x1 = Math.max(x1, xa, xb); y0 = Math.min(y0, ya, yb); y1 = Math.max(y1, ya, yb);
    }
    return x1 < x0 ? null : [x0, y0, x1, y1];
};

// shape layer in one of three outlines: "rect", "ellipse" (or "circle") or "eye" (two arcs meeting in points)
MV.pathShape = function (comp, kind, size, o) {
    o = o || {};
    if (kind !== "eye") return MV.shape(comp, kind === "rect" ? "rect" : "ellipse", size, o);
    var L = comp.layers.addShape();
    var v = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    var s = new Shape(), w = size[0], h = size[1], hx = w * 0.3, hy = h * 0.667;
    s.vertices = [[-w / 2, 0], [w / 2, 0]];
    s.outTangents = [[hx, -hy], [-hx, hy]];
    s.inTangents = [[hx, hy], [-hx, -hy]];
    s.closed = true;
    v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(s);
    if (o.stroke) {
        var st = v.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Color").setValue(o.stroke);
        st.property("ADBE Vector Stroke Width").setValue(o.strokeWidth || 8);
    }
    if (o.fill) v.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(o.fill);
    MV.tr(L, "position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
    if (o.name) L.name = o.name;
    return L;
};

// 読ませる入れ物 under lyrics. groups: [[layers], ...] (one group per line or vertical column); t: a time when the letters
// have settled (their size is read then). o.kind: "strip" (a band behind each group), "box" (one box around every group),
// "scrim" (a soft dark patch), "halo" (a dark glow on the letters themselves), "rim" (a hairline dark edge and a soft pale drop
// shadow on the letters: color/opacity are the shadow's, edge px, edgeOpacity %, edgeColor, dist, soft).
// o: {color, opacity, pad, dur (0: no fade-in), wipe, size, soft (halo blur / scrim feather / rim shadow softness)}
MV.plate = function (comp, groups, t, o) {
    o = o || {};
    var kind = o.kind || "strip", made = [], g, i;
    if (kind === "halo") {            // two dark glows: a tight one that outlines the letters and a wide soft one
        var sz = o.size || 100, hc = (o.color || [0, 0, 0]).concat([1]), k = (o.opacity || 100) / 100;
        for (g = 0; g < groups.length; g++) for (i = 0; i < groups[g].length; i++) {
            MV.fx(groups[g][i], "ADBE Drop Shadow", {"ADBE Drop Shadow-0001": hc, "ADBE Drop Shadow-0002": 255 * k,
                  "ADBE Drop Shadow-0004": 0, "ADBE Drop Shadow-0005": o.soft || Math.round(sz * 0.12)});
            MV.fx(groups[g][i], "ADBE Drop Shadow", {"ADBE Drop Shadow-0001": hc, "ADBE Drop Shadow-0002": 200 * k,
                  "ADBE Drop Shadow-0004": 0, "ADBE Drop Shadow-0005": Math.round((o.soft || sz * 0.12) * 4)});
        }
        return made;
    }
    if (kind === "rim") {             // a hairline dark edge on the letters and a soft pale drop shadow (2026-11-13: the dark halo read as eerie)
        var rs = o.size || 100, ew = o.edge !== undefined ? o.edge : Math.max(1.2, rs * 0.022);   // ew: visible edge outside the glyph, px
        var eo = o.edgeOpacity !== undefined ? o.edgeOpacity : 45, ec = o.edgeColor || [0, 0, 0];
        var so = (o.opacity !== undefined ? o.opacity : 35) / 100, scol = (o.color || [1, 1, 1]).concat([1]);
        var dist = o.dist !== undefined ? o.dist : Math.max(2, Math.round(rs * 0.045)), soft = o.soft !== undefined ? o.soft : Math.round(rs * 0.1);
        for (g = 0; g < groups.length; g++) for (i = 0; i < groups[g].length; i++) {
            var RL = groups[g][i], tprops = null;
            try { tprops = RL.property("ADBE Text Properties"); } catch (e0) {}
            if (tprops) {             // text: a real stroke under the fill (only its outer half shows), dimmed by an animator
                var tdoc = tprops.property("ADBE Text Document"), tv = tdoc.value;
                tv.applyStroke = true; tv.strokeWidth = ew * 2; tv.strokeOverFill = false;
                tv.strokeColor = ec;
                tdoc.setValue(tv);
                try { MV.animator(RL, {"ADBE Text Stroke Opacity": eo}, {}); MV._rimEdge = "animator"; }
                catch (e1) {          // no stroke opacity in this AE: mix the edge colour toward the fill instead
                    tv = tdoc.value; var k2 = eo / 100;
                    tv.strokeColor = [ec[0] * k2 + 0.55 * (1 - k2), ec[1] * k2 + 0.57 * (1 - k2), ec[2] * k2 + 0.62 * (1 - k2)];
                    tdoc.setValue(tv); MV._rimEdge = "grey";
                }
            } else {                  // strokes drawn as shapes (handwriting): a tight dark shadow stands in for the edge
                MV.fx(RL, "ADBE Drop Shadow", {"ADBE Drop Shadow-0001": ec.concat([1]), "ADBE Drop Shadow-0002": 255 * eo / 100,
                      "ADBE Drop Shadow-0004": 0, "ADBE Drop Shadow-0005": Math.max(1, ew * 1.5)});
            }
            MV.fx(RL, "ADBE Drop Shadow", {"ADBE Drop Shadow-0001": scol, "ADBE Drop Shadow-0002": 255 * so,
                  "ADBE Drop Shadow-0003": 135, "ADBE Drop Shadow-0004": dist, "ADBE Drop Shadow-0005": soft});
        }
        return made;
    }
    if (kind !== "strip") {
        var all = [];
        for (g = 0; g < groups.length; g++) all = all.concat(groups[g]);
        groups = [all];
    }
    for (g = 0; g < groups.length; g++) {
        var Ls = groups[g], b = MV.bounds(Ls, t);
        if (!b) continue;
        var w = b[2] - b[0], h = b[3] - b[1], horiz = w >= h, sh = Math.min(w, h);
        var p = o.pad !== undefined ? o.pad : Math.round(sh * (kind === "strip" ? 0.3 : 0.55));
        var along = kind === "strip" ? Math.round(p * 1.8) : p;
        var bw = w + 2 * (horiz ? along : p), bh = h + 2 * (horiz ? p : along), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, P, op;
        if (kind === "scrim") {
            P = MV.solid(comp, o.color || [0, 0, 0], "plate scrim");
            var fe = o.soft !== undefined ? o.soft : Math.max(bw, bh) * 0.22;     // soft: feather px (keep it under half the height)
            MV.rectMask(P, cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2).property("ADBE Mask Feather").setValue([fe, fe]);
            op = o.opacity || 60;
        } else {
            P = MV.shape(comp, "rect", [bw, bh], {fill: o.color || [0, 0, 0], pos: [cx, cy], name: "plate " + kind});
            op = o.opacity || (kind === "strip" ? 88 : 75);
        }
        var tin = 1e9, tout = -1e9;
        for (i = 0; i < Ls.length; i++) { tin = Math.min(tin, Ls[i].inPoint); tout = Math.max(tout, Ls[i].outPoint); }
        MV.span(P, tin, tout);
        MV.tr(P, "opacity").setValue(op);
        if (kind === "strip" && o.wipe !== false) MV.keys(MV.tr(P, "scale"), [[tin, horiz ? [0, 100] : [100, 0]], [tin + (o.dur || 0.2), [100, 100]]], "out");
        else if (o.dur !== 0) MV.keys(MV.tr(P, "opacity"), [[tin, 0], [tin + (o.dur || 0.25), op]], "out");   // dur 0: no fade-in (a line carried over a cut)
        var low = Ls[0];
        for (i = 1; i < Ls.length; i++) if (Ls[i].index > low.index) low = Ls[i];
        P.moveAfter(low);
        made.push(P);
    }
    return made;
};

// どこを見せるか: the layer position that puts source pixel f at screen point s (default: centre) at scale k%,
// clamped so the picture still covers the frame unless noClamp
MV.focusPos = function (L, k, f, s, noClamp) {
    var c = L.containingComp, a = MV.tr(L, "anchor").value, sc = k / 100;
    s = s || [c.width / 2, c.height / 2];
    var x = s[0] - (f[0] - a[0]) * sc, y = s[1] - (f[1] - a[1]) * sc;
    if (!noClamp) {
        x = Math.min(a[0] * sc, Math.max(c.width - (L.source.width - a[0]) * sc, x));
        y = Math.min(a[1] * sc, Math.max(c.height - (L.source.height - a[1]) * sc, y));
    }
    return [x, y];
};

// 左右反転 about a source point (default: the layer's anchor), as an effect so scale keys and punches keep working
MV.flip = function (L, about) {
    var a = about || MV.tr(L, "anchor").value, c = [a[0], a[1]];
    return MV.fx(L, "ADBE Geometry2", {"ADBE Geometry2-0001": c, "ADBE Geometry2-0002": c, "ADBE Geometry2-0011": 0, "ADBE Geometry2-0004": -100});
};
MV.negative = function (L) { return MV.fx(L, "ADBE Invert"); };
// palette swap / palette lock: highlights, midtones and shadows mapped to three colours; blend = % of the original kept
MV.tritone = function (L, hi, mid, lo, blend) {
    return MV.fx(L, "ADBE Tritone", {"ADBE Tritone-0001": hi.concat([1]), "ADBE Tritone-0002": mid.concat([1]),
                                       "ADBE Tritone-0003": lo.concat([1]), "ADBE Tritone-0004": blend || 0});
};
// カラーバランス (HLS): [hue degrees, lightness, saturation]
MV.hls = function (L, v) {
    return MV.fx(L, "ADBE Color Balance (HLS)", {"ADBE Color Balance (HLS)-0001": v[0] || 0, "ADBE Color Balance (HLS)-0002": v[1] || 0,
                                                  "ADBE Color Balance (HLS)-0003": v[2] || 0});
};

// 大量作成・隊列移動 (モーションタイル): cols x rows copies; o: {mirror, phase, slide: [px/s, px/s]}
MV.tile = function (L, cols, rows, o) {
    o = o || {};
    var e = MV.fx(L, "ADBE Tile", {"ADBE Tile-0002": 100 / (cols || 3), "ADBE Tile-0003": 100 / (rows || cols || 3),
                                     "ADBE Tile-0006": o.mirror ? 1 : 0, "ADBE Tile-0007": o.phase || 0});
    if (o.slide) MV.expr(MV.findProp(e, "ADBE Tile-0001"), "value + [" + o.slide[0] + ", " + (o.slide[1] || 0) + "] * time");
    return e;
};

// 四隅オブジェクト: two mirrors (the technique song's settings, scaled from a 1920x1080 layer to this one)
MV.mirror4 = function (L) {
    var w = L.source.width, h = L.source.height;
    MV.fx(L, "ADBE Mirror", {"ADBE Mirror-0001": [w, h / 2], "ADBE Mirror-0002": 90});
    return MV.fx(L, "ADBE Mirror", {"ADBE Mirror-0001": [w / 2, h / 2], "ADBE Mirror-0002": 0});
};

// 波紋の呼吸: AE's Ripple on a picture, phase = time * speed. o: {c: [x, y] layer px, r, w, h, speed, second: true adds a gentler
// ripple of the other type}
MV.ripple = function (L, o) {
    o = o || {};
    var cc = L.containingComp, c = o.c || [cc.width / 2, cc.height / 2], sp = o.speed || 180;
    var e = MV.fx(L, "ADBE Ripple", {"ADBE Ripple-0001": Math.min(100, o.r || 40), "ADBE Ripple-0002": c, "ADBE Ripple-0005": Math.min(100, o.w || 30), "ADBE Ripple-0006": o.h || 12});
    MV.expr(MV.findProp(e, "ADBE Ripple-0007"), "time * " + sp);
    if (o.second) {
        var e2 = MV.fx(L, "ADBE Ripple", {"ADBE Ripple-0001": (o.r || 40) * 0.6, "ADBE Ripple-0002": [c[0] * 0.7, c[1] * 1.05],
                                            "ADBE Ripple-0003": 2, "ADBE Ripple-0005": Math.min(100, (o.w || 30) * 1.6), "ADBE Ripple-0006": (o.h || 12) * 0.5});
        MV.expr(MV.findProp(e2, "ADBE Ripple-0007"), "time * " + (sp * 0.7));
    }
    return e;
};

// 雨粒の輪: thin rings opening flat (as on a puddle) from pos, one after another
MV.drop = function (comp, t, pos, o) {
    o = o || {};
    var n = o.rings || 3, size = o.size || 300, dur = o.dur || 1.1, sq = o.squash || 0.33, out = [];
    for (var i = 0; i < n; i++) {
        var ti = t + i * (o.gap || 0.13), k = 100 - i * 22;
        var L = MV.shape(comp, "ellipse", [size, size], {stroke: o.color || [1, 1, 1], strokeWidth: o.width || 3, pos: pos, name: "drop ring"});
        MV.span(L, ti, ti + dur);
        MV.keys(MV.tr(L, "scale"), [[ti, [6, 6 * sq]], [ti + dur, [k, k * sq]]], "out");
        MV.keys(MV.tr(L, "opacity"), [[ti, o.peak || 85], [ti + dur, 0]], "in");
        out.push(L);
    }
    return out;
};

// 余白に小さく置く / 目の形の窓: the picture shows only inside a shape. Returns {matte, border}
MV.windowOn = function (comp, L, kind, size, pos, o) {
    o = o || {};
    var m = MV.pathShape(comp, kind, size, {fill: [1, 1, 1], pos: pos, name: "window " + L.name});
    MV.span(m, L.inPoint, L.outPoint);
    m.moveBefore(L);
    MV.matte(L, m, "alpha");
    m.enabled = false;
    var out = {matte: m};
    if (o.border) {
        var bd = MV.pathShape(comp, kind, size, {stroke: o.border, strokeWidth: o.width || 6, pos: pos, name: "window border"});
        MV.span(bd, L.inPoint, L.outPoint);
        bd.moveBefore(L);
        out.border = bd;
    }
    return out;
};

// シルエットの中に別の絵: L shows only inside the alpha of a cut-out PNG. o: {h, pos, rim: colour drawn just outside}
MV.insideOf = function (comp, L, cutPath, o) {
    o = o || {};
    var pos = o.pos || [comp.width / 2, comp.height / 2];
    var cut = MV.layerFrom(comp, cutPath, {fit: "height", h: o.h || 0.9, pos: pos, name: "silhouette matte"});
    MV.span(cut, L.inPoint, L.outPoint);
    cut.moveBefore(L);
    MV.matte(L, cut, "alpha");
    cut.enabled = false;
    if (o.rim) {
        var rim = MV.layerFrom(comp, cutPath, {fit: "height", h: (o.h || 0.9) * 1.015, pos: pos, name: "silhouette rim"});
        MV.span(rim, L.inPoint, L.outPoint);
        MV.silhouette(rim, o.rim);
        rim.moveAfter(L);
    }
    return cut;
};

// a plain panel under a lyric at a given place (fx.box): it opens sideways (or downwards when vertical)
MV.box = function (comp, t, pos, size, o) {
    o = o || {};
    var L = MV.shape(comp, "rect", size || [600, 120], {fill: o.color || MV.hex("#0b1220"), pos: pos, name: "box"});
    var op = o.opacity !== undefined ? o.opacity : 80;
    MV.tr(L, "opacity").setValue(op);
    if (o.wipe === false) MV.keys(MV.tr(L, "opacity"), [[t, 0], [t + (o.dur || 0.25), op]], "out");
    else MV.keys(MV.tr(L, "scale"), [[t, o.vertical ? [100, 0] : [0, 100]], [t + (o.dur || 0.25), [100, 100]]], "out");
    return L;
};

// 色の統一: everything except one hue goes grey on an adjustment layer; then an optional hue turn.
// o: {keep: colour, amount (% of colour removed), tol, soft, hue, sat}
MV.unify = function (comp, o) {
    o = o || {};
    var L = MV.adjust(comp, "unify");
    MV.fx(L, "ADBE Leave Color", {"ADBE Leave Color-0001": o.amount !== undefined ? o.amount : 85,
                                   "ADBE Leave Color-0002": (o.keep || MV.hex("#e6d43c")).concat([1]),
                                   "ADBE Leave Color-0003": o.tol || 22, "ADBE Leave Color-0004": o.soft || 25,
                                   "ADBE Leave Color-0005": 2});       // match colours by hue
    if (o.hue) MV.hls(L, [o.hue, 0, o.sat || 0]);
    return L;
};

// finishing palette lock on an adjustment layer (mix = % of the three-colour map)
MV.tone = function (comp, o) {
    var L = MV.adjust(comp, "tone");
    MV.tritone(L, o.hi || [0.96, 0.95, 0.9], o.mid || [0.36, 0.42, 0.55], o.lo || [0.03, 0.04, 0.09], 100 - (o.mix === undefined ? 35 : o.mix));
    return L;
};

// ================================================================ v1.9: drawn rain, handwriting, wires as a staff, light, splashes
// For 雨粒パレード v5 (2026-11-12). The look plan keeps rain out of the generated pictures and draws it here; the accent
// words are written stroke by stroke in the hand of the jacket's title; one chorus line turns electric wires into a staff.
// Shape-layer gotcha: adding a property to a group can invalidate references to its siblings, so values are set right
// after each addProperty and anything needed later is looked up again by matchName.

MV.lit = function (v) {          // a number / array literal for expression code
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(MV.lit(v[i])); return "[" + a.join(",") + "]"; }
    return typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v);
};

MV.blendMode = function (L, name) {
    var m = {normal: BlendingMode.NORMAL, add: BlendingMode.ADD, screen: BlendingMode.SCREEN, multiply: BlendingMode.MULTIPLY,
             overlay: BlendingMode.OVERLAY, soft_light: BlendingMode.SOFT_LIGHT, hard_light: BlendingMode.HARD_LIGHT,
             lighten: BlendingMode.LIGHTEN, darken: BlendingMode.DARKEN, color_dodge: BlendingMode.COLOR_DODGE,
             linear_dodge: BlendingMode.LINEAR_DODGE, luminosity: BlendingMode.LUMINOSITY};
    var k = String(name).toLowerCase().replace(/[ \-]/g, "_");
    if (!m[k]) throw new Error("unknown blend mode: " + name);
    L.blendingMode = m[k];
    return L;
};

// a path through points; a turn sharper than `corner` degrees stays a corner, the rest are smoothed
MV.pathFrom = function (pts, closed, corner) {
    var s = new Shape(), n = pts.length, vin = [], vout = [], lim = Math.cos((corner || 55) * Math.PI / 180);
    for (var i = 0; i < n; i++) {
        var t = [0, 0], a = i > 0 ? pts[i - 1] : (closed ? pts[n - 1] : null), b = i < n - 1 ? pts[i + 1] : (closed ? pts[0] : null);
        if (a && b) {
            var ux = pts[i][0] - a[0], uy = pts[i][1] - a[1], vx = b[0] - pts[i][0], vy = b[1] - pts[i][1];
            var lu = Math.sqrt(ux * ux + uy * uy) || 1, lv = Math.sqrt(vx * vx + vy * vy) || 1;
            if ((ux * vx + uy * vy) / (lu * lv) > lim) {
                var dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(lu, lv) / 3 / dl;
                t = [dx * k, dy * k];
            }
        }
        vin.push([-t[0], -t[1]]);
        vout.push([t[0], t[1]]);
    }
    s.vertices = pts; s.inTangents = vin; s.outTangents = vout; s.closed = !!closed;
    return s;
};

// one pen stroke in shape layer L: a group with the path, Trim Paths and a round stroke. o: {width, color, opacity, corner,
// t0, t1 (Trim End 0 -> 100), s0, s1 (Trim Start 0 -> 100, a stroke that leaves), ease, taper: end taper on, name}
MV.penStroke = function (L, pts, o) {
    o = o || {};
    var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    if (o.name) g.name = o.name;
    var v = g.property("ADBE Vectors Group");
    v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(MV.pathFrom(pts, false, o.corner));
    v.addProperty("ADBE Vector Filter - Trim");
    var st = v.addProperty("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Color").setValue(o.color || [1, 1, 1]);
    st.property("ADBE Vector Stroke Width").setValue(o.width || 6);
    st.property("ADBE Vector Stroke Line Cap").setValue(2);
    st.property("ADBE Vector Stroke Line Join").setValue(2);
    if (o.opacity !== undefined) st.property("ADBE Vector Stroke Opacity").setValue(o.opacity);
    if (o.taper) {                    // AE 17+: thin out the stroke's end like a brush lifting (skipped when not there)
        try {
            var te = MV.findProp(st, "ADBE Vector Taper End Length"), tw = MV.findProp(st, "ADBE Vector Taper End Width");
            if (te && tw) { te.setValue(o.taper === true ? 35 : o.taper); tw.setValue(15); }
        } catch (e) {}
    }
    var tr = v.property("ADBE Vector Filter - Trim");
    if (o.t0 !== undefined) MV.keys(tr.property("ADBE Vector Trim End"), [[o.t0, 0], [o.t1, 100]], o.ease || "out");
    if (o.s0 !== undefined) MV.keys(v.property("ADBE Vector Filter - Trim").property("ADBE Vector Trim Start"), [[o.s0, 0], [o.s1, 100]], o.ease || "out");
    return g;
};

// 手書きで書く: a word as pen strokes, written stroke by stroke in writing order. word (hand.json): {chars: [{char, strokes:
// [[[x, y]...]...], drips: [[x, y, len]...]}], bbox: [x0, y0, x1, y1], lines: [[[x, y]...]...]} in its own units.
// o: {pos: screen point for the bbox centre, h: bbox height in px, width: pen px, color, times: [start of each character],
// durs: [seconds per character] | dur, drips (default on), dripDur, lines: {t, dur, width, opacity}, rough, ease, name}
// Returns {layer, end}.
MV.write = function (comp, word, o) {
    o = o || {};
    var b = word.bbox, k = (o.h || 300) / (b[3] - b[1]), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    function P(p) { return [(p[0] - cx) * k, (p[1] - cy) * k]; }
    function plen(pts) { var s = 0; for (var q = 1; q < pts.length; q++) s += Math.sqrt(Math.pow(pts[q][0] - pts[q - 1][0], 2) + Math.pow(pts[q][1] - pts[q - 1][1], 2)); return s; }
    var L = comp.layers.addShape();
    L.name = o.name || "write";
    MV.tr(L, "anchor").setValue([0, 0]);
    MV.tr(L, "position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
    var w = o.width || Math.max(2, (o.h || 300) * 0.03), col = o.color || [1, 1, 1], times = o.times || [0], end = 0, first = 1e9, c, i, j;
    for (c = 0; c < word.chars.length; c++) {
        var ch = word.chars[c], dc = o.durs ? o.durs[Math.min(c, o.durs.length - 1)] : (o.dur || 0.3);
        var tc = c < times.length ? times[c] : times[times.length - 1] + (c - times.length + 1) * dc;
        var strokes = [], tot = 0, acc = 0;
        for (i = 0; i < ch.strokes.length; i++) {
            var pts = [];
            for (j = 0; j < ch.strokes[i].length; j++) pts.push(P(ch.strokes[i][j]));
            var l = plen(pts) + w * 3;
            strokes.push([pts, l]);
            tot += l;
        }
        for (i = 0; i < strokes.length; i++) {
            var s0 = tc + dc * acc / tot, s1 = s0 + Math.max(dc * strokes[i][1] / tot * 0.8, comp.frameDuration * 2);
            MV.penStroke(L, strokes[i][0], {t0: s0, t1: s1, width: w, color: col, taper: o.taper === undefined ? true : o.taper,
                                            ease: o.ease, corner: o.corner, name: (ch["char"] || "") + " " + (i + 1)});
            acc += strokes[i][1];
        }
        first = Math.min(first, tc);
        end = Math.max(end, tc + dc);
        if (o.drips !== false && ch.drips) for (i = 0; i < ch.drips.length; i++) {
            var d = ch.drips[i], a0 = P([d[0], d[1]]), a1 = [a0[0], a0[1] + d[2] * k], td = tc + dc + 0.04 + 0.11 * i;
            var dd = (o.dripDur || 0.8) * (0.6 + Math.min(1, d[2] / 40));
            MV.penStroke(L, [a0, a1], {t0: td, t1: td + dd, width: w * 0.5, color: col, taper: 60, ease: "inout", name: "drip"});
            end = Math.max(end, td + dd);
        }
    }
    if (word.lines && o.lines) for (i = 0; i < word.lines.length; i++) {
        var lp = [];
        for (j = 0; j < word.lines[i].length; j++) lp.push(P(word.lines[i][j]));
        var lt = o.lines.t + i * (o.lines.gap || 0.12);
        MV.penStroke(L, lp, {t0: lt, t1: lt + (o.lines.dur || 0.5), width: o.lines.width || Math.max(1, w * 0.18), color: col,
                             opacity: o.lines.opacity || 70, ease: "out", name: "hairline"});
        end = Math.max(end, lt + (o.lines.dur || 0.5));
    }
    if (o.rough !== 0) MV.fx(L, "ADBE Roughen Edges", {"ADBE Roughen Edges-0002": o.rough || Math.max(0.8, w * 0.22),
                                                        "ADBE Roughen Edges-0005": 25, "ADBE Roughen Edges-0008": 3});
    if (first < 1e9) MV.setIn(L, Math.max(0, first - comp.frameDuration));
    return {layer: L, end: end};
};

// 雨 (drawn, not painted): Fractal Noise stretched into tall streaks, moving down, tinted, on Screen. o: {speed px/s, angle
// (lean in degrees), sw / sh (noise scale width / height), contrast, brightness, blur (directional, px), soft (gaussian),
// color, opacity, evolve (deg/s), seed, cover (layer size / comp size), name}. Three at different sizes and speeds = depth.
// Presets measured 2026-11-12 (fx_test.jsx, four sets on one picture): the first set (sw 12-36, brightness -110) drew
// streaks 10-15 px wide over a third of the frame; these draw 2-5 px streaks over a few percent. Checked between two
// frames: the streaks move down (about speed / fps px per frame) and lean with the angle.
MV.RAIN = {
    far:  {sw: 3,   sh: 90,  contrast: 600, brightness: -175, speed: 1300, blur: 10, soft: 0.6, opacity: 35, evolve: 260},
    mid:  {sw: 4.5, sh: 160, contrast: 600, brightness: -170, speed: 2200, blur: 18, soft: 0,   opacity: 45, evolve: 220},
    near: {sw: 8,   sh: 300, contrast: 560, brightness: -185, speed: 3400, blur: 34, soft: 1.5, opacity: 35, evolve: 180}
};
MV.rain = function (comp, o) {
    o = o || {};
    var pr = MV.RAIN[o.layer || "mid"] || MV.RAIN.mid, q = {}, key;
    for (key in pr) if (pr.hasOwnProperty(key)) q[key] = pr[key];
    for (key in o) if (o.hasOwnProperty(key) && o[key] !== undefined && o[key] !== null) q[key] = o[key];
    var cv = q.cover || 1.5, L = MV.solid(comp, [0, 0, 0], q.name || ("rain " + (o.layer || "mid")), Math.round(comp.width * cv), Math.round(comp.height * cv));
    var e = MV.fx(L, "ADBE Fractal Noise", {"ADBE Fractal Noise-0004": q.contrast, "ADBE Fractal Noise-0005": q.brightness,
                                             "ADBE Fractal Noise-0006": 1, "ADBE Fractal Noise-0009": 0,
                                             "ADBE Fractal Noise-0011": q.sw, "ADBE Fractal Noise-0012": q.sh,
                                             "ADBE Fractal Noise-0015": q.complexity || 1});
    MV.expr(MV.findProp(e, "ADBE Fractal Noise-0013"), "[value[0] + " + ((q.seed || 0) * 977) + ", value[1] + time * " + q.speed + "]");
    MV.expr(MV.findProp(e, "ADBE Fractal Noise-0023"), "time * " + q.evolve + " + " + ((q.seed || 0) * 131));
    MV.fx(L, "ADBE Tint", {"ADBE Tint-0001": [0, 0, 0, 1], "ADBE Tint-0002": (q.color || [0.88, 0.9, 0.97]).concat([1]), "ADBE Tint-0003": 100});
    if (q.blur) MV.fx(L, "ADBE Motion Blur", {"ADBE Motion Blur-0001": q.blurDir === undefined ? 0 : q.blurDir, "ADBE Motion Blur-0002": q.blur});
    if (q.soft) MV.blurFx(L, q.soft);
    L.blendingMode = BlendingMode.SCREEN;
    MV.tr(L, "rotation").setValue(q.angle === undefined ? 6 : q.angle);
    MV.tr(L, "opacity").setValue(q.opacity);
    return L;
};

// 電線の五線譜: wires drawn by expressions (a sag, a dip where a note lands that rings and settles, then moves left with the
// note), and notes (lyric characters) that fall onto them and flow left like a scrolling score.
// o: {ys: [y of each wire at the frame centre], slope, sag, x0, x1, flow (px/s), dipW (px), ring, color, width, opacity,
//     notes: [{t, wire, x, text, amp}] (x: where it lands), drops: [{t, wire, x, amp}] (drops without a letter),
//     font, size, fill, lift, fall, fallDur, bead, tIn, tOut, name}
// Returns {wires: [...], notes: [...], beads: [...]}
MV.staff = function (comp, o) {
    o = o || {};
    var ys = o.ys || [comp.height * 0.3, comp.height * 0.38, comp.height * 0.46, comp.height * 0.54, comp.height * 0.62];
    var x0 = o.x0 === undefined ? -100 : o.x0, x1 = o.x1 === undefined ? comp.width + 100 : o.x1, flow = o.flow === undefined ? 150 : o.flow;
    var notes = o.notes || [], drops = o.drops || [], out = {wires: [], notes: [], beads: []}, i, w;
    var tIn = o.tIn === undefined ? 0 : o.tIn, tOut = o.tOut === undefined ? comp.duration : o.tOut;
    function fn(wi) {
        var H = [], k;
        for (k = 0; k < notes.length; k++) if (notes[k].wire === wi) H.push([notes[k].t, notes[k].x, notes[k].amp || o.amp || 26]);
        for (k = 0; k < drops.length; k++) if (drops[k].wire === wi) H.push([drops[k].t, drops[k].x, drops[k].amp || (o.amp || 26) * 0.6]);
        return "function wy(x, tm) { var u = (x - " + MV.lit(x0) + ") / " + MV.lit(x1 - x0) + ", y = " + MV.lit(ys[wi]) + " + " + MV.lit(o.slope || 0) +
               " * (x - " + MV.lit(comp.width / 2) + ") + " + MV.lit(o.sag === undefined ? 40 : o.sag) + " * 4 * u * (1 - u); var H = " + MV.lit(H) + ";" +
               " for (var i = 0; i < H.length; i++) { var dt = tm - H[i][0]; if (dt < 0) continue; var hx = H[i][1] - " + MV.lit(flow) + " * dt," +
               " d = (x - hx) / " + MV.lit(o.dipW || 110) + "; y += H[i][2] * Math.exp(-d * d) * (0.3 + 0.7 * Math.exp(-5 * dt) * Math.cos(17 * dt));" +
               " y += H[i][2] * " + MV.lit(o.ring === undefined ? 0.25 : o.ring) + " * Math.exp(-2.5 * dt) * Math.sin((x - hx) / 70 - dt * 30) * 4 * u * (1 - u); }" +
               " return y; }";
    }
    for (w = 0; w < ys.length; w++) {
        var L = comp.layers.addShape();
        L.name = (o.name || "wire") + " " + (w + 1);
        MV.tr(L, "anchor").setValue([0, 0]);
        MV.tr(L, "position").setValue([0, 0]);
        var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"), v = g.property("ADBE Vectors Group");
        var pth = v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
        var st = v.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Color").setValue(o.color || [0.86, 0.88, 0.94]);
        st.property("ADBE Vector Stroke Width").setValue(o.width || 2.2);
        st.property("ADBE Vector Stroke Line Cap").setValue(2);
        MV.expr(L.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape"),
                fn(w) + " var N = 110, P = []; for (var i = 0; i <= N; i++) { var x = " + MV.lit(x0) + " + " + MV.lit(x1 - x0) +
                " * i / N; P.push([x, wy(x, time)]); } createPath(P, [], [], false);");
        MV.tr(L, "opacity").setValue(o.opacity || 85);
        MV.span(L, tIn, tOut);
        out.wires.push(L);
    }
    var size = o.size || 56, lift = o.lift === undefined ? size * 0.62 : o.lift, fall = o.fall || 260, fd = o.fallDur || 0.22;
    for (i = 0; i < notes.length; i++) {
        var nt = notes[i], f = fn(nt.wire);
        var bead = MV.shape(comp, "ellipse", [o.bead || 9, o.bead || 9], {fill: o.fill || [1, 1, 1], name: "bead"});
        MV.expr(MV.tr(bead, "position"), f + " var t = " + MV.lit(nt.t) + ", X = " + MV.lit(nt.x) + ";" +
                " if (time < t) { var q = (t - time) / " + MV.lit(fd) + "; [X, wy(X, t) - 5 - " + MV.lit(fall) + " * q * q]; }" +
                " else { var x = X - " + MV.lit(flow) + " * (time - t); [x, wy(x, time) - 5]; }");
        MV.span(bead, nt.t - fd, tOut);
        out.beads.push(bead);
        if (!nt.text) continue;
        var T = MV.text(comp, nt.text, {font: o.font, size: size, fill: o.fill || [1, 1, 1], hscale: o.hscale, name: "note " + nt.text});
        MV.expr(MV.tr(T, "position"), f + " var t = " + MV.lit(nt.t) + ", X = " + MV.lit(nt.x) + ";" +
                " if (time < t) { var q = (t - time) / " + MV.lit(fd) + "; [X, wy(X, t) - " + MV.lit(lift) + " - " + MV.lit(fall) + " * q * q]; }" +
                " else { var x = X - " + MV.lit(flow) + " * (time - t); [x, wy(x, time) - " + MV.lit(lift) + "]; }");
        MV.keys(MV.tr(T, "opacity"), [[nt.t - fd, 0], [nt.t - fd * 0.4, 100]], "linear");
        MV.span(T, nt.t - fd, tOut);
        out.notes.push(T);
    }
    for (i = 0; i < drops.length; i++) {          // drops without letters: a bead that falls, lands and slides off
        var dr = drops[i], fdr = fn(dr.wire), bd = MV.shape(comp, "ellipse", [(o.bead || 9) * 0.8, (o.bead || 9) * 0.8], {fill: o.fill || [1, 1, 1], name: "drop bead"});
        MV.expr(MV.tr(bd, "position"), fdr + " var t = " + MV.lit(dr.t) + ", X = " + MV.lit(dr.x) + ";" +
                " if (time < t) { var q = (t - time) / " + MV.lit(fd) + "; [X, wy(X, t) - 4 - " + MV.lit(fall) + " * q * q]; }" +
                " else { var x = X - " + MV.lit(flow) + " * (time - t); [x, wy(x, time) - 4]; }");
        MV.keys(MV.tr(bd, "opacity"), [[dr.t + 0.5, 100], [dr.t + 1.2, 0]], "linear");
        MV.span(bd, dr.t - fd, Math.min(tOut, dr.t + 1.25));
        out.beads.push(bd);
    }
    return out;
};

// 光が走る: a soft bright bar (a train's lit windows, headlights) sliding from `from` to `to` between t0 and t1, fading at both
// ends. o: {size: [w, h], angle, color, peak, blur, glow (a wider, dimmer second bar), ease}
MV.lightSweep = function (comp, t0, t1, from, to, o) {
    o = o || {};
    var out = [], sz = o.size || [520, 26], d = t1 - t0, list = o.glow === false ? [1] : [1, 3.2];
    for (var i = 0; i < list.length; i++) {
        var k = list[i], L = MV.shape(comp, "rect", [sz[0] * (i ? 1.4 : 1), sz[1] * k], {fill: o.color || [0.93, 0.95, 1], name: i ? "light glow" : "light"});
        MV.tr(L, "rotation").setValue(o.angle || 0);
        MV.blurFx(L, (o.blur || 14) * k);
        L.blendingMode = BlendingMode.ADD;
        MV.keys(MV.tr(L, "position"), [[t0, from], [t1, to]], o.ease || "linear");
        var pk = (o.peak || 85) / (i ? 2.6 : 1);
        MV.keys(MV.tr(L, "opacity"), [[t0, 0], [t0 + d * 0.18, pk], [t1 - d * 0.25, pk], [t1, 0]], "linear");
        MV.span(L, t0, t1);
        out.push(L);
    }
    return out;
};

// しぶき: short dashes flying out of a point (a drop hitting the canopy, the wire, a puddle). Each dash starts at r0 (default
// 35-60% of its r1, so the centre stays open). o: {n, r0, r1, width, color, dur,
// dir (deg, 0 = up), spread (deg), squash (vertical factor), opacity}
MV.splash = function (comp, t, pos, o) {
    o = o || {};
    var L = comp.layers.addShape(), n = o.n || 9, dur = o.dur || 0.38, sq = o.squash === undefined ? 1 : o.squash;
    L.name = "splash";
    MV.tr(L, "anchor").setValue([0, 0]);
    MV.tr(L, "position").setValue(pos);
    for (var i = 0; i < n; i++) {
        var a = ((o.dir || 0) + MV.rand(-0.5, 0.5) * (o.spread === undefined ? 150 : o.spread)) * Math.PI / 180;
        var r1 = (o.r1 || 80) * MV.rand(0.55, 1.1), r0 = o.r0 !== undefined ? o.r0 * MV.rand(0.6, 1.3) : r1 * MV.rand(0.35, 0.6), dt = MV.rand(0, 0.04);
        MV.penStroke(L, [[Math.sin(a) * r0, -Math.cos(a) * r0 * sq], [Math.sin(a) * r1, -Math.cos(a) * r1 * sq]],
                     {width: (o.width || 2.6) * MV.rand(0.6, 1.2), color: o.color || [0.94, 0.95, 1], t0: t + dt, t1: t + dt + dur * 0.4,
                      s0: t + dt + dur * 0.2, s1: t + dt + dur, name: "dash"});
    }
    if (o.opacity) MV.tr(L, "opacity").setValue(o.opacity);
    MV.span(L, t, t + dur + 0.08);
    return L;
};

// 手前の電柱: a dark, out-of-focus pole crossing the frame in front of everything. o: {x: [from, to] (or a number), w, color,
// blur, arm (crossbar at this y, or false), ease}
MV.pole = function (comp, t0, t1, o) {
    o = o || {};
    var w = o.w || 90, col = o.color || [0.035, 0.04, 0.07];
    var L = MV.shape(comp, "rect", [w, comp.height * 1.5], {fill: col, pos: [0, comp.height / 2], name: "pole"});
    if (o.arm !== false) {
        var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"), v = g.property("ADBE Vectors Group");
        var r = v.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue([w * 6.5, w * 0.42]);
        r.property("ADBE Vector Rect Position").setValue([w * 0.6, (o.arm || comp.height * 0.16) - comp.height / 2]);
        v.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(col);
    }
    MV.blurFx(L, o.blur === undefined ? 10 : o.blur);
    var xs = o.x instanceof Array ? o.x : [o.x === undefined ? comp.width * 0.3 : o.x, o.x === undefined ? comp.width * 0.3 : o.x];
    MV.keys(MV.tr(L, "position"), [[t0, [xs[0], comp.height / 2]], [t1, [xs[1], comp.height / 2]]], o.ease || "linear");
    MV.span(L, t0, t1);
    return L;
};

// 伝う雫: a drop sliding along a line (down a rib, down the vinyl), speeding up, with a faint trail behind it.
// o: {size, color, dur, trail (opacity, 0 = none)}
MV.slideDrop = function (comp, t, from, to, o) {
    o = o || {};
    var s = o.size || 14, dur = o.dur || 0.9, out = [];
    if (o.trail !== 0) {
        var tr = comp.layers.addShape();
        tr.name = "drop trail";
        MV.tr(tr, "anchor").setValue([0, 0]);
        MV.tr(tr, "position").setValue([0, 0]);
        MV.penStroke(tr, [from, to], {width: s * 0.32, color: o.color || [0.9, 0.92, 1], opacity: o.trail || 35, t0: t, t1: t + dur,
                                      s0: t + dur * 0.5, s1: t + dur + 0.8, ease: "in", name: "trail"});
        MV.span(tr, t, t + dur + 0.85);
        out.push(tr);
    }
    var L = MV.shape(comp, "ellipse", [s * 0.82, s], {fill: o.color || [0.9, 0.92, 1], stroke: [0.06, 0.07, 0.12], strokeWidth: 1.2, name: "sliding drop"});
    MV.keys(MV.tr(L, "position"), [[t, from], [t + dur, to]], "in");
    MV.keys(MV.tr(L, "opacity"), [[t, 0], [t + 0.08, 95], [t + dur, 95], [t + dur + 0.15, 0]], "linear");
    MV.span(L, t, t + dur + 0.16);
    out.push(L);
    return out;
};
