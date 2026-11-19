# 黒薔薇ノ契リ MV（3曲目）

- 素材: PC `C:\Users\user\Videos\MV制作\黒薔薇ノ契リ\`（wav 4:24.8、歌詞txt、ジャケ写参考）。歌詞・時刻の作業ファイルはリポジトリに入れず、プロジェクトの共有フォルダ `mv-workflow/songs/kurobara/` に置く（timing.json / timing_chars.json / align/）。
- 物語: 黒薔薇の花言葉。純愛（月の銀紫）→ 嫉妬（冷たい黒＋暗い赤）→ 憎しみ（夜の深紅）→ 語り（灰）→ 最後のサビで純愛と憎しみが交互。
- 文字: JIZURA（MVJZ）で組む。サビ・語り・最後のサビは1文字ずつ歌に合わせる（sync char）、Aメロ・Bメロは1画面まとめて声の0.06秒前。部品はフェーズごとの許可リスト（CALM/COLD/HATE/SPOKEN）。
- 絵: MiniMax H3 Image、ジャケ写を参照に12場面×2案（`make_img_jobs.py`）、選んだ方は `pick.json`、PCの使用先へ写すのは `make_copy_job.py`。
- 組み立て: `python make_kuro.py --id <ID> [--sections ...] [--stills] [--render] --outdir <dir>` → 区間ごとの spec と ae_script＋ae_render の組。spec はPCの `work\mv\kurobara\specs\<ID>\` へ。
