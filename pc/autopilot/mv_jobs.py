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
import json, os, subprocess, sys, time, urllib.request

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
    return {"mv_setup": h_mv_setup, "mv_analyze": h_mv_analyze}


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
