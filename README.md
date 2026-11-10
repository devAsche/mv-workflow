# mv-workflow

Sunoで作った曲のミュージックビデオを、Claudeと凌さんのPC（RTX 3060 Ti 8GB）で、追加費用なしに作るためのワークフローです。

2026-11-10に作り方を一新し、合成は After Effects（AE）で行うことにしました。歌詞1行ごとに書体・大きさ・入り方・質感を変え、透過で切り抜いたキャラ絵をカメラで大きく動かします。考え方は Claude Doc「MVの新しい作り方（After Effects中心）」にまとめています。重い処理はすべてPCの常駐ランナー（`C:\AI model\autopilot`）でジョブとして動かし、画面の操作はしません。

## 流れ

1. **楽曲解析**（`mv_analyze` ジョブ）: Demucsでボーカルを分離し、Beat This!で拍と小節頭、stable-tsで歌詞を文字単位で音に合わせて `timing.json` を作る。
2. **絵コンテ**: 歌詞1行ごとに、時間・構図・使う絵と差分・文字の書体と動き・使う技・色を表にする。
3. **絵の素材**: キャラは大きく生成して透過で切り抜き、目元だけ・シルエット・逆光などの差分を作る。背景は別に用意する。
4. **AEで組み立て**（`ae_script` ジョブ）: 絵コンテからClaudeがExtendScriptを書き、`mv/ae/mvae.jsx` の部品を使ってコンプを組み、.aep を保存する。
5. **書き出し**（`ae_render` ジョブ）: aerender で静止画・低解像度・本番を書き出す。
6. **確認ループ**: コマを並べて点検し、直す。.aep は凌さんがAEで開いて手直しできる。

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
| `pc/comfy_graphs/` | ComfyUIのAPI形式ワークフロー（Qwen Image 2.1 GGUF など） |
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
- Qwen Image 2.1（GGUF版）、MiniMax H3（ComfyUI経由。H3は地域・売上によって商用利用の条件あり）
- AEの自動化で参考にしたもの: [inlife/nexrender](https://github.com/inlife/nexrender)（MIT。aerender に `-r` でスクリプトを渡す方式）、[kumoproductions/mcp-aftereffects](https://github.com/kumoproductions/mcp-aftereffects)（MIT。`AfterFX.exe -r` で動いているAEにスクリプトを送る方式）
