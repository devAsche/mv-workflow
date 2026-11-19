"""Build mvjz_core.jsx: JIZURA's After Effects engine (github.com/852wa/JIZURA, MIT) + our extension mv_jz_ext.jsx.

usage: python build_mvjz.py --jizura <JIZURA checkout> [--out mvjz_core.jsx]

The output is one ExtendScript file. Loading it ($.evalFile) defines $.global.MVJZ (our plan / build / post API, see
mv_jz_ext.jsx) and $.global.JZ_CORE (JIZURA's own engine API, as its --core build). Every JIZURA part and expression pack
is included, in the order JIZURA's build_ae.py uses, without the ScriptUI panel. Non-ASCII characters are escaped
(\\uXXXX) so the file reads the same in any encoding. JIZURA's licence text is copied into the header (MIT requires it).
The output contains JIZURA's code and is not committed here; rebuild it from a pinned JIZURA commit.
"""
import argparse, glob, json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS_HEAD = ['00_core', '05_reg', '10_helpers', '15_plan', '16_omakase', '20_motion', '30_layouts', '40_decor', '45_core']
PARTS_TAIL = ['50_build', '55_diag']


def escape(src):
    out = []
    for ch in src:
        o = ord(ch)
        if o < 128:
            out.append(ch)
        elif o <= 0xFFFF:
            out.append('\\u%04X' % o)
        else:
            o -= 0x10000
            out.append('\\u%04X\\u%04X' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return ''.join(out)


def build(jz, ext_path):
    ae = os.path.join(jz, 'ae')
    packs = sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(ae, 'p_*.jsx')))
    parts = PARTS_HEAD + packs + PARTS_TAIL
    version = open(os.path.join(jz, 'VERSION'), encoding='utf-8').read().strip()
    try:
        commit = subprocess.check_output(['git', '-C', jz, 'rev-parse', 'HEAD'], text=True).strip()
    except Exception:
        commit = 'unknown'
    data = json.load(open(os.path.join(ae, 'data.json'), encoding='utf-8'))
    body = '\n'.join(open(os.path.join(ae, p + '.jsx'), encoding='utf-8').read() for p in parts).replace('@VERSION@', version)
    ext = open(ext_path, encoding='utf-8').read()
    lic = open(os.path.join(jz, 'LICENSE'), encoding='utf-8').read().strip()
    api = ('$.global.JZ_CORE = { version: 3, build: jzBuild, start: jzBuildStart, makePlan: jzMakePlan, keyStyle: jzKeyStyle, parse: jzParseJSON, '
           'log: function () { return JZLOG; }, fallbacks: function () { return JZ_FALLBACKS; }, missingFonts: jzMissingFonts, diagnose: jzDiagnose, '
           'saveReport: jzSaveReport, parts: jzPartsCount, panelVersion: JZ_PANEL_VERSION, fontCheckUnavailable: function () { return JZ_FONT_NOAPI; }, '
           'roleDefault: JZ_ROLE_DEFAULT, data: JZ_DATA };')
    head = ('/*  mvjz_core.jsx - JIZURA %s (commit %s, %d expression packs) + mv_jz_ext.jsx (MV workflow, devAsche/mv-workflow).\n'
            '    Built by pc/autopilot/mv/ae/jz/build_mvjz.py. Load with $.evalFile; defines $.global.MVJZ and $.global.JZ_CORE.\n\n'
            '    JIZURA: https://github.com/852wa/JIZURA\n%s\n*/\n') % (version, commit[:12], len(packs), '\n'.join('    ' + l for l in lic.splitlines()))
    src = ('(function () {\nvar JZ_DATA = ' + json.dumps(data, ensure_ascii=True) + ';\n' + body + '\n'
           + '// ======================================================================== mv_jz_ext.jsx\n' + ext + '\n' + api + '\n})();\n')
    return head + escape(src), {'jizura_version': version, 'commit': commit, 'packs': len(packs)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jizura', required=True, help='JIZURA checkout (folder with ae/, VERSION, LICENSE)')
    ap.add_argument('--ext', default=os.path.join(HERE, 'mv_jz_ext.jsx'))
    ap.add_argument('--out', default='mvjz_core.jsx')
    a = ap.parse_args()
    src, info = build(a.jizura, a.ext)
    with open(a.out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(src)
    info.update(out=a.out, bytes=len(src))
    print(json.dumps(info))


if __name__ == '__main__':
    main()
