// diag_still.jsx - why does comp.saveFrameToPng not write? Three tiny stills, each timed:
// A: a solid only; B: plus the song's audio layer; C: plus one 3072x1728 picture. Also lists the open project's state.
(function () {
    var P = MVJOB.params, res = {steps: []};
    function still(comp, name) {
        var f = new File(MVJOB.outdir + "\\" + name), t0 = new Date().getTime(), ret = null, err = null;
        try { ret = comp.saveFrameToPng(0.5, f); } catch (e) { err = String(e); }
        var ok = MV.waitFile(f.fsName, P.wait || 90);
        res.steps.push({still: name, ok: ok, secs: (new Date().getTime() - t0) / 1000, returned: String(ret), error: err});
        mvlog(name + " ok=" + ok + " " + (new Date().getTime() - t0) / 1000 + "s ret=" + String(ret) + " err=" + err);
    }
    MV.newProject();
    var comp = MV.comp("MV_diag", 1920, 1080, 4, 30, [0, 0, 0]);
    MV.solid(comp, [0.2, 0.3, 0.5], "solid");
    still(comp, "diag_A_solid.png");
    if (P.audio) { var au = comp.layers.add(MV.importFile(P.audio)); au.startTime = -40; still(comp, "diag_B_audio.png"); }
    if (P.img) { MV.layerFrom(comp, P.img, {fit: "cover"}); still(comp, "diag_C_image.png"); }
    res.version = app.version;
    // leave nothing unsaved behind: the next build refuses to replace an unsaved project holding the song's audio
    app.project.save(new File(MVJOB.outdir + "\\diag_project.aep"));
    MVJOB.result = res;
})();
