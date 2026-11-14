// letters.jsx - Illustrator side of a song's lettering (作字), run by the runner's ai_script job.
// params = {svgs: ["C:\\...\\word.svg", ...], png: 600 (height of a preview PNG, 0 = none)}
// For every SVG (parts made by songs/<song>/v2/letter/make_letters.py): open it, save it as .ai (Illustrator CS6+
// format, editable) and export a PNG preview, all into MVJOB.outdir. Nothing is drawn by hand here.
(function () {
    var P = MVJOB.params, done = [];
    for (var i = 0; i < P.svgs.length; i++) {
        var f = new File(P.svgs[i]);
        if (!f.exists) throw new Error("no file " + f.fsName);
        var doc = app.open(f);
        var base = f.name.replace(/\.svg$/i, "");
        var ai = new File(MVJOB.outdir + "\\" + base + ".ai");
        var o = new IllustratorSaveOptions();
        o.pdfCompatible = true;
        doc.saveAs(ai, o);
        if (P.png) {
            var e = new ExportOptionsPNG24();
            e.transparency = true;
            e.artBoardClipping = true;
            e.antiAliasing = true;
            var h = doc.artboards[0].artboardRect;
            e.verticalScale = e.horizontalScale = Math.min(100, P.png / Math.abs(h[1] - h[3]) * 100);
            doc.exportFile(new File(MVJOB.outdir + "\\" + base + ".png"), ExportType.PNG24, e);
        }
        doc.close(SaveOptions.DONOTSAVECHANGES);
        done.push(base);
        mvlog("saved " + base);
    }
    MVJOB.result = {saved: done};
})();
