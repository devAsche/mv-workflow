# Character cut-out and Photoshop job types for the autopilot runner (loaded by mv_jobs.register), v1.6.
#
#   mv_cutout  cuts characters out of illustrations with anime-segmentation (SkyTNT, Apache-2.0) inside
#              venv-mv: transparent PNG at full size, a trimmed PNG, the mask, and a check image.
#              The model (isnetis.onnx, 176 MB) is fetched once from a fixed Hugging Face URL and its
#              sha256 is checked. onnxruntime and pillow are added to venv-mv on first use.
#   ps_script  hands an ExtendScript (.jsx) to Photoshop through its COM interface (PowerShell, no extra
#              packages). The script is wrapped like ae_script: errors are caught, dialogs are off, and a
#              done-file (JSON) is written into the job's output folder. Used for Photoshop's own
#              Select Subject cut-out (mv\ps\cutout.jsx) and later for texture/dirt work on stills.
# Neither job clicks or types anything on screen.
import glob, hashlib, json, os, subprocess, time, urllib.request

R = None

SEG_MODEL = {
    "url": "https://huggingface.co/skytnt/anime-seg/resolve/a0a563c41338cbe0d23dfb4bfc3e243c518e5768/isnetis.onnx",
    "sha256": "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99",
    "file": os.path.join("anime-seg", "isnetis.onnx"),
}
SEG_PACKAGES = ["onnxruntime==1.23.2", "pillow"]
IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".psd")


def register(runner):
    global R
    R = runner
    return {"mv_cutout": h_mv_cutout, "ps_script": h_ps_script}


def _models_dir():
    return R.CFG.get("mv_models_dir") or os.path.join(os.path.dirname(R.ROOT), "mv-models")


