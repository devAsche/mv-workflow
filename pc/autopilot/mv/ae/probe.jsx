// probe.jsx - first check of the After Effects automation (ae_script job).
// Reports AE's version and language, whether the MV fonts are visible, the localised render templates,
// and the property tree (matchNames) of every built-in effect, so that build scripts can address them.
// Then builds a 3-second test comp, writes one still, saves a test .aep and queues two renders.
(function () {
    var P = MVJOB.params || {};
    var out = MVJOB.outdir;
    var R = {version: app.version, buildName: app.buildName, language: app.isoLanguage};

    function writeJSON(name, obj) {
        var f = new File(out + "/" + name);
        f.encoding = "UTF-8";
        f.open("w"); f.write(mvJSON(obj)); f.close();
        return f.fsName;
    }

    // fonts the build scripts will ask for
    R.fonts = {};
    var fams = P.fonts || [];
    for (var i = 0; i < fams.length; i++) {
        var ps = null;
        try {
            var hits = app.fonts.getFontsByFamilyNameAndStyleName(fams[i][0], fams[i][1] || "Regular");
            if (hits && hits.length) ps = hits[0].postScriptName;
        } catch (e) { ps = "font API missing: " + e; }
        R.fonts[fams[i].join(" / ")] = ps;
    }

    MV.newProject();
    var comp = MV.comp("MV_probe", 1920, 1080, 3, 30, [0.05, 0.06, 0.1]);

    // effect list and property trees (built-in Adobe and Cycore effects only)
    function dump(group, depth) {
        var a = [];
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i), e = {n: p.name, m: p.matchName};
            if (p.propertyType === PropertyType.PROPERTY) {
                e.t = p.propertyValueType;
                try { var v = p.value; if (typeof v !== "object" || v instanceof Array) e.v = v; } catch (x) {}
            } else if (depth < 4) e.c = dump(p, depth + 1);
            a.push(e);
        }
        return a;
    }
    // one grey solid receives each effect in turn; if AE invalidates it after a failed add, make a new one
    var solid = null;
    function freshSolid() {
        try { if (solid) solid.remove(); } catch (x) {}
        solid = MV.solid(comp, [0.5, 0.5, 0.5], "fx probe");
    }
    freshSolid();
    var effects = [], trees = {}, failed = [];
    for (i = 0; i < app.effects.length; i++) {
        var ef = app.effects[i];
        effects.push([ef.matchName, ef.displayName, ef.category]);
        if (!/^(ADBE |CC |APC )/.test(ef.matchName) || ef.category === "") continue;
        if (P.skip_trees) continue;
        // effects that open a window when applied (seen 2026-11-10: Apply Color LUT, Basic Text) or start an analysis
        if (/LUT|Stabiliz|Tracker|Roto|Refine|Content|Keylight|Basic Text|Path Text|Numbers/i.test(ef.matchName + " " + ef.displayName)) continue;
        try {
            var added = solid.property("ADBE Effect Parade").addProperty(ef.matchName);
            trees[ef.matchName] = {name: ef.displayName, category: ef.category, props: dump(added, 0)};
            added.remove();
        } catch (e) {
            failed.push(ef.matchName + ": " + String(e));
            try { freshSolid(); } catch (e2) { failed.push("new solid failed: " + String(e2)); }
        }
    }
    try { solid.remove(); } catch (x) {}
    R.effects = effects.length;
    R.effect_trees = writeJSON("effects_dump.json", {effects: effects, trees: trees, failed: failed});

    // small comp: background, a big text line, a still
    var bg = MV.solid(comp, MV.hex("#1b2333"), "bg");
    var font = P.font_ps || "DelaGothicOne-Regular";
    var t = MV.text(comp, P.text || "雨粒パレード", {font: font, size: 220, fill: [1, 1, 1], tracking: 40});
    var an = MV.animator(t, {tracking: -60, opacity: 0}, {shape: "rampUp", basedOn: "chars"});
    MV.keys(an.start, [[0, 0], [1.0, 100]], "out");
    R.text_font_after_set = t.property("ADBE Text Properties").property("ADBE Text Document").value.font;
    R.still = MV.still(comp, 2.0, out + "/probe_still.png");

    // render templates as this AE names them
    var rq = MV.addRender(comp, out + "/probe_h264", "h264");
    R.om_templates = rq.outputModule(1).templates;
    R.rs_templates = rq.templates;
    var rq2 = MV.addRender(comp, out + "/png/probe_[#####].png", "png");
    R.om_png = rq2.outputModule(1).name;
    R.aep = MV.save(out + "/probe.aep");
    R.render_queue = app.project.renderQueue.numItems;
    MVJOB.result = R;
    mvlog("probe done: AE " + app.version + ", " + effects.length + " effects, font set to " + R.text_font_after_set);
})();
