"""Pull check frames out of a rendered MVJZ section (mp4) at the moments the rules care about, and lay them out as sheets.

usage: python3 tools/jz_frames.py SPEC.json SECTION.mp4 OUTDIR [--cols 3] [--width 640]

For every cut of the spec (times are section times):
  A  the moment the whole lyric should be on screen: readBy + 0.1 for a line shown at once, last glyph + 0.12 for a
     line shown glyph by glyph (sync "char"), the middle for an interlude or a title
  B  0.05 s before the cut ends (the line must still be whole: no exit eating it before the switch)
Writes OUTDIR/frames/cNN_A.jpg, cNN_B.jpg and OUTDIR/sheet_NN.jpg (labelled, a few cuts per sheet).
Needs ffmpeg and Pillow.
"""
import argparse, json, os, subprocess
from PIL import Image, ImageDraw


def moments(c):
    s, e = c['start'], c['end']
    if 'chars' not in c:
        a = s + min(1.5, (e - s) / 2)
    elif c.get('sync') == 'char':
        a = c['chars'][-1] + 0.12
    else:
        a = c.get('readBy', s) + 0.1
    return [('A', min(max(a, s + 0.02), e - 0.05)), ('B', e - 0.05)]


def grab(mp4, t, out, width):
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-ss', '%.3f' % t, '-i', mp4, '-frames:v', '1',
                           '-vf', 'scale=%d:-2' % width, '-q:v', '3', out])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('spec'); ap.add_argument('mp4'); ap.add_argument('outdir')
    ap.add_argument('--cols', type=int, default=2); ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--per-sheet', type=int, default=8)
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding='utf-8'))
    fd = os.path.join(a.outdir, 'frames'); os.makedirs(fd, exist_ok=True)
    rows = []
    for i, c in enumerate(spec['cuts']):
        cells = []
        for tag, t in moments(c):
            p = os.path.join(fd, 'c%02d_%s.jpg' % (i, tag))
            grab(a.mp4, t, p, a.width)
            cells.append((p, '%d%s %.2fs %s' % (i, tag, t, c.get('layout', c.get('kind', '')))))
        rows.append(cells)
    sheets = []
    for k in range(0, len(rows), a.per_sheet):
        part = rows[k:k + a.per_sheet]
        w = a.width; h = int(w * 9 / 16); lab = 22
        img = Image.new('RGB', (w * 2, (h + lab) * len(part)), (20, 20, 20))
        d = ImageDraw.Draw(img)
        for r, cells in enumerate(part):
            for col, (p, text) in enumerate(cells):
                im = Image.open(p).convert('RGB').resize((w, h))
                img.paste(im, (col * w, r * (h + lab) + lab))
                d.text((col * w + 6, r * (h + lab) + 4), text, fill=(255, 80, 80))
        sp = os.path.join(a.outdir, 'sheet_%02d.jpg' % (k // a.per_sheet))
        img.save(sp, quality=85); sheets.append(sp)
    print('\n'.join(sheets))


if __name__ == '__main__':
    main()
