// mvae.jsx - reusable parts for building MV compositions in After Effects (ExtendScript / ES3).
// Loaded by the runner's ae_script job before the build script. Everything lives in the MV object.
// Effects and properties are addressed by matchName, so the Japanese UI does not matter.

var MV = MV || {};

// ---------------------------------------------------------------- project
MV.newProject = function () {
    // Never throw away the user's work: refuse when the open project has unsaved changes, unless everything in
    // it was made by these scripts (test comps named "MVテスト…", or a project the scripts saved under outbox).
    var p = app.project;
    if (p && p.dirty && p.numItems > 0) {
        var ours = p.file && /[\\\/]autopilot[\\\/]outbox[\\\/]/i.test(p.file.fsName);
        if (!ours) {
            ours = true;
            for (var i = 1; i <= p.numItems; i++) if (p.item(i).name.indexOf("MVテスト") !== 0) { ours = false; break; }
        }
        if (!ours) throw new Error("After Effects has an unsaved project open; save or close it first");
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
    if (o.hscale) d.horizontalScale = o.hscale;          // 文字幅 (1 = 100%)
    if (o.vscale) d.verticalScale = o.vscale;
    if (o.justify) d.justification = o.justify;          // ParagraphJustification.CENTER_JUSTIFY etc.
    else d.justification = ParagraphJustification.CENTER_JUSTIFY;
    if (o.vertical) { try { d.lineOrientation = LineOrientation.VERTICAL_RIGHT_TO_LEFT; } catch (e) {} }
    tp.setValue(d);
    MV.centerAnchor(L);
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

// Add a render-queue item. kind "png": PNG sequence; "h264": AE's built-in H.264; "lossless": the default.
MV.addRender = function (comp, outPath, kind) {
    var rq = app.project.renderQueue.items.add(comp);
    var om = rq.outputModule(1);
    var words = {png: ["PNG"], h264: ["H.264"]}[kind];
    if (words) {
        var t = MV.findTemplate(om.templates, words);
        if (!t) throw new Error("no output-module template with " + words.join(" ") + " in: " + om.templates.join(" | "));
        om.applyTemplate(t);
    }
    var f = new File(outPath);
    if (!f.parent.exists) f.parent.create();
    om.file = f;
    return rq;
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
    var s = MV.tr(L, "scale"), v = s.value, k = big || 400;
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

// letters fly in one by one from random directions (A: "TAバラバラ" / B: 1文字ずつアニメーション)
MV.scatterIn = function (L, t, dur, o) {
    o = o || {};
    var c = L.containingComp;
    var a = MV.animator(L, {position: [0, 0, 0], rotation: 0, scale: [100, 100, 100], opacity: 0}, {random: true, shape: "rampUp", basedOn: "chars"});
    MV.expr(a.props.position, "seedRandom(textIndex, true); [random(-1,1), random(-1,1), 0] * " + (o.dist || c.width * 0.4));
    MV.expr(a.props.rotation, "seedRandom(textIndex + 99, true); random(-1,1) * " + (o.rot || 120));
    a.props.scale.setValue(o.scale || [260, 260, 100]);
    MV.keys(a.end, [[t, 100], [t + (dur || 0.5), 0]], "out");
    a.start.setValue(0);
    // the selector covers 0..end; shrinking end releases the letters into place in random order
    return a;
};

// ノイズでグシャぁ: letters break apart (jitter, tilt, blur, fade) in random order
MV.crumbleOut = function (L, t, dur, o) {
    o = o || {};
    var a = MV.animator(L, {position: [0, 0, 0], rotation: 0, blur: [0, 0], opacity: 0}, {random: true, basedOn: "chars"});
    MV.expr(a.props.position, "seedRandom(textIndex, true); [random(-1,1)*" + (o.spread || 120) + ", random(0.2,1)*" + (o.fall || 260) + ", 0]");
    MV.expr(a.props.rotation, "seedRandom(textIndex + 7, true); random(-1,1) * 90");
    a.props.blur.setValue(o.blur || [18, 18]);
    MV.keys(a.end, [[t, 0], [t + (dur || 0.6), 100]], "in");
    return a;
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
