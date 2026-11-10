# MV workflow job types for the autopilot runner (C:\AI model\autopilot\runner.py).
#
# runner.py (v1.4+) imports this file if it sits next to it and adds the handlers below.
# Nothing in the original ad-video jobs is changed. If this file is missing or broken,
# the runner prints a warning and keeps running the ad-video jobs as before.
#
# Job types
#   mv_setup    builds a separate Python environment (C:\AI model\venv-mv) with the fixed
#               package list below. The runner's own venv is never touched.
#   mv_analyze  runs mv\analyze.py inside venv-mv: vocal separation (Demucs), beat and
#               downbeat tracking (Beat This!), lyric alignment (stable-ts), sections, energy.
#   ae_script, ae_render        After Effects jobs, in mv_ae.py (v1.5)
#   web_download, font_install  fonts and free assets, in mv_assets.py (v1.5)
#   mv_cutout, ps_script        character cut-outs and Photoshop scripts, in mv_cutout.py (v1.6)
#   model_download  saves one model file from Hugging Face into ComfyUI\models\<folder>\.
#               Only https://huggingface.co/<repo>/resolve/... URLs, only the folders in
#               MODEL_FOLDERS, only .safetensors / .gguf. Never overwrites an existing file;
#               an interrupted download resumes from its .part file.
import hashlib, json, os, subprocess, sys, time, urllib.parse, urllib.request

R = None   # the runner module, set by register()

# Fixed package list for venv-mv. Changing it means changing this file (reviewed in git).
TORCH_INDEX = "https://download.pytorch.org/whl/cu130"
MV_PACKAGES = [
    ["torch", "torchaudio"],                       # installed from TORCH_INDEX (CUDA build)
    ["demucs==4.1.0", "stable-ts==2.19.1", "beat-this==1.1.0", "rotary-embedding-torch",
     "librosa", "soundfile", "soxr"],
]


def register(runner):
    global R
    R = runner
    handlers = {"mv_setup": h_mv_setup, "mv_analyze": h_mv_analyze, "model_download": h_model_download}
    # v1.5: After Effects (mv_ae.py) and asset/font jobs (mv_assets.py); v1.6: cut-outs and Photoshop
    # (mv_cutout.py). A broken or missing file only
    # disables its own jobs.
    for mod in ("mv_ae", "mv_assets", "mv_cutout"):
        try:
            handlers.update(__import__(mod).register(runner))
        except Exception as e:
            print(f"{mod} not loaded ({e.__class__.__name__}: {e})", flush=True)
    return handlers


def _venv_dir():
    return R.CFG.get("mv_venv", os.path.join(os.path.dirname(R.ROOT), "venv-mv"))


def _venv_python():
    return os.path.join(_venv_dir(), "Scripts", "python.exe")


def _base_python():
    # the interpreter the runner's venv was created from (C:\AI model\python-base or similar)
    return getattr(sys, "_base_executable", None) or sys.executable


def h_mv_setup(ctx, j):
    """Create venv-mv (if missing) and install MV_PACKAGES into it. Safe to run again."""
    vd = _venv_dir()
    if not os.path.exists(_venv_python()):
        ctx.run([_base_python(), "-m", "venv", vd], timeout=600)
    py = _venv_python()
    ctx.run([py, "-m", "pip", "install", "--upgrade", "pip"], timeout=900)
    ctx.run([py, "-m", "pip", "install", "--index-url", TORCH_INDEX] + MV_PACKAGES[0], timeout=3600)
    ctx.run([py, "-m", "pip", "install"] + MV_PACKAGES[1], timeout=3600)
    check = ("import json, torch, torchaudio, demucs, stable_whisper, beat_this, librosa;"
             "print(json.dumps({'torch': torch.__version__, 'cuda': torch.cuda.is_available(),"
             "'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,"
             "'demucs': demucs.__version__, 'stable_ts': stable_whisper.__version__, 'librosa': librosa.__version__}))")
    out = subprocess.run([py, "-c", check], capture_output=True, timeout=300)
    txt = out.stdout.decode("utf-8", "replace").strip().splitlines()
    ctx.log(out.stderr.decode("utf-8", "replace")[-2000:])
    info = json.loads(txt[-1]) if txt else {"error": "check failed"}
    info["venv"] = vd
    json.dump(info, open(ctx.out("mv_setup.json"), "w"), indent=1); ctx.add(ctx.out("mv_setup.json"))
    return info


