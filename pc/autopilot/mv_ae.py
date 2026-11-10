# After Effects job types for the autopilot runner (loaded by mv_jobs.register).
#
#   ae_script  hands an ExtendScript (.jsx) to After Effects with `AfterFX.exe -r`. If AE is
#              already open the script goes to that window; otherwise AE starts and runs it.
#              The script is wrapped so that errors are caught, dialogs are suppressed, and a
#              done-file (JSON) is written into the job's output folder. The runner waits for
#              that file instead of the AfterFX.exe process, which may keep running as AE itself.
#   ae_status  read-only report: is AE running, which windows and dialog texts it shows (v1.6).
#   ae_render  renders a saved .aep with aerender.exe (AE's own headless renderer), then can
#              encode a PNG sequence to mp4 with ffmpeg.
#
# Neither job clicks or types anything on screen. The scripts are written by Claude into
# C:\AI model\autopilot\work\mv\ae\... and committed to git (devAsche/mv-workflow) as the
# reusable parts in mv\ae\mvae.jsx.
import glob, json, os, subprocess, time

R = None


def register(runner):
    global R
    R = runner
    return {"ae_script": h_ae_script, "ae_render": h_ae_render, "ae_status": h_ae_status}


def _afterfx():
    exe = R.CFG.get("afterfx_exe")
    if exe and os.path.exists(exe):
        return exe
    found = sorted(glob.glob(r"C:\Program Files\Adobe\Adobe After Effects *\Support Files\AfterFX.exe"))
    if not found:
        raise FileNotFoundError("AfterFX.exe not found; set afterfx_exe in config.json")
    return found[-1]          # newest year sorts last


def _aerender():
    exe = R.CFG.get("aerender_exe") or os.path.join(os.path.dirname(_afterfx()), "aerender.exe")
    if not os.path.exists(exe):
        raise FileNotFoundError(exe)
    return exe


def _ae_windows(limit=12):
    """Read-only look at After Effects' open windows (titles, and the text of any dialog), so that a timeout
    can say what AE is waiting for. Nothing is clicked or typed."""
    import csv, ctypes, io
    from ctypes import wintypes
    try:
        out = subprocess.run(["tasklist", "/FO", "CSV", "/NH", "/FI", "IMAGENAME eq AfterFX.exe"],
                             capture_output=True, timeout=20).stdout.decode("cp932", "replace")
        pids = {int(r[1]) for r in csv.reader(io.StringIO(out)) if len(r) > 1 and r[1].isdigit()}
    except Exception as e:
        return {"error": f"tasklist failed: {e}"}
    if not pids:
        return {"afterfx_running": False}
    u = ctypes.WinDLL("user32", use_last_error=True)        # own handle, so argtypes do not leak elsewhere
    proto = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    u.EnumWindows.argtypes = [proto, wintypes.LPARAM]
    u.EnumChildWindows.argtypes = [wintypes.HWND, proto, wintypes.LPARAM]
    u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    u.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    u.IsWindowVisible.argtypes = [wintypes.HWND]

    def text(h):
        n = u.GetWindowTextLengthW(h)
        b = ctypes.create_unicode_buffer(min(n, 2000) + 1)
        u.GetWindowTextW(h, b, len(b))
        return b.value

    def cls(h):
        b = ctypes.create_unicode_buffer(128)
        u.GetClassNameW(h, b, 128)
        return b.value

    wins = []

    def each(h, _):
        pid = wintypes.DWORD()
        u.GetWindowThreadProcessId(h, ctypes.byref(pid))
        if pid.value in pids and u.IsWindowVisible(h) and len(wins) < limit:
            w = {"title": text(h), "class": cls(h)}
            kids = []

            def child(c, _):
                t = text(c)
                if t and len(kids) < 20:
                    kids.append(t)
                return True
            u.EnumChildWindows(h, proto(child), 0)
            if kids:
                w["texts"] = kids
            wins.append(w)
        return True
    u.EnumWindows(proto(each), 0)
    return {"afterfx_running": True, "pids": sorted(pids), "windows": wins}


def _js(v):
    """Python value -> ExtendScript literal (ES3 has no JSON object, but JSON text is a valid literal)."""
    return json.dumps(v, ensure_ascii=False)


WRAPPER = r"""
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
    var res = {ok: false, ae_version: app.version, started: new Date().toString()};
    app.beginSuppressDialogs();
    try {
        if (MVJOB.lib) $.evalFile(new File(MVJOB.lib));
        if (MVJOB.script) $.evalFile(new File(MVJOB.script));
        res.ok = true;
        res.result = MVJOB.result === undefined ? null : MVJOB.result;
    } catch (e) {
        res.error = String(e) + (e.line ? " (line " + e.line + ")" : "") + (e.fileName ? " in " + e.fileName : "");
    }
    try { app.endSuppressDialogs(false); } catch (e2) {}
    res.log = MVLOG;
    res.finished = new Date().toString();
    var f = new File(MVJOB.done + ".tmp");
    f.encoding = "UTF-8";
    if (f.open("w")) { f.write(mvJSON(res)); f.close(); f.rename(MVJOB.done_name); }
    if (MVJOB.quit_after) app.quit();
})();
"""


