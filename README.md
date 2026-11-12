# mv-workflow

Sunoで作った曲のミュージックビデオを、Claudeと凌さんのPC（RTX 3060 Ti 8GB）で、追加費用なしに作るためのワークフローです。

2026-11-12に作り方を組み直しました（Claude Doc「MVの作り方 v3（基準の1枚から組む）」）。曲ごとに基準の1枚（ジャケ写など）を決め、色・人物・画風をそこから測って `look.json` に書き、絵はMiniMax H3 Imageにその1枚を参照として渡して作り、動きはAfter Effects（AE）で足し、仕上がりは `tools/` の点検で数えます。重い処理はすべてPCの常駐ランナー（`C:\AI model\autopilot`）でジョブとして動かし、画面の操作はしません。H3とAEは同時に動かしません。

## 流れ

1. **受け取る**: 曲、歌詞、基準の1枚、基準の1枚を使うことへの作者の了承。
2. **楽曲解析**（`mv_analyze` ジョブ）: Demucsでボーカルを分離し、Beat This!で拍と小節頭、stable-tsで歌詞を文字単位で音に合わせて `timing.json` を作る。
3. **look.json**: 基準の1枚から色を `tools/palette_check.py --derive` で測り、顔を出してよい絵、書体、手書きの言葉の上限、線の色を書く（見本 `tools/look_example.json`）。
4. **構成**: 曲を貫く動作、3幕、区間ごとの切り替え密度、山、仕掛けを時刻つきの表にする。
5. **絵コンテ**: 区間ごとに `build_shots.jsx` の shots を書き、`tools/plan_check.py --look` が通るまで直す。
6. **絵**（`comfy_graph` ジョブ）: H3 Image に基準の1枚を参照として渡し、1枚につき2〜3案。寄る量に合わせた大きさで作り、雨は描かせない（`pc/prompts/h3_style_ref.md`）。
7. **AEで組む**（`ae_script` ジョブ）: `build_shots.jsx` をまず `pass: "plate"`（歌詞なし）で書き出し、`motion_check.py`・`palette_check.py`・結果の `upscale` で点検する。
8. **歌詞を載せて書き出す**: `qa_contrast.py` とコマの一覧で確かめ、凌さんに見せる。指摘は決まりと点検に足して、5〜7に戻る。

## 点検の道具（`tools/`）

| ファイル | 使う所 | 測るもの |
| --- | --- | --- |
| `plan_check.py` | 絵コンテ | 区間ごとの切り替え密度、ショットの拍数、切り替えの位置、顔の割合。`--look` で顔の出どころ、1ショット2つ以上の動き、手書きの言葉の数、山の文字の大きさ |
| `motion_check.py` | 歌詞なしの書き出し | カメラの動きを除いて、絵の中で何かが動いているショットか（動いている／カメラだけ／止め絵） |
| `palette_check.py` | 書き出し、絵の候補 | 基準の色から外れる色の割合（色が外れる／混ざりもの）。`--derive` で基準の1枚から色の基準を測る |
| `qa_contrast.py` | 歌詞ありの書き出し | 歌詞の文字と周りのコントラスト比 |
| `analyze_mv.py` | 参考MVと比べるとき | カット、ショットの長さ、拍との一致、コマの一覧 |

Remotion（`remotion/`）は2026-11-10までの方式で、今は使っていません。

## フォルダ

| パス | 中身 |
| --- | --- |
| `pc/autopilot/mv_jobs.py` | ランナーに足すMV用ジョブ（`mv_setup`、`mv_analyze`）。PCでは `C:\AI model\autopilot\mv_jobs.py` に置く |
| `pc/autopilot/mv_ae.py` | AEのジョブ（`ae_script`、`ae_render`）。`mv_jobs.py` から読み込まれる |
| `pc/autopilot/mv_assets.py` | フォントと素材のジョブ（`web_download`、`font_install`） |
| `pc/autopilot/mv/ae/mvae.jsx` | AEで使い回す部品（コンプ、文字、キーフレーム、エフェクト、テキストアニメーター、マット、書き出し） |
| `pc/autopilot/mv/ae/probe.jsx` | AEの動作確認。バージョン、フォント、書き出しテンプレート名、全エフェクトのプロパティ名を調べる |
| `pc/autopilot/mv/download_allowlist.json` | `web_download` が取りに行ってよい配布元と、確かめたライセンス |
| `pc/autopilot/mv/analyze.py` | 楽曲解析の本体。MV専用のPython環境 `C:\AI model\venv-mv` で動く |
| `pc/autopilot/start_runner_icon.bat` | デスクトップのアイコンから押す起動ファイル。`runner.py` がすでに動いていれば何もしないので、二重起動にならない |
| `pc/autopilot/patches/` | ランナー本体（runner.py）への変更点。広告用のジョブには手を入れていない |
| `pc/comfy_graphs/` | ComfyUIのAPI形式ワークフロー（H3 Image の参照1枚 `h3_image_ref1_v1.json` と参照なし `h3_image_t2i_v1.json`、Qwen Image 2.1 GGUF） |
| `pc/prompts/` | 画像生成の指示文の型 |
| `tools/` | 点検の道具（上の表） |
| `remotion/` | 合成と歌詞モーション。`timing.json` と絵コンテ `plan.json` から書き出す（詳しくは `remotion/README.md`） |