def _free_comfy_vram(ctx):
    """Ask a running ComfyUI to unload its models so the 8 GB GPU is free for analysis."""
    try:
        req = urllib.request.Request(R.CFG["comfy_url"] + "/free", json.dumps({"unload_models": True, "free_memory": True}).encode(),
                                     {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).read(); ctx.log("ComfyUI models unloaded"); time.sleep(3)
    except Exception as e:
        ctx.log("ComfyUI free skipped:", e)


def h_mv_analyze(ctx, j):
    """audio (+ optional lyrics .txt) -> timing.json, vocals.wav, no_vocals.wav, lyrics.srt in the job's output folder."""
    py = _venv_python()
    if not os.path.exists(py):
        raise RuntimeError("venv-mv is missing: run an mv_setup job first")
    script = os.path.join(R.ROOT, "mv", "analyze.py")
    audio = R.safe_path(j["audio"], must_exist=True)
    cmd = [py, script, "--audio", audio, "--outdir", ctx.dir,
           "--language", j.get("language", "ja"), "--model", j.get("whisper_model", "medium"),
           "--device", j.get("device", "auto")]
    if j.get("lyrics"):
        cmd += ["--lyrics", R.safe_path(j["lyrics"], must_exist=True)]
    if j.get("skip_separation"):
        cmd += ["--skip-separation"]
    _free_comfy_vram(ctx)
    ctx.run(cmd, cwd=os.path.dirname(script), timeout=j.get("timeout", 2 * 3600))
    for name in ("timing.json", "lyrics.srt", "vocals.wav", "no_vocals.wav", "analysis_preview.png"):
        p = ctx.out(name)
        if os.path.exists(p):
            ctx.add(p)
    t = json.load(open(ctx.out("timing.json"), encoding="utf-8"))
    return {"duration": t.get("duration"), "bpm": t.get("bpm"), "beats": len(t.get("beats", [])),
            "lines": len(t.get("lines", [])), "sections": [s["label"] for s in t.get("sections", [])],
            "devices": t.get("devices")}


# ---------------------------------------------------------------- model_download
MODEL_FOLDERS = ("diffusion_models", "text_encoders", "vae", "loras", "upscale_models")
MODEL_EXTS = (".safetensors", ".gguf")


def h_model_download(ctx, j):
    """{"url": "https://huggingface.co/<repo>/resolve/<rev>/<path>", "folder": "loras", "filename": optional,
        "sha256": optional} -> ComfyUI\\models\\<folder>\\<filename>"""
    url = j["url"]
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname != "huggingface.co" or "/resolve/" not in u.path:
        raise PermissionError("only https://huggingface.co/<repo>/resolve/... URLs are allowed")
    folder = j["folder"]
    if folder not in MODEL_FOLDERS:
        raise PermissionError(f"folder must be one of {MODEL_FOLDERS}")
    name = j.get("filename") or os.path.basename(urllib.parse.unquote(u.path))
    if any(c in name for c in '/\\:') or name.startswith(".") or not name.lower().endswith(MODEL_EXTS):
        raise ValueError(f"bad filename: {name}")
    dst = R.safe_path(os.path.join(R.CFG["comfy_dir"], "models", folder, name))
    if os.path.exists(dst):
        ctx.log("already there, not downloading:", dst)
        return {"path": dst, "bytes": os.path.getsize(dst), "skipped": True}
    part = dst + ".part"
    have = os.path.getsize(part) if os.path.exists(part) else 0
    headers = {"User-Agent": "autopilot-runner"}
    if have:
        headers["Range"] = f"bytes={have}-"
    req = urllib.request.Request(url, headers=headers)
    t0 = last = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        if have and r.status != 206:          # server ignored Range: start over
            have = 0
        total = have + int(r.headers.get("Content-Length") or 0)
        ctx.log(f"downloading {name} ({total / 1e9:.2f} GB) -> {dst}" + (f", resuming at {have / 1e9:.2f} GB" if have else ""))
        with open(part, "ab" if have else "wb") as f:
            done = have
            while True:
                chunk = r.read(8 << 20)
                if not chunk:
                    break
                f.write(chunk); done += len(chunk)
                if time.time() - last > 30:
                    last = time.time()
                    ctx.log(f"  {done / 1e9:.2f} / {total / 1e9:.2f} GB, {(done - have) / 1e6 / (last - t0):.1f} MB/s")
    if total and os.path.getsize(part) != total:
        raise RuntimeError(f"incomplete: {os.path.getsize(part)} of {total} bytes (run the job again to resume)")
    if j.get("sha256"):
        h = hashlib.sha256()
        with open(part, "rb") as f:
            for b in iter(lambda: f.read(16 << 20), b""):
                h.update(b)
        if h.hexdigest().lower() != j["sha256"].lower():
            raise RuntimeError("sha256 mismatch; the .part file is kept for inspection")
    os.replace(part, dst)
    ctx.log("saved", dst)
    return {"path": dst, "bytes": os.path.getsize(dst), "secs": int(time.time() - t0)}
