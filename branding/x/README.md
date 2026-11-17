# Xアカウント（@Ashley_motion0）のアイコンとヘッダー

凌さんが作ったアバター（`avatar_source.png`）から、Xのアイコンとヘッダーを作ったものです。HTMLで組み、Playwright（Chromium）で書き出しています。

- `x_icon_400x400.png` / `x_icon_800x800.png`: アイコン。Xは丸く切り抜くので、顔とヘッドホンが円の中に収まるように置いています。
- `x_header_1500x500.png`: ヘッダー。左下はアイコンが重なるので、文字とタイムラインは中央寄りに置いています。
- `preview_profile.png`: アイコンを重ねたときの見え方の確認用。

色はアバターから取っています（紺 #0a0e2a〜#1b1f5c、ジャージの水色 #4fe3e0、髪の薄紫 #a99cff）。

## 作り直し方

`header.html` と `icon.html` の文言や位置を直して、このフォルダで `node render.js` を実行します。文字はGoogle Fonts（Orbitron、Zen Kaku Gothic New、JetBrains Mono）を読み込んでいます。

書き出されるのは2倍サイズの `out_*.png` なので、次のように縮めて保存します。

```
python3 -c "from PIL import Image as I; I.open('out_x_header_1500x500.png').resize((1500,500),I.LANCZOS).save('x_header_1500x500.png'); i=I.open('out_x_icon_800.png'); i.save('x_icon_800x800.png'); i.resize((400,400),I.LANCZOS).save('x_icon_400x400.png')"
```
