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
2. 画風。参照画像は `<Picture 1>` で呼ぶ。人物が入る絵と、人を入れない絵とで言葉を分ける。

   人物が入る絵（主人公の絵を基準に、背景も同じ手で描かせる）:

   > Match the look of the young woman in <Picture 1> exactly, and paint everything else in the picture with the same hand: a soft, painterly Japanese anime illustration in which forms are modelled with smooth brush shading and edges are defined mostly by tone. The only lines are very fine, tapered, hairline-thin dark lines, as thin as the lines of her hair and her face. Umbrellas, poles, wires, fences, buildings and clothes are drawn with exactly the same thin lines and soft brushwork as her hair. No thick or uniform black outlines, no inked comic-book outlines, no pen hatching and no cross-hatching. An almost monochrome palette of desaturated blue-violet greys with deep near-black shadows and pale lavender-grey highlights. Use <Picture 1> only as a reference for the style, the character design and the world; do not copy its composition.

   人を入れない絵（上の言葉は「the young woman」を名指しするので、人なしと書いても主人公が入ってくる。2026-11-12 の u2）:

   > Paint this scene with exactly the same hand as <Picture 1>: a soft, painterly Japanese anime illustration in which forms are modelled with smooth brush shading and edges are defined mostly by tone. The only lines are very fine, tapered, hairline-thin dark lines, as thin as the finest lines of the hair in <Picture 1>. Poles, wires, fences and buildings are drawn with these same thin lines and the same soft brushwork. No thick or uniform black outlines, no inked comic-book outlines, no pen hatching and no cross-hatching. An almost monochrome palette of desaturated blue-violet greys with deep near-black shadows and pale lavender-grey highlights. Use <Picture 1> only as a reference for the style and the world; do not copy its composition and do not include the young woman from it. This is an empty scene: there are no people, no human figures and no silhouettes anywhere in the picture.

   使ってはいけない言葉: `ink linework`、`hatching`。2026-11-12 の最初の試し描きでこれを書いたら、人物はやわらかい塗りのまま、傘・電柱・道路など人物以外だけが太い黒の輪郭とペンの斜線の劇画調になり、同じ作者の絵に見えなかった（凌さんの指摘）。

   髪が見える絵には次を足す（髪の先が平たい半透明の帯に溶ける、1本だけの長い糸が画面を横切る、耳から垂れる、を防ぐ）:

   > Her long, pale silver-lavender hair falls in smooth, tidy locks that stay close to the mass of her hair, and each lock ends in a crisp, tapered tip. There are no loose flyaway hairs, no single long threads floating out over the background, no wide flat ribbon-like strands, and nothing drips from her hair or her ear. Her ear is a natural human ear with a clearly drawn rim.

   寄りの絵では、髪の文の頭に `The air is completely still and there is no wind: her long hair is damp from the rain and hangs straight down under its own weight in heavy, smooth locks that lie against her shoulders, her jacket and her back.` を足し、構図の文の「the same hair」は「the same hair colour and length」にする（参照の跳ねた毛を写させないため）。それでも細い毛が残ることがあるので、等倍で髪の外側と耳を見て選ぶ。

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
- 画風の文に人物を名指しする言葉（`the young woman in <Picture 1>`）があると、構図の文に `No people` と書いても人物が入る。人を入れない絵は、上の「人を入れない絵」の文を使う。
- 髪の言葉を足すと、引き・後ろ姿・ビニール越し・足元では髪の溶けと糸が消えた。基準の1枚に近い寄り（ジャケ写の16:9描き直し）では、「風がなく、濡れた髪が重く垂れる」と書くと金網を横切る長い糸は消えたが、髪の外側の細い毛と平たい毛先は6案とも残った。基準の1枚自体に跳ねた毛があるので、参照から写っていると推測している（未検証）。

ライセンスは [MiniMax-H3-Image Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE)。対象地域（EU・英国・韓国・米国を除く）とその外での生成物の扱いの条項がある。
