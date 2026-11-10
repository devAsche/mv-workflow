// mvae.jsx - reusable parts for building MV compositions in After Effects (ExtendScript / ES3).
// Loaded by the runner's ae_script job before the build script. Everything lives in the MV object.
// Effects and properties are addressed by matchName, so the Japanese UI does not matter.

var MV = MV || {};

// ---------------------------------------------------------------- project
MV.newProject = function () {
    // Never throw away the user's work: refuse when the open project has unsaved changes.
    if (app.project && app.project.dirty && app.project.numItems > 0)
        throw new Error("After Effects has an unsaved project open; save or close it first");
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
