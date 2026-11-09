# mv-workflow

Sunoで作った曲のミュージックビデオを、Claudeと凌さんのPC（RTX 3060 Ti 8GB）で、追加費用なしに作るためのワークフローです。

方針は、歌詞のタイポグラフィ（リリックモーション）を主役にして、Blenderの3D空間と、Qwen Imageで作る数枚のキービジュアル、要所だけのMiniMax H3動画を重ねる形です。重い処理はすべてPCの常駐ランナー（`C:\AI model\autopilot`）でジョブとして動かします。

## 流れ

1. **楽曲解析**（`mv_analyze` ジョブ）: Demucsでボーカルを分離し、Beat This!で拍と小節頭、stable-tsで歌詞を文字単位で音に合わせて `timing.json` を作る。
2. **コンセプトと絵コンテ**: `timing.json` のセクションごとに「型」と色を決める。
3. **ルック開発**: サビ1回分だけを完成品質で作り、見た目を確定する。
4. **素材制作**: 3D（`blender` ジョブ）、キービジュアル（`comfy_graph` ジョブでQwen Image 2.1）、要所の動き（`comfy_h3` ジョブ）。
5. **合成と歌詞モーション**: Remotion（`remotion_render` ジョブ）で `timing.json` から歌詞を配置する。
6. **確認ループ**: 低解像度で書き出し、1秒ごとの一覧画像で点検して直す。
7. **最終書き出し**。

## フォルダ

| パス | 中身 |
| --- | --- |
| `pc/autopilot/mv_jobs.py` | ランナーに足すMV用ジョブ（`mv_setup`、`mv_analyze`）。PCでは `C:\AI model\autopilot\mv_jobs.py` に置く |
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

## 曲・映像の扱い

このリポジトリは公開なので、曲、歌詞、リファレンス動画、生成した画像や動画は入れません。コードと設定だけを記録します。

## 使っている外部プロジェクト

- [facebookresearch/demucs](https://github.com/facebookresearch/demucs)（MIT）
- [CPJKU/beat_this](https://github.com/CPJKU/beat_this)（MIT）
- [jianfch/stable-ts](https://github.com/jianfch/stable-ts)（MIT）
- [librosa](https://github.com/librosa/librosa)（ISC）
- [Remotion](https://github.com/remotion-dev/remotion)（個人は無料のライセンス）
- Qwen Image 2.1（GGUF版）、MiniMax H3（ComfyUI経由。H3は地域・売上によって商用利用の条件あり）
