// build_jz.jsx - build a lyric section with the JIZURA engine (mvjz_core.jsx = JIZURA + mv_jz_ext.jsx) from an MVJZ spec.
// Runs as an ae_script job (mvae.jsx is loaded first). The cut table, timing and parts come from the spec, which is made
// outside AE (tools/jz_spec.py) and checked with tools/jz_dryrun.js before the job is sent. No lyrics live in this file.
//
// params = {
//   core: "C:\\AI model\\autopilot\\mv\\ae\\jz\\mvjz_core.jsx",
//   spec: {...} | spec_file: "...\\spec.json" (UTF-8),
//   name: "MV_jz_test" (main comp name), light: false (JIZURA's light build: no ghosts / paper / bloom / grain),
//   audio: "...wav" (optional), audio_start: comp time where the audio file starts (a section built with offset o: -o),
//   stills: [t, ...] (comp times), stillMode: "queue" (TIFF items for aerender) | "png",
//   render: null | "h264", save: "name.aep" (in the job's output folder), plan_out: true (writes plan.json next to it)
// }
(function () {
    var P = MVJOB.params, t0 = new Date().getTime();
    function out(n) { return MVJOB.outdir + "\\" + n; }
    function readText(path) {
        var f = new File(path);
        if (!f.exists) throw new Error("not found: " + path);
        f.encoding = "UTF-8";
        if (!f.open("r")) throw new Error("cannot open: " + path);
        var s = f.read(); f.close();
        return s;
    }
    function writeText(path, s) {
        var f = new File(path);
        f.encoding = "UTF-8";
        if (!f.open("w")) throw new Error("cannot write: " + path);
        f.write(s); f.close();
        return f.fsName;
    }

    MV.newProject();
    if (P.stillMode) MV.STILL_MODE = P.stillMode;
    if (!P.core) throw new Error("params.core (mvjz_core.jsx) is required");
    $.evalFile(new File(P.core));
    if (!$.global.MVJZ) throw new Error("MVJZ did not load from " + P.core);
    var spec = P.spec || MVJZ.parse(readText(P.spec_file));
    mvlog("MVJZ " + MVJZ.version + " / JIZURA " + MVJZ.jizura + ", " + spec.cuts.length + " cuts");

    var opt = { light: !!P.light };
    if (P.audio) { opt.audioItem = MV.importFile(P.audio); opt.audioStart = P.audio_start || 0; }
    var res = MVJZ.run(spec, opt);
    var comp = res.comp;
    comp.name = P.name || "MV_jz";
    mvlog("built in " + Math.round((new Date().getTime() - t0) / 1000) + " s: " + res.plan.cuts.length + " cuts, " + res.images + " images");

    var stills = [], i;
    for (i = 0; i < (P.stills || []).length; i++) {
        var t = P.stills[i], nm = "still_" + ("0000" + Math.round(t * 100)).slice(-5) + ".png";
        stills.push(MV.still(comp, t, out(nm)));
    }
    var render = null;
    if (P.render) render = MV.addRender(comp, out(comp.name + (P.render === "h264" ? ".mp4" : "")), P.render).file;
    var planPath = null;
    if (P.plan_out !== false) planPath = writeText(out("plan.json"), mvJSON(res.plan));
    var aep = MV.save(out(P.save || comp.name + ".aep"));

    var cuts = [];
    for (i = 0; i < res.plan.cuts.length; i++) {
        var c = res.plan.cuts[i], d = [];
        for (var q = 0; q < (c.decor || []).length; q++) d.push(c.decor[q].id);
        cuts.push([Math.round(c.start * 1000) / 1000, Math.round(c.end * 1000) / 1000, c.layout, c.enter, c.exit, c.hold, c.cam, c.trans || "", c.treat || "", c.bg || "", d.join("+"), c.mvSync || "", c.mvImage ? 1 : 0]);
    }
    MVJOB.result = { aep: aep, comp: comp.name, stills: stills, render: render, plan: planPath, images: res.images,
        cuts: cuts, cut_columns: "start end layout enter exit hold cam trans treat bg decor sync image",
        plan_notes: res.planLog, build_log: res.log, fallbacks: res.fallbacks, fallback_keys: res.fallbackKeys, missing_fonts: res.missingFonts,
        secs: Math.round((new Date().getTime() - t0) / 1000) };
})();
