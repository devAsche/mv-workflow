# Illustrator job type for the autopilot runner (loaded by mv_jobs.register), v1.7 (2026-11-15, chosen by 凌さん).
#
#   ai_script  hands an ExtendScript (.jsx) to Illustrator through its COM interface (PowerShell, no extra packages),
#              the same way ps_script drives Photoshop: errors are caught, alerts are off, and a done-file (JSON) is
#              written into the job's output folder. Used for the lettering (作字) of a song: SVG parts made by a
#              script are saved as .ai (so they can be edited by hand in Illustrator), and an edited .ai is exported
#              back to SVG for After Effects (mv\ai\letters.jsx).
# The job clicks or types nothing on screen.
import glob, json, os, subprocess, time

R = None


def register(runner):
    global R
    R = runner
    return {"ai_script": h_ai_script}


AI_WRAPPER = r"""
var MVJOB = %(job)s;
var MVLOG = [];
function mvlog(s) { MVLOG.push(String(s)); }
function mvJSON(v) {
    var t = typeof v;
    if (v === null || t === "undefined") return "null";
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return '"' + v.replace(/[\\"]/g, function (c) { return "\\" + c; })
        .replace(/[\u0000-\u001f]/g, function (c) { return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4); }) + '"';
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(mvJSON(v[i])); return "[" + a.join(",") + "]"; }
    if (v instanceof File || v instanceof Folder) return mvJSON(v.fsName);
    var o = []; for (var k in v) if (v.hasOwnProperty(k)) o.push(mvJSON(k) + ":" + mvJSON(v[k])); return "{" + o.join(",") + "}";
}
(function () {
    var res = {ok: false, ai_version: app.version, started: new Date().toString()};
    var oldLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        if (MVJOB.script) $.evalFile(new File(MVJOB.script));
        res.ok = true;
        res.result = MVJOB.result === undefined ? null : MVJOB.result;
    } catch (e) {
        res.error = String(e) + (e.line ? " (line " + e.line + ")" : "") + (e.fileName ? " in " + e.fileName : "");
    }
    app.userInteractionLevel = oldLevel;
    res.log = MVLOG;
    res.finished = new Date().toString();
    var f = new File(MVJOB.done + ".tmp");
    f.encoding = "UTF-8";
    if (f.open("w")) { f.write(mvJSON(res)); f.close(); f.rename(MVJOB.done_name); }
})();
"""


def h_ai_script(ctx, j):
    """{"script": ".jsx path", "params": {...}, "timeout": 900, "collect": ["*.ai", "*.svg", "*.png"]}
    The script sees MVJOB.params, MVJOB.outdir and MVJOB.workdir, and may set MVJOB.result."""
    from mv_ae import _js
    script = R.safe_path(j["script"], must_exist=True)
    done = ctx.out("_ai_done.json")
    if os.path.exists(done):
        os.remove(done)
    job = {"id": j["id"], "script": script, "outdir": ctx.dir, "workdir": os.path.dirname(script),
           "params": j.get("params", {}), "done": done, "done_name": os.path.basename(done)}
    wrapper = ctx.out("_ai_wrapper.jsx")
    with open(wrapper, "w", encoding="utf-8-sig") as f:
        f.write(AI_WRAPPER % {"job": _js(job)})
    # COM: starts Illustrator if needed (the registered version), runs the file, returns when the script ends.
    ps_cmd = ("$ErrorActionPreference='Stop'; $a = New-Object -ComObject Illustrator.Application; "
              "[void]$a.DoJavaScriptFile('%s')" % wrapper.replace("'", "''"))
    ctx.log("RUN Illustrator COM DoJavaScriptFile", wrapper)
    pr = subprocess.Popen(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    t0, timeout = time.time(), j.get("timeout", 900)
    while not os.path.exists(done):
        if pr.poll() is not None and not os.path.exists(done):
            time.sleep(3)
            if not os.path.exists(done):
                raise RuntimeError("Illustrator did not run the script: " + pr.stdout.read().decode("cp932", "replace")[-1500:])
        if time.time() - t0 > timeout:
            raise TimeoutError(f"no answer from Illustrator after {timeout}s; check that Illustrator is not showing a dialog")
        time.sleep(2)
    time.sleep(0.5)
    res = json.load(open(done, encoding="utf-8-sig"))
    for line in res.get("log", []):
        ctx.log("AI:", line)
    for pat in j.get("collect", []):
        for p in sorted(glob.glob(os.path.join(ctx.dir, pat))):
            ctx.add(R.safe_path(p))
    if not res.get("ok"):
        raise RuntimeError("Illustrator script error: " + str(res.get("error")))
    return {"ai_version": res.get("ai_version"), "result": res.get("result"), "secs": int(time.time() - t0)}
