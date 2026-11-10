// ping.jsx - smallest possible ae_script: proves that AE runs the script and that it may write files
// (the wrapper writes the done-file). Also reports the scripting-write preference as AE stores it.
// With params.mark, it also leaves an empty comp in the project panel whose name says how the script
// arrived and what the preference is, so that a person can see it even when no file can be written.
(function () {
    var P = MVJOB.params || {};
    var r = {version: app.version, language: app.isoLanguage, projectItems: app.project ? app.project.numItems : null};
    try { r.allow_file_write = app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY"); }
    catch (e) { r.allow_file_write = "unknown: " + e; }
    if (P.mark) {
        var name = "MVテスト（消してOK） 渡し方=" + (MVJOB.launch || "r") + " 書き込み許可=" + r.allow_file_write;
        try { app.project.items.addComp(name, 320, 180, 1, 1, 30); r.mark = name; } catch (e2) { r.mark_error = String(e2); }
    }
    MVJOB.result = r;
    mvlog("ping ok");
})();
