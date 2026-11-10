// cutout.jsx - Photoshop's own "Select Subject" cut-out (ps_script job), to compare with mv_cutout (anime-seg).
// params: {"images": ["C:\\...\\a.png", ...]}
// For each image it saves into the job folder: <name>_ps.psd (layer with an editable mask, for hand fixes)
// and <name>_ps_cut.png (transparent PNG with the mask applied).
(function () {
    var P = MVJOB.params || {}, out = MVJOB.outdir, res = [];
    var imgs = P.images || [];
    function sid(s) { return stringIDToTypeID(s); }
    function cid(s) { return charIDToTypeID(s); }
    for (var i = 0; i < imgs.length; i++) {
        var f = new File(imgs[i]), doc = null, entry = {image: f.fsName};
        try {
            doc = app.open(f);
            if (doc.activeLayer.isBackgroundLayer) doc.activeLayer.isBackgroundLayer = false;
            var t0 = new Date().getTime();
            var d = new ActionDescriptor();
            d.putBoolean(sid("sampleAllLayers"), false);
            executeAction(sid("autoCutout"), d, DialogModes.NO);          // Select > Subject
            var m = new ActionDescriptor(), r = new ActionReference();    // Layer mask > Reveal Selection
            m.putClass(cid("Nw  "), cid("Chnl"));
            r.putEnumerated(cid("Chnl"), cid("Chnl"), cid("Msk "));
            m.putReference(cid("At  "), r);
            m.putEnumerated(cid("Usng"), cid("UsrM"), cid("RvlS"));
            executeAction(cid("Mk  "), m, DialogModes.NO);
            entry.secs = (new Date().getTime() - t0) / 1000;
            var stem = decodeURI(f.name).replace(/\.[^.]+$/, "");
            var psd = new File(out + "/" + stem + "_ps.psd");
            var so = new PhotoshopSaveOptions();
            so.layers = true;
            doc.saveAs(psd, so, true);
            var png = new File(out + "/" + stem + "_ps_cut.png");
            var po = new PNGSaveOptions();
            po.compression = 6;
            doc.saveAs(png, po, true);
            entry.psd = psd.fsName;
            entry.png = png.fsName;
        } catch (e) {
            entry.error = String(e) + (e.line ? " (line " + e.line + ")" : "");
        }
        if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
        res.push(entry);
        mvlog(entry.error ? "failed " + entry.image + ": " + entry.error : "cut " + entry.image + " in " + entry.secs + "s");
    }
    MVJOB.result = res;
})();
