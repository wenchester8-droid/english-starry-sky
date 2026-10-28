# 内容授权与版权说明

英语星空的仓库里有几类来源不同的内容，授权各不相同。

## 1. 源代码

`src/`、`scripts/`、`pipeline/`、`cloud/` 等源代码采用 [MIT License](LICENSE)。界面和交互基于 [词光 Word Atlas](https://github.com/designfuchen/word-atlas)（MIT）改造。依赖包保留各自授权；Fraunces 字体为 SIL Open Font License 1.1。

## 2. 本项目自己做的内容：CC BY-NC 4.0

以下内容以 [知识共享 署名-非商业性使用 4.0 国际许可协议（CC BY-NC 4.0）](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans) 提供：

- 老师制作的插画（`public/atlas/**/img/`、`thumb/` 中不来自词光的部分）、首页和关于页插画、徽章图案；
- 用代码画的补位图、册数封面以外的图标和标志（`public/brand/mark.svg`）；
- 例句的挑选、改编和自己写的「拓展」句，以及所有中文翻译（`scripts/examples*.json`、课文点读译文）；
- 考点讲解和练习题（`public/data/*-points.json`、`pipeline/points/`）；
- 真题阅读馆的答案和解析；
- 冷知识卡、宝箱和徽章的文字。

**署名：** `英语星空 English Galaxy（https://github.com/wenchester8-droid/english-starry-sky）`，并注明是否做过修改。

例句和考点朗读由微软神经网络语音（通过 edge-tts）生成。

## 3. 来自词光 Word Atlas 的内容：CC BY 4.0

一部分单词的插画、美式发音和例句来自开源词库 [词光 Word Atlas](https://github.com/designfuchen/word-atlas)，授权为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，署名 `Word Atlas contributors`。和课本词义对不上的已经去掉，部分做过修改。

## 4. 人教版教材内容：版权归人民教育出版社

单词表（单词、音标、词性、释义、页码）、课本单词录音、课文和对话录音、课文原文、课本封面，均来自人民教育出版社《义务教育教科书·英语》（2022 年版课程标准修订版）七年级上册至九年级，**版权归人民教育出版社所有**。

本项目经出版社同意，用于非营利的教学和学习。**禁止任何商业用途**；转载、再分发前请自行取得出版社授权。

## 5. 中考真题和模拟卷：版权归原作者和出题单位

真题提示（`public/data/*-exams.json`）和真题阅读馆（`public/data/reading.json`、`public/reading/`）里的试题原文，来自河南省中考真题、河南各地模拟卷和部分学校考卷，版权归原作者和出题单位所有。经试题网站同意用于非营利教学，**禁止任何商业用途**。

## 6. 其他第三方素材

- 补位图中的表情图标：[Google Noto Emoji](https://github.com/googlefonts/noto-emoji)，Apache License 2.0。
- 部分环境音乐：来自 [Pixabay](https://pixabay.com/)，按 Pixabay Content License 使用；其余由 `scripts/make_ambience.py` 程序合成。

## 联系

如果你是某项内容的版权方，认为它不应出现在这里，请在 [Issues](https://github.com/wenchester8-droid/english-starry-sky/issues) 里告诉我们，我们会尽快处理。
