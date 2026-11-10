# Asset job types for the autopilot runner (loaded by mv_jobs.register).
#
#   web_download  saves one file from a site listed in mv\download_allowlist.json into
#                 Videos\MV制作\フォント\<subdir> or Videos\MV制作\素材\<subdir>. Every redirect hop
#                 must also be on the list. Never overwrites. A .zip is unpacked next to it
#                 (only the file types below, no paths outside the folder). The URL, date, size
#                 and sha256 go into _取得元.json in that folder, with the license note from the job.
#   font_install  installs the fonts in a folder for the current Windows user only
#                 (%LOCALAPPDATA%\Microsoft\Windows\Fonts + HKCU registry), no admin rights.
#                 Existing fonts with the same file name are left alone.
import ctypes, datetime, hashlib, json, os, re, shutil, time, urllib.parse, urllib.request, zipfile

R = None

DEST_ROOTS = {"fonts": r"C:\Users\user\Videos\MV制作\フォント", "assets": r"C:\Users\user\Videos\MV制作\素材"}
FILE_EXTS = {".zip", ".ttf", ".otf", ".ttc", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".exr", ".hdr",
             ".mp4", ".mov", ".webm", ".glb", ".gltf", ".bin", ".fbx", ".blend", ".obj", ".mtl", ".txt", ".md", ".pdf"}
FONT_EXTS = {".ttf", ".otf", ".ttc"}
MAX_UNZIP_BYTES = 4 << 30
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) mv-workflow-runner"


def register(runner):
    global R
    R = runner
    return {"web_download": h_web_download, "font_install": h_font_install}


def _allowlist():
    p = os.path.join(R.ROOT, "mv", "download_allowlist.json")
    return [h.lower() for h in json.load(open(p, encoding="utf-8"))["hosts"]]


def _host_ok(url, hosts):
    u = urllib.parse.urlparse(url)
    h = (u.hostname or "").lower()
    return u.scheme == "https" and any(h == a or h.endswith("." + a) for a in hosts)