def h_ae_script(ctx, j):
    """{"script": ".jsx path", "params": {...}, "timeout": 900, "collect": ["*.png", "*.aep"], "quit_after": false}
    The script sees MVJOB.params, MVJOB.outdir (this job's output folder), MVJOB.workdir (the script's folder),
    and may set MVJOB.result (returned in the job result). mv\\ae\\mvae.jsx is loaded first unless "lib": false."""
    script = R.safe_path(j["script"], must_exist=True) if j.get("script") else None
    lib = os.path.join(R.ROOT, "mv", "ae", "mvae.jsx")
    done = ctx.out("_ae_done.json")
    if os.path.exists(done):
        os.remove(done)
    job = {"id": j["id"], "script": script, "lib": lib if (j.get("lib", True) and os.path.exists(lib)) else None,
           "outdir": ctx.dir, "workdir": os.path.dirname(script) if script else ctx.dir,
           "params": j.get("params", {}), "done": done, "done_name": os.path.basename(done), "quit_after": bool(j.get("quit_after"))}
    wrapper = ctx.out("_ae_wrapper.jsx")
    with open(wrapper, "w", encoding="utf-8-sig") as f:      # BOM: ExtendScript then reads the file as UTF-8
        f.write(WRAPPER % {"job": _js(job)})
    exe = _afterfx()
    ctx.log("RUN", f'"{exe}" -r "{wrapper}"')
    pr = subprocess.Popen([exe, "-r", wrapper], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0, timeout = time.time(), j.get("timeout", 900)
    while not os.path.exists(done):
        if time.time() - t0 > timeout:
            seen = _ae_windows()
            ctx.log("AE windows:", json.dumps(seen, ensure_ascii=False))
            json.dump(seen, open(ctx.out("_ae_windows.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            ctx.add(ctx.out("_ae_windows.json"))
            raise TimeoutError(
                f"no answer from After Effects after {timeout}s. Check that AE is not showing a dialog, and that "
                "Edit > Preferences > Scripting & Expressions > 'Allow Scripts to Write Files and Access Network' is on. "
                "AE windows: " + json.dumps(seen, ensure_ascii=False)[:1500])
        time.sleep(2)
    time.sleep(0.5)
    res = json.load(open(done, encoding="utf-8-sig"))
    for line in res.get("log", []):
        ctx.log("AE:", line)
    ctx.log(f"AfterFX launcher {'still running (this is AE itself)' if pr.poll() is None else 'exited'}; "
            f"script took {int(time.time() - t0)}s")
    for pat in j.get("collect", []):
        base = ctx.dir if not os.path.isabs(pat) else ""
        for p in glob.glob(os.path.join(base, pat)):
            ctx.add(R.safe_path(p))
    if not res.get("ok"):
        raise RuntimeError("AE script error: " + str(res.get("error")))
    return {"ae_version": res.get("ae_version"), "result": res.get("result"), "secs": int(time.time() - t0)}


def h_ae_render(ctx, j):
    """{"project": ".aep", "rqindex": 1 | "comp": "name", "output": "path (with comp)",
        "om_template": "...", "rs_template": "...", "timeout": 7200,
        "encode": {"input": "...\\frame_%05d.png", "fps": 30, "audio": "...wav", "audio_offset": 0,
                   "out": "preview.mp4", "crf": 18, "scale": "960:-2", "start_number": 0},
        "collect": ["glob", ...]}"""
    proj = R.safe_path(j["project"], must_exist=True)
    cmd = [_aerender(), "-project", proj]
    if j.get("comp"):
        cmd += ["-comp", j["comp"], "-output", R.safe_path(j["output"]) if os.path.isabs(j["output"]) else ctx.out(j["output"])]
    elif j.get("rqindex"):
        cmd += ["-rqindex", str(j["rqindex"])]
    for k, flag in (("rs_template", "-RStemplate"), ("om_template", "-OMtemplate"), ("start", "-s"), ("end", "-e")):
        if j.get(k) is not None:
            cmd += [flag, str(j[k])]
    if j.get("continue_on_missing"):
        cmd += ["-continueOnMissingFootage"]
    ctx.run(cmd, cwd=os.path.dirname(proj), timeout=j.get("timeout", 2 * 3600))
    info = {"aerender": cmd[0]}
    enc = j.get("encode")
    if enc:
        out = ctx.out(enc.get("out", "render.mp4"))
        ff = R.CFG.get("ffmpeg_exe", "ffmpeg")
        c = [ff, "-y", "-framerate", str(enc.get("fps", 30)), "-start_number", str(enc.get("start_number", 0)),
             "-i", R.safe_path(enc["input"])]
        if enc.get("audio"):
            c += ["-ss", str(enc.get("audio_offset", 0)), "-i", R.safe_path(enc["audio"], must_exist=True),
                  "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        vf = [f"scale={enc['scale']}"] if enc.get("scale") else []
        c += (["-vf", ",".join(vf)] if vf else []) + ["-c:v", "libx264", "-pix_fmt", "yuv420p",
                                                       "-crf", str(enc.get("crf", 18)), "-preset", "medium", out]
        ctx.run(c, timeout=j.get("timeout", 2 * 3600))
        ctx.add(out); info["mp4"] = out
    for pat in j.get("collect", []):
        base = ctx.dir if not os.path.isabs(pat) else ""
        for p in sorted(glob.glob(os.path.join(base, pat))):
            ctx.add(R.safe_path(p))
    return info


def h_ae_status(ctx, j):
    """{} -> whether AfterFX.exe runs and the titles/texts of its visible windows (nothing is clicked)."""
    seen = _ae_windows(limit=j.get("limit", 12))
    json.dump(seen, open(ctx.out("_ae_windows.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ctx.add(ctx.out("_ae_windows.json"))
    return seen
