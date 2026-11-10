// ping.jsx - smallest possible ae_script: proves that AE runs the script and that it may write files
// (the wrapper writes the done-file). Also reports the scripting-write preference as AE stores it.
(function () {
    var r = {version: app.version, language: app.isoLanguage, projectItems: app.project ? app.project.numItems : null};
    try { r.allow_file_write = app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY"); }
    catch (e) { r.allow_file_write = "unknown: " + e; }
    MVJOB.result = r;
    mvlog("ping ok");
})();
