# 英语星空（新版）

人教版初中英语练习网页（七上、七下、八上、八下、九年级五册），界面基于开源项目 [词光 Word Atlas](https://github.com/designfuchen/word-atlas)（MIT）改造。

## 打开方式
在这个文件夹里运行：

```bash
npm run dev
```

电脑浏览器打开 http://localhost:5191 ；手机连同一个网络，打开 `http://电脑的地址:5191`。

## 有什么
- **今日**：每天的新词和复习（FSRS 算法安排），学习路线按课本 10 个单元排列。
- **图鉴 / 星图**：285 个课本词条（不含人名），按单元和类型（课标重点词、一般词汇、短语、地名与专名）浏览；星图里每学会一个词点亮一颗星。
- **课本**：每个单元先是「课文与对话」点读（课本原声，点一句读一句，也能整段播放），再是 28 个语法、句型考点，149 道练习题，带解析和错题重练。
- **练习**：单词听写、英文听写、中文听写（纸笔默写，手机上对答案）。
- 词卡和考点页底部的「!」提示条：在真题里出现过几次，点开看原句。

## 内容放在哪里
| 位置 | 内容 | 怎么更新 |
|---|---|---|
| `public/atlas/` | 词库（词光格式） | 运行 `python3 scripts/build_atlas.py`，从 `../app/public/data/7a.json` 和课本录音生成 |
| `public/data/7a-lessons.json`、`public/lessons/7a/` | 课文点读：逐句文字和时间、课本录音 | 见下面「课文点读」 |
| `public/data/7a-points.json` | 考点讲解和练习题 | 直接改文字、加题 |
| `public/data/7a-exams.json` | 真题提示 | 在 `../app` 里运行 `scripts/build_exams.py` 后复制过来 |

词表、录音切分、真题统计这些脚本还在 `../app/scripts/`，说明见 `../app/README.md`。

## 换插画和封面
1. 按 `../插画/插画生成清单.md` 生成图片，文件名用清单里的（如 `make-friends.png`），放进 `../插画/新图/`；
2. 运行 `python3 scripts/build_atlas.py <ffmpeg路径>`，新图会自动转成网页用的大小，优先于词光的插画；封面（hero、og、topic-key 等）也一样。

## 课文点读
1. 课本录音逐词识别（Python 3.12 + faster-whisper，很慢，可断点续跑）：`../app/scripts/transcribe_book_audio.py ffmpeg 模型目录 录音目录 ../app/scripts/build/book_audio_words.json`
2. `python3 scripts/build_lessons.py ../app/scripts/build/book_audio_words.json 课本全文.txt`：逐词对齐课本原文，生成 `public/data/7a-lessons.json`。听错的人名在脚本里的 `FIX` 表补。
3. 对不上课本、保留识别文字的句子列在 `课文点读_待核对.md`。
4. 参考译文在 `scripts/lessons_zh.tsv`（每行「英文<Tab>中文」，老师可直接改中文），改完重跑第 2 步。点读页默认只显示英文，学生点「显示中文」才出现。

## 朗读
- 单词发音：课本原声。
- 单词卡例句（`scripts/examples7a.json`，课本句 + 中考句，老师可直接改文字）和考点朗读：微软神经网络英音（Sonia、Ryan、Libby 三个声音轮流，对话句每行换人），见 `scripts/neural_tts.py`。需要 Python 3.12 的 `edge-tts`，用环境变量 `EDGE_TTS` 指定它的路径。
- 改了例句后：`python3 scripts/build_example_audio.py <ffmpeg路径>`，再 `python3 scripts/build_atlas.py <ffmpeg路径>`；只会重录改过的句子。
- 改了考点题目后：`python3 scripts/build_points_audio.py <ffmpeg路径>`，只补录新句子；改过的句子要先删掉 `public/audio/points/` 里对应的 mp3。

## 环境音乐
- 列表在 `src/lib/ambience.ts`（`db` 是每首的音量微调）；能从宝箱开出的在 `src/store/gameState.ts` 的 `MUSIC` 里。
- 专注棕噪声、八音盒、古筝小调是程序合成的：`python3 scripts/make_ambience.py <ffmpeg路径> [只重做某几首]`。
- 其余新加的二十首来自 Pixabay（Pixabay 许可，可免费使用、免署名），原始文件和来源清单在 `../音乐素材/pixabay/`。加新素材：把 mp3 放进那个文件夹，运行 `python3 scripts/import_ambience.py <ffmpeg路径> ../音乐素材/pixabay 名字…`，会自动截长度、做无缝循环、统一音量。

## 署名与版权
- 课本单词、音标、释义和录音来自人教版《英语》七年级上册，仅供本班学习使用，不要公开发布。
- 界面代码来自词光 Word Atlas（MIT 授权，见 LICENSE）；插画、美音、例句来自词光词库（CC BY 4.0，署名 Word Atlas contributors，见 CONTENT_LICENSE.md）。「关于」页面里写了署名，不要删掉。


## 新加一册（七下、八下就是这样做的，册号 7b / 8b）
在 `../app` 里：
1. `python3 scripts/parse_vocab.py 课本.pdf 词表首页 词表末页 scripts/build/vocab<册号>.json`（页码从 0 数）
2. `python3 scripts/build_book.py scripts/build/vocab<册号>.json public/data/<册号>.json`：人名、地名、书名的归类和词光词义对不上的词（`ATLAS_SKIP_BOOK`）都在这个脚本顶部。
3. 单词原声：`align_whisper.py`（低分项人工核对，写进 `OVERRIDES`）→ `cut_audio.py`；词光素材：`fetch_word_atlas.py`；再跑一次 build_book.py 带上对齐结果和词光对照。
4. 例句：`python3 scripts/build/ex_pick.py show <册号> 起始 个数` 看候选，挑好写进文本后 `ex_pick.py save <册号> 挑选.txt`，存到 `web/scripts/examples<册号>.json`。
5. 考点：`scripts/points/points<册号>.py` 生成 `public/data/<册号>-points.json`；真题提示：`build_exams.py`。
6. 课文点读：`transcribe_book_audio.py` 转文字。

在 `web` 里：
7. `build_example_audio.py ffmpeg <册号>`、`build_points_audio.py ffmpeg <册号>` 录朗读。
8. 没有插画的词：在 `scripts/fill_pics.tsv` 给每个词挑一两个表情，`python3 scripts/make_fill_pics.py ffmpeg` 画补位图（存 `../插画/补位图/`）。
9. `python3 scripts/build_atlas.py ffmpeg <册号>` 生成图鉴；`build_lessons.py` + `copy_lesson_audio.py` 做课文点读。
10. `src/lib/books.ts` 里把这一册标 `ready: true`，`public/sw.js` 的 VERSION 升一级。
