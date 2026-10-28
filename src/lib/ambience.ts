/** 环境音乐列表（单独放一个文件，存储进度的代码也能用，不会牵连播放声音的代码）。 */
export const AMBIENCE = [
  // db：把每首调到差不多的响度（约 -27 LUFS），换歌时不用重新调音量
  { id: "stars", label: "星河入梦", db: -2.9 },
  { id: "rain", label: "书窗听雨", db: -0.5 },
  { id: "sea", label: "晨海潮声", db: 0.8 },
  { id: "forest", label: "林间晨光", db: -0.6 },
  { id: "fire", label: "炉火微温", db: -0.1 },
  { id: "voyage", label: "夜航舟中", db: -0.3 },
  { id: "cafe", label: "午后咖啡", db: 0.3 },
  // 下面三首由 scripts/make_ambience.py 合成
  { id: "brown", label: "静水深流", db: 2.6 },
  { id: "musicbox", label: "八音旧梦", db: -12.5 },
  { id: "guzheng", label: "弦上清音", db: -7.7 }, // 比其他几首再轻 2 分贝（老师说原来太吵）
  // 下面二十首来自 Pixabay（Pixabay 许可，免署名），来源见 音乐素材/pixabay/来源清单.tsv，由 scripts/import_ambience.py 处理成循环
  { id: "crickets-night", label: "夏夜虫吟", db: 0.0 },
  { id: "rain-window", label: "檐雨敲窗", db: -0.8 },
  { id: "stream", label: "石上清泉", db: 0.0 },
  { id: "rain-forest", label: "夜雨空山", db: 0.4 },
  { id: "bamboo", label: "竹林听风", db: 3.4 },
  { id: "frogs", label: "稻花蛙声", db: -0.2 },
  { id: "cicadas", label: "蝉鸣盛夏", db: -1.5 },
  { id: "winter-wind", label: "风雪夜归", db: -1.2 },
  { id: "campfire", label: "篝火星野", db: 2.5 },
  { id: "train", label: "列车远行", db: 0.0 },
  { id: "library", label: "书页静翻", db: 0.0 },
  { id: "chimes", label: "风铃轻响", db: -1.0 },
  { id: "piano-study", label: "琴键伴读", db: 0.0 },
  { id: "piano-clouds", label: "云上琴音", db: 0.0 },
  { id: "lofi-study", label: "慢拍自习室", db: 0.0 },
  { id: "lofi-lamp", label: "灯下慢拍", db: 0.0 },
  { id: "bamboo-flute", label: "竹笛牧歌", db: 0.0 },
  { id: "guqin", label: "高山流水", db: -0.5 },
  { id: "guitar", label: "木吉他午后", db: 0.0 },
  { id: "harp", label: "竖琴星光", db: 0.0 },
] as const;
export type AmbienceId = (typeof AMBIENCE)[number]["id"];