## ランナーのMV用ジョブ

```json
{"id": "20261109-1800-setup", "type": "mv_setup"}
```

MV専用のPython環境を作り、決まったライブラリだけを入れます。ランナー自身のPython環境（広告用の音声認識など）には触れません。

```json
{"id": "20261109-1810-analyze", "type": "mv_analyze",
 "audio": "C:\\Users\\user\\Videos\\MV制作\\song\\song.wav",
 "lyrics": "C:\\Users\\user\\Videos\\MV制作\\song\\lyrics.txt",
 "language": "ja", "whisper_model": "medium"}
```

歌詞ファイルはSunoの形式（`[Verse 1]`、`[Chorus]` などの行がセクション名になる）でそのまま使えます。Markdownの歌詞（`**曲名**` のような見出しつき）も読めて、見出しは歌われない行として除きます。セクションのタグがないときは、空行の長さでセクションを分け、音量から Chorus・Verse・Outro の名前を仮に付けます。解析の前にComfyUIのモデルをGPUから降ろし、8GBのVRAMを空けます。

## AEとフォント・素材のジョブ（ランナー v1.5）

```json
{"id": "20261110-1900-ae-probe", "type": "ae_script",
 "script": "C:\\AI model\\autopilot\\mv\\ae\\probe.jsx", "params": {"text": "テスト"},
 "timeout": 900, "collect": ["*.png", "*.aep", "*.json"]}
```

スクリプトを `AfterFX.exe -r` でAEに渡します。AEが開いていなければ起動します。スクリプトの中では `MVJOB.params`、`MVJOB.outdir`（ジョブの出力フォルダ）が使え、`MVJOB.result` に入れた値がジョブの結果に返ります。エラーは捕まえて返し、ダイアログは出しません。未保存のプロジェクトが開いているときは `MV.newProject()` が止まり、凌さんの作業は消しません。AEの「環境設定 → スクリプトとエクスプレッション → スクリプトによるファイルへの書き込みとネットワークへのアクセスを許可」がオンである必要があります。

```json
{"id": "20261110-1910-ae-render", "type": "ae_render",
 "project": "C:\\AI model\\autopilot\\work\\mv\\ae\\song\\song.aep", "rqindex": 1,
 "encode": {"input": "C:\\AI model\\autopilot\\work\\mv\\ae\\song\\png\\f_%05d.png", "fps": 30,
            "audio": "C:\\Users\\user\\Videos\\MV制作\\song\\song.wav", "out": "preview.mp4", "scale": "960:-2"}}
```

```json
{"id": "20261110-1920-dl", "type": "web_download", "url": "https://okoneya.jp/font/GenEiAntique_v6.0a.zip",
 "dest": "fonts", "subdir": "源暎アンチック", "license": "SIL OFL 1.1 (https://okoneya.jp/font/)"}
```

`mv/download_allowlist.json` に書いた配布元（とそのサブドメイン）からだけ、https で取ります。リダイレクト先も同じ一覧で確かめます。保存先は `Videos\MV制作\フォント` か `Videos\MV制作\素材` の下だけで、上書きはしません。zip はフォント・画像・動画・3Dなど決まった種類のファイルだけを展開し、取得元・日時・sha256・ライセンスを `_取得元.json` に残します。

```json
{"id": "20261110-1930-fonts", "type": "font_install"}
```

`Videos\MV制作\フォント` の書体を、Windowsの今のユーザーにだけインストールします（管理者権限なし）。同じ名前のフォントがすでにあれば触りません。AEなどは再起動すると新しいフォントが見えます。

## 曲・映像の扱い

このリポジトリは公開なので、曲、歌詞、リファレンス動画、生成した画像や動画は入れません。コードと設定だけを記録します。

## 使っている外部プロジェクト

- [facebookresearch/demucs](https://github.com/facebookresearch/demucs)（MIT）
- [CPJKU/beat_this](https://github.com/CPJKU/beat_this)（MIT）
- [jianfch/stable-ts](https://github.com/jianfch/stable-ts)（MIT）
- [librosa](https://github.com/librosa/librosa)（ISC）
- [Remotion](https://github.com/remotion-dev/remotion)（個人は無料のライセンス）
- Qwen Image 2.1（GGUF版）、MiniMax H3（動画）と MiniMax H3 Image（ComfyUI経由。[MiniMax-H3-Image Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE)。地域・売上によって条件あり）
- [OpenCV](https://github.com/opencv/opencv)（Apache-2.0。motion_check と palette_check のオプティカルフローと色の計算）
- AEの自動化で参考にしたもの: [inlife/nexrender](https://github.com/inlife/nexrender)（MIT。aerender に `-r` でスクリプトを渡す方式）、[kumoproductions/mcp-aftereffects](https://github.com/kumoproductions/mcp-aftereffects)（MIT。`AfterFX.exe -r` で動いているAEにスクリプトを送る方式）