def _fetch_model(ctx, spec):
    dst = R.safe_path(os.path.join(_models_dir(), spec["file"]))
    if os.path.exists(dst):
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ctx.log("downloading", spec["url"])
    h, size = hashlib.sha256(), 0
    req = urllib.request.Request(spec["url"], headers={"User-Agent": "autopilot-runner"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dst + ".part", "wb") as f:
        while True:
            chunk = r.read(4 << 20)
            if not chunk:
                break
            f.write(chunk); h.update(chunk); size += len(chunk)
    if h.hexdigest() != spec["sha256"]:
        raise RuntimeError(f"sha256 mismatch for {spec['url']}; the .part file is kept for inspection")
    os.replace(dst + ".part", dst)
    ctx.log(f"saved {dst} ({size / 1e6:.0f} MB)")
    return dst


def _images(j):
    if j.get("images"):
        return [R.safe_path(p, must_exist=True) for p in j["images"]]
    d = R.safe_path(j["dir"], must_exist=True)
    return [os.path.join(d, n) for n in sorted(os.listdir(d)) if n.lower().endswith(IMG_EXTS)]


def h_mv_cutout(ctx, j):
    """{"images": ["C:\\...\\a.png", ...] | "dir": "C:\\...", "outdir": optional (default: this job's folder),
        "size": 1024, "low": 16, "high": 235, "erode": 0, "margin": 0.04}"""
    from mv_jobs import _venv_python
    py = _venv_python()
    if not os.path.exists(py):
        raise RuntimeError("venv-mv is missing: run an mv_setup job first")
    if subprocess.run([py, "-c", "import onnxruntime, PIL"], capture_output=True).returncode != 0:
        ctx.run([py, "-m", "pip", "install"] + SEG_PACKAGES, timeout=1800)
    model = _fetch_model(ctx, SEG_MODEL)
    imgs = _images(j)
    if not imgs:
        raise ValueError("no images given")
    out = R.safe_path(j["outdir"]) if j.get("outdir") else ctx.dir
    os.makedirs(out, exist_ok=True)
    script = os.path.join(R.ROOT, "mv", "cutout.py")
    cmd = [py, "-I", script, "--model", model, "--outdir", out]
    for k in ("size", "low", "high", "erode", "margin"):
        if j.get(k) is not None:
            cmd += ["--" + k, str(j[k])]
    ctx.run(cmd + imgs, timeout=j.get("timeout", 1800))
    for pat in ("*_cut.png", "*_trim.png", "*_mask.png", "*_check.png", "cutout.json"):
        for p in sorted(glob.glob(os.path.join(out, pat))):
            ctx.add(p)
    rep = json.load(open(os.path.join(out, "cutout.json"), encoding="utf-8"))
    return {"outdir": out, "images": len(rep), "empty": [e["image"] for e in rep if "warning" in e]}


# ---------------------------------------------------------------- Photoshop
PS_WRAPPER = r"""
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
    var res = {ok: false, ps_version: app.version, started: new Date().toString()};
    var oldDialogs = app.displayDialogs, oldUnits = app.preferences.rulerUnits;
    app.displayDialogs = DialogModes.NO;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        if (MVJOB.script) $.evalFile(new File(MVJOB.script));
        res.ok = true;
        res.result = MVJOB.result === undefined ? null : MVJOB.result;
    } catch (e) {
        res.error = String(e) + (e.line ? " (line " + e.line + ")" : "") + (e.fileName ? " in " + e.fileName : "");
    }
    app.displayDialogs = oldDialogs;
    app.preferences.rulerUnits = oldUnits;
    res.log = MVLOG;
    res.finished = new Date().toString();
    var f = new File(MVJOB.done + ".tmp");
    f.encoding = "UTF-8";
    if (f.open("w")) { f.write(mvJSON(res)); f.close(); f.rename(MVJOB.done_name); }
})();
"""


def h_ps_script(ctx, j):
    """{"script": ".jsx path", "params": {...}, "timeout": 900, "collect": ["*.png", "*.psd"]}
    The script sees MVJOB.params, MVJOB.outdir and MVJOB.workdir, and may set MVJOB.result."""
    from mv_ae import _js
    script = R.safe_path(j["script"], must_exist=True)
    done = ctx.out("_ps_done.json")
    if os.path.exists(done):
        os.remove(done)
    job = {"id": j["id"], "script": script, "outdir": ctx.dir, "workdir": os.path.dirname(script),
           "params": j.get("params", {}), "done": done, "done_name": os.path.basename(done)}
    wrapper = ctx.out("_ps_wrapper.jsx")
    with open(wrapper, "w", encoding="utf-8-sig") as f:
        f.write(PS_WRAPPER % {"job": _js(job)})
    # COM: starts Photoshop if needed (the registered version), runs the file, returns when the script ends.
    ps_cmd = ("$ErrorActionPreference='Stop'; $a = New-Object -ComObject Photoshop.Application; "
              "[void]$a.DoJavaScriptFile('%s')" % wrapper.replace("'", "''"))
    ctx.log("RUN Photoshop COM DoJavaScriptFile", wrapper)
    pr = subprocess.Popen(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    t0, timeout = time.time(), j.get("timeout", 900)
    while not os.path.exists(done):
        if pr.poll() is not None and not os.path.exists(done):
            time.sleep(2)
            if not os.path.exists(done):
                raise RuntimeError("Photoshop did not run the script: " + pr.stdout.read().decode("cp932", "replace")[-1500:])
        if time.time() - t0 > timeout:
            raise TimeoutError(f"no answer from Photoshop after {timeout}s; check that Photoshop is not showing a dialog")
        time.sleep(2)
    time.sleep(0.5)
    res = json.load(open(done, encoding="utf-8-sig"))
    for line in res.get("log", []):
        ctx.log("PS:", line)
    for pat in j.get("collect", []):
        for p in sorted(glob.glob(os.path.join(ctx.dir, pat))):
            ctx.add(R.safe_path(p))
    if not res.get("ok"):
        raise RuntimeError("Photoshop script error: " + str(res.get("error")))
    return {"ps_version": res.get("ps_version"), "result": res.get("result"), "secs": int(time.time() - t0)}