class _Guard(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts):
        self.hosts = hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _host_ok(newurl, self.hosts):
            raise PermissionError(f"redirect to a host not on the allowlist: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _clean(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if not name or name.startswith("."):
        raise ValueError(f"bad file name: {name!r}")
    return name


def _dest_dir(j):
    root = R.CFG.get("mv_" + j.get("dest", "assets") + "_dir") or DEST_ROOTS[j.get("dest", "assets")]
    sub = _clean(j["subdir"]) if j.get("subdir") else ""
    d = R.safe_path(os.path.join(root, sub) if sub else root)
    os.makedirs(d, exist_ok=True)
    return d


def _record(d, entry):
    p = os.path.join(d, "_取得元.json")
    data = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
    data.append(entry)
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def _unzip(ctx, zpath, d):
    out, total = [], 0
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            raw = info.filename
            if not (info.flag_bits & 0x800):            # not marked UTF-8: Japanese zips are usually cp932
                try:
                    raw = raw.encode("cp437").decode("cp932")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            parts = [_clean(p) for p in re.split(r"[\\/]+", raw) if p not in ("", ".", "..")]
            if not parts or os.path.splitext(parts[-1])[1].lower() not in FILE_EXTS - {".zip"}:
                ctx.log("  skip", raw); continue
            total += info.file_size
            if total > MAX_UNZIP_BYTES:
                raise RuntimeError("zip is larger than the 4 GB limit")
            dst = os.path.join(d, *parts)
            if os.path.commonpath([os.path.realpath(dst), d]) != d:
                raise PermissionError(f"zip entry escapes the folder: {raw}")
            if os.path.exists(dst):
                ctx.log("  exists, kept", dst); continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(info) as src, open(dst, "wb") as f:
                shutil.copyfileobj(src, f)
            out.append(dst)
    ctx.log(f"unzipped {len(out)} files")
    return out


def h_web_download(ctx, j):
    """{"url": "https://...", "dest": "fonts"|"assets", "subdir": "源暎アンチック", "filename": optional,
        "license": "OFL-1.1 (checked at <page url>)", "unzip": true, "sha256": optional}"""
    hosts = _allowlist()
    url = j["url"]
    if not _host_ok(url, hosts):
        raise PermissionError(f"host not on mv\\download_allowlist.json: {url}")
    d = _dest_dir(j)
    opener = urllib.request.build_opener(_Guard(hosts))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    t0 = time.time()
    with opener.open(req, timeout=120) as r:
        final = r.geturl()
        ctype = (r.headers.get("Content-Type") or "").lower()
        if "text/html" in ctype:
            raise RuntimeError(f"got a web page, not a file (Content-Type {ctype}); this is not a direct download link")
        name = j.get("filename")
        cd = r.headers.get("Content-Disposition") or ""
        m = re.search(r"filename\*=UTF-8''([^;]+)", cd) or re.search(r'filename="?([^";]+)"?', cd)
        if not name and m:
            name = urllib.parse.unquote(m.group(1))
        name = _clean(name or os.path.basename(urllib.parse.unquote(urllib.parse.urlparse(final).path)))
        if os.path.splitext(name)[1].lower() not in FILE_EXTS:
            raise ValueError(f"file type not allowed: {name}")
        dst = os.path.join(d, name)
        if os.path.exists(dst):
            ctx.log("already there, not downloading:", dst)
            return {"path": dst, "skipped": True}
        h, size = hashlib.sha256(), 0
        with open(dst + ".part", "wb") as f:
            while True:
                chunk = r.read(4 << 20)
                if not chunk:
                    break
                f.write(chunk); h.update(chunk); size += len(chunk)
    if j.get("sha256") and h.hexdigest().lower() != j["sha256"].lower():
        raise RuntimeError("sha256 mismatch; the .part file is kept for inspection")
    os.replace(dst + ".part", dst)
    ctx.log(f"saved {dst} ({size / 1e6:.1f} MB) in {int(time.time() - t0)}s")
    files = [dst]
    if j.get("unzip", True) and name.lower().endswith(".zip"):
        files += _unzip(ctx, dst, d)
    _record(d, {"file": name, "url": url, "final_url": final, "date": datetime.datetime.now().isoformat(timespec="seconds"),
                "bytes": size, "sha256": h.hexdigest(), "license": j.get("license", "")})
    ctx.files += files
    return {"path": dst, "bytes": size, "files": len(files)}


def h_font_install(ctx, j):
    """{"dir": "C:\\Users\\user\\Videos\\MV制作\\フォント" (default), "recursive": true}"""
    import winreg
    src = R.safe_path(j.get("dir") or DEST_ROOTS["fonts"], must_exist=True)
    fonts_dir = os.path.join(os.environ["LOCALAPPDATA"], "Microsoft", "Windows", "Fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts")
    installed, skipped, conflicts = [], [], []
    walk = os.walk(src) if j.get("recursive", True) else [(src, [], os.listdir(src))]
    for root, _dirs, names in walk:
        for n in sorted(names):
            ext = os.path.splitext(n)[1].lower()
            if ext not in FONT_EXTS:
                continue
            s, dst = os.path.join(root, n), os.path.join(fonts_dir, n)
            if os.path.exists(dst):
                (skipped if os.path.getsize(dst) == os.path.getsize(s) else conflicts).append(n)
                continue
            shutil.copy2(s, dst)
            label = os.path.splitext(n)[0] + (" (OpenType)" if ext == ".otf" else " (TrueType)")
            winreg.SetValueEx(key, label, 0, winreg.REG_SZ, dst)
            ctypes.windll.gdi32.AddFontResourceW(dst)
            installed.append(n)
    winreg.CloseKey(key)
    if installed:   # tell running programs that the font list changed (WM_FONTCHANGE to all windows)
        ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 0x0002, 3000, None)
    ctx.log(f"installed {len(installed)}, already there {len(skipped)}, name clashes {len(conflicts)}")
    for n in conflicts:
        ctx.log("  different file with the same name already installed, left alone:", n)
    return {"installed": installed, "skipped": len(skipped), "conflicts": conflicts, "fonts_dir": fonts_dir,
            "note": "restart After Effects / Illustrator / Photoshop to see new fonts"}
