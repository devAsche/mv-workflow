# JIZURA をランナーから動かす（MVJZ）

[JIZURA](https://github.com/852wa/JIZURA)（MIT、Copyright (c) 2026 hakoniwa）は、歌詞から文字PVを After Effects で組み立てるエンジンです。配置・出入り・保持・飾り・加工・背景・カメラ・切り替え・画面効果の部品が約1,700あります。ここにあるのは、その部品を私たちのカット表から使うための包みです。2026-11-19 に凌さんが選んだ「案A ランナーから動かす」で作りました。

JIZURA自身の計画（`jzMakePlan`）は、行の時刻だけを受け取り、部品をシードで選びます。包みでは次の点が変わります。

- **カットは私たちの計画から作る**: カットごとの開始・終了・文字は、文字単位の時刻（`timing_chars.json`）から決めます。カットに書いた項目（layout、enter、exit、hold、decor、treat、bg、cam、trans、scheme、params など）はそのまま使います。書いていない項目だけを、JIZURAの重みつきの選び方で、許した部品（`parts`）の中から選びます。
- **文字単位の時刻**: `"sync": "word"` にすると、歌詞の一部を持つテキストレイヤーが、その最初の字が歌われる時刻に読める状態になります。`"sync": "char"` は1字ずつ歌われる時刻に出します（入り方 `mvSync`、`syncStyle` は fade・pop・drop・rise・blur）。`sync` が無ければ、カットの頭からJIZURAの動きのまま入ります。いずれも声の `lead` 秒（既定0.06秒）前に読めるようにします。
- **絵を文字の下に敷く**: `"image"` を持つカットは、そのカットの中の背景色のすぐ上に絵を置き、ゆっくりしたカメラ（参考4本の中央値: 1秒あたりズーム0.75%・回転0.3°・横12px＠1920）と、文字の下の暗さ（`shade`）を足します。
- **誌面キット**: `"kit"` に書いた飾りは、同じパラメータで全カットに付きます（曲を通して同じ枠・ラベル）。

## ファイル

| ファイル | 中身 |
| --- | --- |
| `mv_jz_ext.jsx` | 包みの本体。JIZURAの閉じた関数の中に連結され、`$.global.MVJZ` を作る |
| `build_mvjz.py` | JIZURAの取り出し（固定のコミット）と `mv_jz_ext.jsx` から `mvjz_core.jsx` を作る。JIZURAのコードを含むのでリポジトリには入れない |
| `../build_jz.jsx` | ランナーの `ae_script` ジョブで動かす組み立てスクリプト |
| `examples/spec_test.json` | 歌詞を含まない試しの spec |
| `../../../../tools/jz_spec.py` | カット表と `timing_chars.json` から spec を作る |
| `../../../../tools/jz_dryrun.js` | spec を JIZURA の AE 模擬環境（`dev/aeom.js`）で組み、警告・置き換え・未知のプロパティ・式の構文を数える |

## 作り方

```sh
git clone https://github.com/852wa/JIZURA && git -C JIZURA checkout 4c8278c     # v0.13.0（2026-11-19に使ったもの）
python pc/autopilot/mv/ae/jz/build_mvjz.py --jizura JIZURA --out mvjz_core.jsx
python tools/jz_spec.py cuts.json -o spec.json --report
NODE_PATH=<acornを入れたnode_modules> node tools/jz_dryrun.js --jizura JIZURA --core mvjz_core.jsx --spec spec.json
```

PCには `C:\AI model\autopilot\mv\ae\jz\mvjz_core.jsx` と `C:\AI model\autopilot\mv\ae\build_jz.jsx` を置き、組み立てと書き出しを一組で送ります。

```json
{"id": "…-jz", "type": "ae_script", "script": "C:\\AI model\\autopilot\\mv\\ae\\build_jz.jsx", "timeout": 900, "collect": ["plan.json"],
 "params": {"core": "C:\\AI model\\autopilot\\mv\\ae\\jz\\mvjz_core.jsx", "spec_file": "…\\spec.json", "name": "MV_jz_x",
            "audio": "…\\song.wav", "audio_start": -42.6, "stills": [1.0, 2.5], "stillMode": "queue", "render": "h264", "save": "MV_jz_x.aep"}}
{"id": "…-jzr", "type": "ae_render", "project": "C:\\AI model\\autopilot\\outbox\\files\\…-jz\\MV_jz_x.aep", "collect": ["…\\*.tif", "…\\*.mp4"]}
```

## spec

```json
{
 "title": "…", "artist": "…", "width": 1920, "height": 1080, "fps": 24, "seed": 1,
 "style": "noir",                         JIZURAのスタイル名（27種）か、スタイルの中身そのもの
 "styleOverride": {"schemes": […], "fonts": {"display": ["zenkaku"]}},
 "fontCandidates": {"gothic_med": ["ZenKakuGothicNew-Medium"]},   書体キーに試すPostScript名を足す（新しいキーも可）
 "fx": {"motion": 0.6, "glitch": 0.3, "chroma": 0.5, "decor": 0.5, "texture": 0.6, "bgSwitch": 0.35, "flash": true, "hud": false},
 "parts": {"tags": ["calm"], "noStrong": true, "allow": {"cam": […]}, "deny": {"exit": […]}, "extra": false, "wa": true},
 "kit": ["cropMarks", {"id": "indexNum", "corner": true}],
 "shade": 30, "imageCam": {"zoom": 0.75, "rot": 0.3, "pan": [12, 0]}, "lead": 0.06,
 "autoTrans": true, "autoEvents": true, "events": [{"t": 7.0, "type": "flash"}],
 "cuts": [
  {"kind": "title", "start": 0.2, "end": 2.0},
  {"text": "…", "start": 2.0, "end": 3.6, "line": 0, "chars": [2.1, 2.3], "readBy": 2.04,
   "layout": "center", "enter": "blur", "sync": "word", "emph": false, "impact": false,
   "image": {"path": "C:\\…\\art.png", "focus": [0.4, 0.5], "cam": {"zoom": -0.75}, "keepPaper": true}, "shade": {"color": "#000000", "opacity": 30}},
  {"kind": "interlude", "start": 8.4, "end": 10.0, "params": {"variant": "counter"}}
 ]
}
```

部品の名前は JIZURA の `ae/data.json`（`orders`・`meta`）にあります。AEで組めない名前を書いた場合は、JIZURAが指定する代わりの部品か既定の部品に置き換え、結果の `plan_notes` に書きます。

## 確かめていないこと

- AEの文字アニメーターの `textIndex` が改行を数えるかどうか。`sync: "char"` で複数行の文字を1レイヤーにしたとき、1字ずれる可能性があります（1行のカットでは関係しません）。
- PCにない書体: Noto Sans JP（JIZURAのゴシック全般）、IBM Plex Mono / Sans JP。無いときはJIZURAの候補順（小塚ゴシック、游ゴシックなど）に下がります。曲ごとに `styleOverride.fonts` と `fontCandidates` で入っている書体を指定します。
