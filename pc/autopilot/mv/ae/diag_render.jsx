// diag_render.jsx - does AE render anything at all? (2026-11-12: saveFrameToPng and a one-frame render-queue TIFF both
// returned without writing a file). On a plain solid comp it tries: A render-queue TIFF, B render-queue H.264 (1 s),
// C saveFrameToPng. For each it records the queue item's status before/after, the output path AE kept, the time taken,
// and every error AE reported through app.onError. It also copies the cache lines of AE's preference files.
(function () {
    var P = MVJOB.params, res = {steps: [], errors: [], version: app.version};
    app.onError = function (msg, sev) { res.errors.push({msg: String(msg), severity: String(sev), at: new Date().toString()}); };
    var ST = {};
    try { for (var k in RQItemStatus) ST[RQItemStatus[k]] = k; } catch (e) {}
    function st(it) { try { return ST[it.status] || String(it.status); } catch (e) { return "?" + e; } }
    function files(dir, mask) { var g = new Folder(dir).getFiles(mask), out = []; for (var i = 0; i < g.length; i++) out.push(g[i].name + " " + g[i].length); return out; }

    MV.newProject();
    var comp = MV.comp("MV_diag_render", 1920, 1080, 2, 30, [0, 0, 0]);
    MV.solid(comp, [0.2, 0.3, 0.5], "solid");

    function rqTry(label, words, fileName, span) {
        var s = {step: label}, t0 = new Date().getTime();
        try {
            var rq = app.project.renderQueue;
            for (var i = 1; i <= rq.numItems; i++) { try { if (rq.item(i).status === RQItemStatus.QUEUED) rq.item(i).render = false; } catch (e) {} }
            var it = rq.items.add(comp);
            it.timeSpanStart = 0.5;
            it.timeSpanDuration = span;
            var om = it.outputModule(1);
            s.templates = om.templates.join(" | ");
            s.template = MV.findTemplate(om.templates, words);
            if (s.template) om.applyTemplate(s.template);
            om.file = new File(MVJOB.outdir + "\\" + fileName);
            s.file_kept = om.file ? om.file.fsName : null;
            s.status_before = st(it);
            s.items_in_queue = rq.numItems;
            rq.render();
            s.status_after = st(it);
            try { s.elapsed = it.elapsedSeconds; } catch (e) {}
        } catch (e) { s.error = String(e) + " line " + e.line; }
        s.secs = (new Date().getTime() - t0) / 1000;
        s.files = files(MVJOB.outdir, fileName.replace(/\[#+\]/, "*").replace(/\.[^.]*$/, ".*"));
        res.steps.push(s);
        mvlog(label + ": " + s.status_before + " -> " + s.status_after + ", " + s.secs + "s, files " + s.files.join(",") + (s.error ? ", " + s.error : ""));
    }
    rqTry("A_rq_tiff", ["TIFF"], "diag_A_[#####].tif", comp.frameDuration);
    rqTry("B_rq_h264", ["H.264"], "diag_B.mp4", 1);

    var c = {step: "C_saveFrameToPng"}, t0 = new Date().getTime(), f = new File(MVJOB.outdir + "\\diag_C.png");
    try { c.returned = String(comp.saveFrameToPng(0.5, f)); } catch (e) { c.error = String(e); }
    c.ok = MV.waitFile(f.fsName, P.wait || 20);
    c.secs = (new Date().getTime() - t0) / 1000;
    res.steps.push(c);
    mvlog("C_saveFrameToPng ok=" + c.ok + " " + c.secs + "s");

    // AE's own preference files: only the lines that mention the cache (folder, size, on/off)
    res.prefs = [];
    try {
        var pd = new Folder(Folder.userData.fsName + "\\Adobe\\After Effects");
        var vers = pd.getFiles(), i, j;
        for (i = 0; i < vers.length; i++) {
            if (!(vers[i] instanceof Folder)) continue;
            var txt = vers[i].getFiles("*.txt");
            for (j = 0; j < txt.length; j++) {
                var fh = txt[j];
                if (!fh.open("r")) continue;
                fh.encoding = "UTF-8";
                var n = 0, line;
                while (!fh.eof && n < 40) { line = fh.readln(); if (/cache/i.test(line)) { res.prefs.push(vers[i].name + "/" + fh.name + ": " + line.substr(0, 300)); n++; } }
                fh.close();
            }
        }
    } catch (e) { res.prefs.push("error " + e); }

    app.onError = null;
    app.project.save(new File(MVJOB.outdir + "\\diag_render_project.aep"));
    MVJOB.result = res;
})();
