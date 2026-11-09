# remotion（MVの合成と歌詞モーション）

`timing.json`（PCの `mv_analyze` ジョブの出力）と `plan.json`（絵コンテ）から、背景・歌詞・仕上げをまとめて1本の動画にします。曲の長さやセクションが変わっても、データを差し替えるだけで組み直せます。

## 層の構成

1. **背景**（`src/mv/Background.tsx`）: `plan.shots` に並べた画像・動画・色面を、小節頭で切り替える。ショットごとにカメラの動き（寄り・引き・左右上下）、拍でのズーム、小節頭での揺れ、カットの種類（そのまま・白フラッシュ・グリッチ・黒から・フェード）を持つ。
2. **歌詞**（`src/mv/Lyrics.tsx` と `templates/`）: 1文字ずつ、歌われた瞬間に出す。型は4つ。
   - `center`: 小さな横書きを中央に。文字がぼかしから浮き上がる（静かなAメロ向け）
   - `vertical`: 大きな縦書き明朝。文字が判を押すように落ち、輪郭の残像が広がる（サビ向け）
   - `impact`: 太いゴシックの1行。文字が跳ねて入り、色ずれが残る（ラストサビやドロップ向け）
   - `stack`: 左下に行が積み上がり、古い行は暗くなる（Bメロの盛り上げ向け）
3. **仕上げ**（`src/mv/Overlay.tsx`）: 小節頭の白フラッシュ、シネマバー、フィルムの粒子、周辺減光、タイトル、最後の暗転。

グリッチ（帯ずらし・色ずれ）は `src/mv/effects/` の自作エフェクトで、WebGLを使わず2Dキャンバスだけで描くため、どの環境でも同じ絵で書き出せます。

## フォント

Google Fontsから、その曲の歌詞に出てくる文字だけを取り寄せます（`src/mv/fonts.ts`）。和文フォント1書体で100ファイル以上ある分割読み込みを避けるためです。既定は明朝がShippori Mincho、ゴシックがZen Kaku Gothic New、太字がDela Gothic Oneで、`plan.fonts` で差し替えられます。

## 使い方

曲ごとのファイルは `public/<曲名>/` に置きます（公開リポジトリなので `public/` の中身はGitに入れません）。

```bash
# 絵コンテの下書きを作る（セクション名から型を、小節頭からカット割りを決める）
node scripts/make-plan.mts public/song/timing.json --title "曲名" --artist "名前" \
     --audio song/song.wav --media song/kv01.png,song/h3_01.mp4 > public/song/plan.json

# 書き出し（PCではランナーの remotion_render ジョブで同じことをする）
npx remotion render src/index.ts MV out/song.mp4 \
     --props '{"timingSrc":"song/timing.json","planSrc":"song/plan.json"}'
```

`--props` に `"debug": true` を足すと、左上に時刻・セクション・拍のランプが出ます。確認用の低解像度版は `--scale 0.5`、一部だけなら `--frames 900-1200` です。

Remotion Studio（`npm run dev`）では、48秒のサンプル曲（`src/mv/sample.ts`）で型や効果を確かめられます。

## plan.json の主な項目

| 項目 | 中身 |
| --- | --- |
| `palette` | 背景色・文字色・差し色 |
| `sections` | セクション名ごとの見た目。`"Chorus"` は `"Chorus 2"` にも効く。`lyric`（型）、`pulse`・`flash`・`shake`・`glitch`・`grain`・`dim`・`bars`・`tint` など |
| `lines` | 行番号ごとの上書き（型を変える、文字を直す、隠す） |
| `shots` | 背景の並び。`start`・`end`（秒）、`src`（public内のパス）、`move`、`cut`、`look` |
| `titleCard` | タイトルを出す時間 |
| `fadeOut` | 最後の暗転の秒数 |
