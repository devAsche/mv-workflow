"""Turn the one-frame TIFFs that aerender writes (name_NNNNN.tif, NNNNN = frame number) into name.png.

build_shots.jsx with params.stillMode "queue" only queues its stills and qa frames; the runner's ae_render job renders
them with aerender as TIFF with alpha. This drops the frame number, lays the picture over black (no see-through
pixels) and writes PNG, so sheet tools and tools/qa_contrast.py read them under their usual names.

usage: python3 tif_frames.py <folder with .tif> [out folder]
"""
import glob, os, re, sys
from PIL import Image


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    os.makedirs(dst, exist_ok=True)
    n = 0
    for p in sorted(glob.glob(os.path.join(src, "*.tif"))):
        name = re.sub(r"_\d{5}$", "", os.path.splitext(os.path.basename(p))[0])
        im = Image.open(p)
        if im.mode in ("RGBA", "LA") or "transparency" in im.info:
            im = im.convert("RGBA")
            bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
            im = Image.alpha_composite(bg, im)
        im.convert("RGB").save(os.path.join(dst, name + ".png"))
        n += 1
    print(n, "frames ->", dst)


if __name__ == "__main__":
    main()
