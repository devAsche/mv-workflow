# MiniMax H3 Image: 基準の1枚を参照にした指示文の型

グラフは `pc/comfy_graphs/h3_image_ref1_v1.json`（参照1枚）。ジョブで変えるのはノード4の `image`（ComfyUIの `input` に置いた参照画像の名前）、ノード5の `prompt`・`width`・`height`、ノード7の `seed`、ノード9の `filename_prefix` だけ。6ステップ・cfg 1 の蒸留モデルなので、ネガティブプロンプトは効かない。避けたい物は文の中で否定する。

```json
{"id": "YYYYMMDD-HHMM-song-p01", "type": "comfy_graph",
 "graph": "C:\\AI model\\autopilot\\work\\mv\\graphs\\h3_image_ref1_v1.json",
 "set_inputs": {"4": {"image": "mv_song_key_ref.png"},
                "5": {"prompt": "<1 構図と被写体> <2 画風> <3 避ける物>", "width": 3072, "height": 1728},
                "7": {"seed": 7100}, "9": {"filename_prefix": "mv/song_p01"}},
 "timeout": 5400}
```

## 指示文の順番

1. 構図と被写体。何がどこにどの大きさであるか。人物が少ししか映らない足元や手でも、基準の1枚の人物の服と体つきを書く（書かないと別人の足元になる。2026-11-12 の試し描き t5）。
2. 画風。参照画像は `<Picture 1>` で呼ぶ。

   > Match the illustration style of <Picture 1> exactly: <線・塗り・色を言葉で>. Use <Picture 1> only as a reference for the style, the character design and the world; do not copy its composition.

   2026-11-12 に使った「線・塗り・色」の言葉（青紫がかった灰色1色のジャケ写向け）:

   > a detailed Japanese anime illustration with fine, dense ink linework, thin scratchy hatching, soft painterly shading, and an almost monochrome palette of desaturated blue-violet greys with deep near-black shadows and pale lavender-grey highlights

3. 避ける物。`The image contains no text, no letters and no title lettering.` のように否定文で書く。雨はAEで降らせるので `The air is still and clear between showers.` と書いて描かせない。

## 大きさ

| その絵がショットの中でいちばん寄る拡大率（1920幅の出力） | 作る大きさ | 1枚の時間（RTX 3060 Ti、モデル読み込み後） |
| --- | --- | --- |
| 150%まで | 3072×1728 | 約70秒 |
| 200%まで | 4096×2304 | 約78秒 |

## わかっている癖

- 本数などの数は守らない（電線5本の指示で9本）。数に意味がある線はAEで引く。
- 小物が崩れることがある（傘をさしながら別の柄を握る）。1枚につき seed を変えて2〜3案作り、選ぶ。
- 参照なし（`h3_image_t2i_v1.json`）だと平らなセル寄りの絵になり、基準の1枚から離れる。

ライセンスは [MiniMax-H3-Image Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE)。対象地域（EU・英国・韓国・米国を除く）とその外での生成物の扱いの条項がある。
