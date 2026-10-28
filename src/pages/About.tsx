import { ArrowUpRight, Heart } from "lucide-react";
import { APP_NAME } from "../lib/unit";
import { useAtlas } from "../atlas/context";
import { bookById } from "../lib/books";
import { REPO_URL, SOURCE_URL } from "../config";
import { useExams } from "../ui/ExamHint";

const BASE = import.meta.env.BASE_URL;

export function About() {
  const atlas = useAtlas();
  const exams = useExams();
  // 所有做好的册（七上、八上、九年级……），数字跟着词库走，以后加了新册不用改这里
  const shelf = atlas.shelf ?? [atlas];
  const total = shelf.reduce((n, b) => n + b.count, 0);
  // 下面那排数字按年级合计，不分上下册（以后加了七下、八下，自动并进七年级、八年级）
  const GRADE: Record<string, string> = { "7": "七年级", "8": "八年级", "9": "九年级" };
  const grades = new Map<string, number>();
  for (const b of shelf) {
    const g = GRADE[(b.book ?? "")[0]] ?? bookById(b.book ?? "").name;
    grades.set(g, (grades.get(g) ?? 0) + b.count);
  }
  const papers = exams?.papers ?? [];
  const zk = papers.filter((p) => p.kind === "zk");
  const years = zk.map((p) => p.year);
  const count = (kind: string) => papers.filter((p) => p.kind === kind).length;
  return (
    <div className="page about">
      <header className="about-hero">
        <img src={`${BASE}brand/og.webp`} alt="" />
        <div>
          <p className="eyebrow">关于{APP_NAME}</p>
          {/* 只在逗号处换行：手机上不会断成「课本的词，一 / 个一个点亮」 */}
          <h1 className="display">
            <span className="nowrap">课本的词，</span>
            <span className="nowrap">一个一个点亮。</span>
          </h1>
          <p className="lede">
            人教版初中《英语》课本「Vocabulary in Each Unit」里的 {total.toLocaleString()} 个词条（不含人名）。每个词都配课本原声和两句例句：一句课本原句，一句中考或模拟题里的句子（找不到合适原句时用改编句）。还有按单元整理的课文点读、语法和句型练习，以及河南中考真题提示。
          </p>
          <p className="lede">用自己的名字和密码登录，学习进度自动保存到云端，换手机也能接着学。</p>
          {grades.size > 1 && (
            <dl className="mini-stats about-books">
              {[...grades].map(([g, n]) => (
                <div key={g}>
                  <dt>{g}</dt>
                  <dd>
                    {n}
                    <small>个词</small>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      <div className="about-grid">
        <section className="panel">
          <h3 className="eyebrow">为什么记得住</h3>
          <ul className="feature-list">
            <li>
              <b>先看见。</b>每个词都配了一幅插画，大多画的就是单词卡上例句里的场景。
            </li>
            <li>
              <b>再想起。</b>选义、看图补句、听音辨词、拼写，从认得走到会写。
            </li>
            <li>
              <b>刚好在快忘时重逢。</b>FSRS 是新版 Anki 用的开源记忆算法，只在你快要遗忘时安排复习。
            </li>
            <li>
              <b>分数诚实。</b>只算第一次作答。答错的词会换个题型再见一面，但不会抬高正确率。
            </li>
            <li>
              <b>进度跟着你走。</b>各册共用一份进度，切换到别的册，以前学过的词照样按时复习。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">每天来一点</h3>
          <ul className="feature-list">
            <li>
              <b>切换册数。</b>点左上角的册名，七上、七下、八上、八下、九年级随时换。
            </li>
            <li>
              <b>做完今天的任务，开宝箱。</b>右上角的宝箱图标是「我的宝库」：今日宝箱、学完一个单元的单元宝箱、连续 7 天的周宝箱，没开的可以攒着。
            </li>
            <li>
              <b>宝箱里有什么。</b>插画皮肤碎片（攒够了解锁新插画主题）、999 种冷知识卡、补签卡、环境音乐、星图特效，运气好还有老师奖励券。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">快捷键</h3>
          <dl className="keys">
            <div>
              <dt>
                <kbd>⌘</kbd>
                <kbd>K</kbd> 或 <kbd>/</kbd>
              </dt>
              <dd>搜索任何词（各册一起搜）</dd>
            </div>
            <div>
              <dt>
                <kbd>1</kbd>–<kbd>4</kbd>
              </dt>
              <dd>选择答案</dd>
            </div>
            <div>
              <dt>
                <kbd>Enter</kbd>
              </dt>
              <dd>确认 / 继续</dd>
            </div>
            <div>
              <dt>
                <kbd>←</kbd> <kbd>→</kbd>
              </dt>
              <dd>词卡里切换上一个、下一个</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>关闭弹窗</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h3 className="eyebrow">真题和考点</h3>
          {papers.length > 0 && (
            <dl className="mini-stats about-papers">
              <div>
                <dt>河南中考</dt>
                <dd>
                  {zk.length}
                  <small>套</small>
                </dd>
              </div>
              <div>
                <dt>河南模拟卷</dt>
                <dd>
                  {count("mock")}
                  <small>套</small>
                </dd>
              </div>
              <div>
                <dt>湖北等地学校考卷</dt>
                <dd>
                  {count("school")}
                  <small>份</small>
                </dd>
              </div>
            </dl>
          )}
          <ul className="feature-list">
            <li>
              <b>单词考过没有。</b>在{years.length ? ` ${Math.min(...years)}–${Math.max(...years)} 年的` : ""}河南中考、河南各地模拟卷和湖北等地学校考卷里自动查找。单词卡底部的黄色提示条会写出现过几次，点开能看到出处和原句。
            </li>
            <li>
              <b>考点考过没有。</b>按河南中考语篇填空、补全对话的标准答案逐题判断。标着「中考考过」的，是真的考过。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">内容从哪里来</h3>
          <p className="muted">单词表、音标、释义，单词和课文的录音，课文原文，都来自人教版初中《英语》教材，版权归人民教育出版社所有，经出版社同意用于非营利教学，禁止商用。</p>
          <p className="muted">例句优先用课本原句，另一句选自河南中考真题和模拟卷；找不到合适原句的，标着「改编」或「拓展」。</p>
          <p className="muted">
            插画大部分由老师制作，另有一部分和美音、界面代码来自开源项目「词光 Word Atlas」（代码 MIT，词库与插画 CC BY 4.0，署名 Word Atlas contributors）。词光的插画和课本词义对不上的，已经去掉了。还没画好插画的词，先用 Google Noto Emoji（Apache 2.0）拼的补位图，老师的新图画好后会替换。
          </p>
          <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
            词光 Word Atlas 开源项目 <ArrowUpRight size={14} />
          </a>
          <a className="link" href={SOURCE_URL} target="_blank" rel="noreferrer">
            英语星空的源代码（GitHub） <ArrowUpRight size={14} />
          </a>
        </section>
      </div>
      <p className="colophon">
        <Heart size={14} /> 做给每一个想把课本单词学扎实的同学。
      </p>
      <p className="colophon about-version">版本 {__VERSION__}</p>
    </div>
  );
}
