// fx_test.jsx - try settings side by side: one small comp per variant (a picture plus the effect), every comp's stills queued
// for aerender (the runner's ae_render job on the saved project). Nothing renders inside AE.
// params = {w, h, fps, dur, save: "fx_test.aep", stills: [comp times],
//           variants: [{name, img, extra, dim, rain: [{layer, ...MV.rain options}, ...]}, ...]}
// Stills come out as <name>_t<time>_NNNNN.tif.
(function () {
    var P = MVJOB.params, res = {variants: []};
    MV.newProject();
    MV.STILL_MODE = "queue";
    for (var v = 0; v < P.variants.length; v++) {
        var V = P.variants[v], name = V.name || ("v" + v);
        var comp = MV.comp("MV_fx_" + name, P.w || 1920, P.h || 1080, P.dur || 3, P.fps || 30, [0, 0, 0]);
        if (V.img) {
            var L = MV.layerFrom(comp, V.img, {fit: "cover", extra: V.extra || 1});
            if (V.dim) MV.fx(L, "ADBE Exposure2", {"ADBE Exposure2-0003": V.dim});
        }
        for (var r = 0; V.rain && r < V.rain.length; r++) { MV._seed = 500 + r; MV.rain(comp, V.rain[r]); }
        var files = [];
        for (var s = 0; s < (P.stills || [1]).length; s++) {
            var t = (P.stills || [1])[s];
            files.push(MV.still(comp, t, MVJOB.outdir + "\\" + name + "_t" + String(t).replace(".", "s") + ".tif"));
        }
        res.variants.push({name: name, stills: files});
    }
    res.project = MV.save(MVJOB.outdir + "\\" + (P.save || "fx_test.aep"));
    res.queued = app.project.renderQueue.numItems;
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    MVJOB.result = res;
})();
