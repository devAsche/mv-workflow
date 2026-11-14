// build_kinetic.jsx - build a lyric-motion (文字PV) section in After Effects from a layer timeline in the job's params.
// The choreography (where every part is, when, with which ease) is computed outside AE (songs/<song>/v2/make_*.py) and only
// instantiated here, so the same timeline can be previewed in Python before an AE run. No lyrics live in this file.
//
// params = {
//   name, w, h, fps, dur, offset (song time at comp time 0; every t below is song time), audio, bg: [r, g, b],
//   fonts: {main: [...], latin: [...]},
//   camera: {zoom, pos: K3, poi: K3} (optional; layers with threeD: true see it),
//   layers: [layer, ...] bottom first,
//   finish: {vignette, feather, grade: {...}, tone: {...}},
//   stills: [t...], save, render: "h264" | null, stillMode: "queue"
// }
// K (a value that may move) = a plain value, or [[t, value, ease], ...]; ease (how the move LEAVING that key runs):
//   "out" (fast start, long settle), "in", "inout", "linear", "hold", "snap" (very fast start: the 初速最速 of lyric motion)
// layer = {name, kind: "solid" | "shape" | "text" | "image" | "null" | "adjust", t0, t1, parent: name, threeD, blend,
//          solid: {color, w, h},
//          shape: {groups: [{rings: [[[x, y]...]...], fill, stroke, sw, open, evenodd}], rect: {size, round}, ellipse: {size},
//                  fill, stroke, sw, trim: {start: K, end: K, offset: K}, dash: [len, gap]},
//          text: {str, font, size, fill, stroke, sw, tracking, hscale, vscale, vertical, justify: "left"|"center"|"right", leading,
//                 anchor: "center" | "baseline"},
//          image: {path, fit: [w, h]},
//          tr: {anchor, pos, scale, rot, rx, ry, opacity}  (each K),
//          fx: [{m: matchName, p: {propMatchName: K}}],
//          matte: {layer: name, kind: "alpha" | "alphaInv" | "luma" | "lumaInv"},
//          motionBlur: true}
(function () {
    var P = MVJOB.params, OFF = P.offset || 0, t0run = new Date().getTime();
    function T(t) { return t - OFF; }
    function out(name) { return MVJOB.outdir + "\\" + name; }
    function col(c) { return c === null || c === undefined ? c : (typeof c === "string" ? MV.hex(c) : c); }

    MV.newProject();
    if (P.stillMode) MV.STILL_MODE = P.stillMode;
    var QUEUE = MV.STILL_MODE === "queue";
    var comp = MV.comp(P.name || "MV_kinetic", P.w, P.h, P.dur, P.fps, col(P.bg) || [0, 0, 0]);
    comp.motionBlur = true;
    comp.shutterAngle = 180;
    var FONTS = {}, fontLog = {};
    for (var fk in P.fonts) if (P.fonts.hasOwnProperty(fk)) { FONTS[fk] = MV.pickFont(P.fonts[fk]); fontLog[fk] = FONTS[fk]; }
    function font(name) { return name ? (FONTS[name] !== undefined ? FONTS[name] : MV.pickFont([name])) : FONTS.main; }

    if (P.audio) {
        var au = comp.layers.add(MV.importFile(P.audio));
        au.startTime = -OFF;
        au.name = "audio";
    }

    // ------------------------------------------------------------ keys with an ease per key
    var EASE = {out: [95, 0.1], "in": [0.1, 95], inout: [75, 75], snap: [99, 0.1], soft: [60, 20]};
    function isKeys(v) { return v instanceof Array && v.length && v[0] instanceof Array && typeof v[0][0] === "number" &&
                                v[0].length >= 2 && (v[0].length === 3 || typeof v[0][2] !== "number" || v[0].length === 2) &&
                                (v[0][1] instanceof Array || typeof v[0][1] === "number" || typeof v[0][1] === "string"); }
    function conv(v, kind) { return kind === "color" ? col(v) : v; }
    function setK(prop, v, kind) {
        if (v === undefined || v === null) return;
        if (!(v instanceof Array && v.length && v[0] instanceof Array && v[0].length >= 2 && typeof v[0][0] === "number" &&
              (kind === "keys" || isKeys(v)))) { prop.setValue(conv(v, kind)); return; }
        var i, n = MV._dims(prop);
        for (i = 0; i < v.length; i++) prop.setValueAtTime(T(v[i][0]), conv(v[i][1], kind));
        var spatial = prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
        for (i = 0; i < v.length; i++) {
            var k = prop.nearestKeyIndex(T(v[i][0])), e = v[i][2] || "linear", prev = i > 0 ? (v[i - 1][2] || "linear") : e;
            if (spatial) { try { prop.setSpatialContinuousAtKey(k, false); prop.setSpatialAutoBezierAtKey(k, false);
                                 var z = n === 1 && prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? [0, 0, 0] :
                                         (prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? [0, 0, 0] : [0, 0]);
                                 prop.setSpatialTangentsAtKey(k, z, z); } catch (er) {} }
            var inType = prev === "hold" ? KeyframeInterpolationType.HOLD : (prev === "linear" ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER);
            var outType = e === "hold" ? KeyframeInterpolationType.HOLD : (e === "linear" ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER);
            prop.setInterpolationTypeAtKey(k, inType, outType);
            if (inType === KeyframeInterpolationType.BEZIER || outType === KeyframeInterpolationType.BEZIER) {
                var ie = EASE[prev] ? EASE[prev][1] : 33, oe = EASE[e] ? EASE[e][0] : 33;
                try { prop.setTemporalEaseAtKey(k, MV._ease(n, 0, Math.max(0.1, ie)), MV._ease(n, 0, Math.max(0.1, oe))); } catch (er) {}
            }
        }
    }

    // ------------------------------------------------------------ layers
    var BY = {}, made = [];
    function shapeLayer(o) {
        var L = comp.layers.addShape(), root = L.property("ADBE Root Vectors Group"), S = o.shape;
        MV.tr(L, "anchor").setValue([0, 0]);
        function addGroup(name) {
            var g = root.addProperty("ADBE Vector Group");
            g.name = name;
            return g.property("ADBE Vectors Group");
        }
        function paint(v, fill, stroke, sw, evenodd) {
            if (fill) {
                var f = v.addProperty("ADBE Vector Graphic - Fill");
                setK(f.property("ADBE Vector Fill Color"), fill, "color");
                if (evenodd) f.property("ADBE Vector Fill Rule").setValue(2);
            }
            if (stroke) {
                var s = v.addProperty("ADBE Vector Graphic - Stroke");
                setK(s.property("ADBE Vector Stroke Color"), stroke, "color");
                setK(s.property("ADBE Vector Stroke Width"), sw || 2);
                if (S.dash) {
                    var d = s.property("ADBE Vector Stroke Dashes");
                    d.addProperty("ADBE Vector Stroke Dash 1").setValue(S.dash[0]);
                    d.addProperty("ADBE Vector Stroke Gap 1").setValue(S.dash[1]);
                }
            }
        }
        var gi, v;
        if (S.rect) {
            v = addGroup("rect");
            var r = v.addProperty("ADBE Vector Shape - Rect");
            setK(r.property("ADBE Vector Rect Size"), S.rect.size);
            if (S.rect.round) r.property("ADBE Vector Rect Roundness").setValue(S.rect.round);
            paint(v, S.fill, S.stroke, S.sw);
        }
        if (S.ellipse) {
            v = addGroup("ellipse");
            setK(v.addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size"), S.ellipse.size);
            paint(v, S.fill, S.stroke, S.sw);
        }
        for (gi = 0; S.groups && gi < S.groups.length; gi++) {
            var G = S.groups[gi];
            v = addGroup("g" + gi);
            for (var ri = 0; ri < G.rings.length; ri++) {
                var sh = new Shape();
                sh.vertices = G.rings[ri];
                sh.closed = !G.open;
                v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
            }
            paint(v, G.fill === undefined ? S.fill : G.fill, G.stroke === undefined ? S.stroke : G.stroke, G.sw || S.sw, G.evenodd);
        }
        if (S.trim) {
            var tm = root.addProperty("ADBE Vector Filter - Trim");
            if (S.trim.start !== undefined) setK(tm.property("ADBE Vector Trim Start"), S.trim.start);
            if (S.trim.end !== undefined) setK(tm.property("ADBE Vector Trim End"), S.trim.end);
            if (S.trim.offset !== undefined) setK(tm.property("ADBE Vector Trim Offset"), S.trim.offset);
        }
        return L;
    }
    function textLayer(o) {
        var X = o.text, J = {left: ParagraphJustification.LEFT_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY};
        var L = MV.text(comp, X.str, {font: font(X.font), size: X.size, fill: col(X.fill) || [1, 1, 1], stroke: col(X.stroke),
                                      strokeWidth: X.sw, tracking: X.tracking, hscale: X.hscale, vscale: X.vscale, vertical: X.vertical,
                                      justify: J[X.justify] || ParagraphJustification.CENTER_JUSTIFY, leading: X.leading,
                                      noCenter: X.anchor === "baseline"});
        return L;
    }
    for (var i = 0; i < P.layers.length; i++) {
        var o = P.layers[i], L;
        if (o.kind === "solid") L = MV.solid(comp, col(o.solid.color), o.name, o.solid.w || comp.width, o.solid.h || comp.height);
        else if (o.kind === "adjust") { L = MV.solid(comp, [1, 1, 1], o.name); L.adjustmentLayer = true; }
        else if (o.kind === "null") L = comp.layers.addNull();
        else if (o.kind === "shape") L = shapeLayer(o);
        else if (o.kind === "text") L = textLayer(o);
        else if (o.kind === "image") {
            L = comp.layers.add(MV.importFile(o.image.path));
            if (o.image.fit) { var s = Math.max(o.image.fit[0] / L.source.width, o.image.fit[1] / L.source.height) * 100; L.transform.scale.setValue([s, s]); }
        }
        else throw new Error("unknown layer kind " + o.kind);
        L.name = o.name || (o.kind + i);
        if (o.threeD) L.threeDLayer = true;
        if (o.blend) { var B = {screen: BlendingMode.SCREEN, add: BlendingMode.ADD, multiply: BlendingMode.MULTIPLY, overlay: BlendingMode.OVERLAY,
                                soft_light: BlendingMode.SOFT_LIGHT, difference: BlendingMode.DIFFERENCE}; if (B[o.blend]) L.blendingMode = B[o.blend]; }
        var tr = o.tr || {};
        if (tr.anchor !== undefined) setK(MV.tr(L, "anchor"), tr.anchor);
        if (tr.pos !== undefined) setK(MV.tr(L, "position"), tr.pos);
        if (tr.scale !== undefined) setK(MV.tr(L, "scale"), tr.scale);
        if (tr.rot !== undefined) setK(L.threeDLayer ? L.property("ADBE Transform Group").property("ADBE Rotate Z") : MV.tr(L, "rotation"), tr.rot);
        if (tr.rx !== undefined) setK(L.property("ADBE Transform Group").property("ADBE Rotate X"), tr.rx);
        if (tr.ry !== undefined) setK(L.property("ADBE Transform Group").property("ADBE Rotate Y"), tr.ry);
        if (tr.opacity !== undefined) setK(MV.tr(L, "opacity"), tr.opacity);
        for (var fi = 0; o.fx && fi < o.fx.length; fi++) {
            var e = L.property("ADBE Effect Parade").addProperty(o.fx[fi].m);
            for (var pk in o.fx[fi].p) if (o.fx[fi].p.hasOwnProperty(pk)) {
                var pp = MV.findProp(e, pk);
                if (!pp) throw new Error(o.fx[fi].m + ": no property " + pk);
                setK(pp, o.fx[fi].p[pk], pp.propertyValueType === PropertyValueType.COLOR ? "color" : undefined);
            }
        }
        if (o.motionBlur) L.motionBlur = true;
        if (o.t0 !== undefined) L.inPoint = Math.max(0, T(o.t0));
        if (o.t1 !== undefined) L.outPoint = Math.min(comp.duration, T(o.t1));
        BY[L.name] = L;
        made.push([L, o]);
    }
    for (i = 0; i < made.length; i++) {
        var M = made[i];
        if (M[1].parent) { if (!BY[M[1].parent]) throw new Error("no parent " + M[1].parent); M[0].parent = BY[M[1].parent]; }
        if (M[1].matte) {
            var ml = BY[M[1].matte.layer];
            if (!ml) throw new Error("no matte layer " + M[1].matte.layer);
            MV.matte(M[0], ml, M[1].matte.kind || "alpha");
        }
    }
    if (P.camera) {
        var C = comp.layers.addCamera("cam", [comp.width / 2, comp.height / 2]);
        C.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(P.camera.zoom || 1867);
        if (P.camera.pos) setK(C.property("ADBE Transform Group").property("ADBE Position"), P.camera.pos);
        if (P.camera.poi) setK(C.property("ADBE Transform Group").property("ADBE Anchor Point"), P.camera.poi);
    }
    if (P.finish) {
        var F = P.finish;
        if (F.tone) MV.tone(comp, {hi: col(F.tone.hi), mid: col(F.tone.mid), lo: col(F.tone.lo), mix: F.tone.mix});
        if (F.vignette) MV.vignette(comp, F.vignette, F.feather);
        if (F.grade) MV.grade(comp, F.grade);
    }

    var res = {fonts: fontLog, layers: comp.numLayers, stills: []};
    for (i = 0; P.stills && i < P.stills.length; i++) {
        var st = P.stills[i], nm = "still_" + (i < 9 ? "0" : "") + (i + 1) + "_" + String(st).replace(".", "s") + ".png";
        res.stills.push(MV.still(comp, T(st), out(nm)));
    }
    if (P.render) res.render = MV.addRender(comp, out(comp.name + (P.render === "h264" ? ".mp4" : "")), P.render).file;
    if (QUEUE) {
        if (!P.save) throw new Error("stillMode queue needs params.save");
        res.project = MV.save(out(P.save));
        res.queued = app.project.renderQueue.numItems;
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } else if (P.save) res.project = MV.save(out(P.save));
    res.secs = Math.round((new Date().getTime() - t0run) / 1000);
    MVJOB.result = res;
})();
