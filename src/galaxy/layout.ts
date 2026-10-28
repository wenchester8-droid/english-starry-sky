import type { Atlas } from "../atlas/types";
import { hashSeed } from "../lib/text";

/** Nineteen star colours, one per IELTS topic, tuned to glow on deep navy. */
export const TOPIC_COLORS = [
  "#f2c46d", "#ef8f6b", "#8fd0c8", "#9fb8ff", "#9be38f", "#ff9fa8", "#f7d9a8", "#c6a7ff", "#ffd36b", "#7fc4ff",
  "#ffb38a", "#86e0b5", "#d8c3a5", "#b5e48c", "#ffe6b0", "#ff8fc3", "#a8d8ff", "#ffcf7a", "#e0b0ff",
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Deterministic pseudo-random numbers per word, so the galaxy looks the same everywhere. */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GalaxyLayout {
  n: number;
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  ids: string[];
  index: Map<string, number>;
  /** Centre of each topic cluster, for floating labels. */
  topicCenters: [number, number, number][];
}

/**
 * A spiral galaxy: each IELTS topic owns an arm, easy words sit near the core and
 * the hardest at the rim, so learning visibly travels outward.
 */
export function layoutGalaxy(atlas: Atlas): GalaxyLayout {
  const words = atlas.words;
  const n = words.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const arms = atlas.topics.length;
  // Big topics get a wider arm so every arm has a similar star density.
  const counts = new Array(arms).fill(0);
  words.forEach((w) => counts[w.topic]++);
  const avg = n / arms;
  words.forEach((w, i) => {
    const r = rand(hashSeed(w.id));
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    const radius = 0.1 + (w.cefr / Math.max(1, atlas.cefr.length - 1)) * 0.72 + r() * 0.16;
    const arm = (w.topic / arms) * Math.PI * 2;
    const spread = Math.sqrt(Math.max(0.6, counts[w.topic] / avg));
    const angle = arm + radius * 3.4 + gauss() * (0.05 + 0.03 / radius) * spread;
    const thick = 0.05 * (1 - radius * 0.6) * spread;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = gauss() * thick;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    const [cr, cg, cb] = rgb(TOPIC_COLORS[w.topic % TOPIC_COLORS.length]);
    colors.set([cr, cg, cb], i * 3);
    seeds[i] = r();
  });
  // Label each arm where it is widest, half-way out.
  const mid = 0.62;
  return {
    n,
    positions,
    colors,
    seeds,
    ids: words.map((w) => w.id),
    index: new Map(words.map((w, i) => [w.id, i])),
    topicCenters: atlas.topics.map((_, t) => {
      const a = (t / arms) * Math.PI * 2 + mid * 3.4;
      return [Math.cos(a) * mid, 0, Math.sin(a) * mid] as [number, number, number];
    }),
  };
}

/** 星座最多用几颗星 */
const CONSTELLATION_STARS = 7;
/** 星座里两颗星至少隔多远（星系半径约 1） */
const CONSTELLATION_GAP = 0.07;
/** 只在起点附近这么远的范围里挑，免得一条线横穿整个星系 */
const CONSTELLATION_REACH = 0.32;

/**
 * 一个单元连成的星座：从单元第一个词那颗星出发，取离它最近的几颗同单元的星，
 * 再按「每次连最近的下一颗」排成一笔画。返回星的下标，顺序就是连线顺序。
 */
export function constellationStars(layout: GalaxyLayout, unitIdx: number[]): number[] {
  if (!unitIdx.length) return [];
  const P = layout.positions;
  const d2 = (a: number, b: number) =>
    (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  const anchor = unitIdx[0];
  // 由近到远挑，和已挑的星都隔开一段距离，星座才舒展得开，不会挤成一团
  const near = [anchor];
  for (const i of [...unitIdx].sort((a, b) => d2(anchor, a) - d2(anchor, b))) {
    if (near.length >= CONSTELLATION_STARS || d2(anchor, i) > CONSTELLATION_REACH ** 2) break;
    if (near.every((j) => d2(i, j) >= CONSTELLATION_GAP ** 2)) near.push(i);
  }
  const path = [anchor];
  const left = new Set(near.filter((i) => i !== anchor));
  while (left.size) {
    const last = path[path.length - 1];
    let best = -1;
    for (const i of left) if (best < 0 || d2(last, i) < d2(last, best)) best = i;
    path.push(best);
    left.delete(best);
  }
  return path;
}
