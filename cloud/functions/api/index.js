// 学生进度上云 + 老师统计。前端通过 HTTP 路由 /api 调用，老师口令放在函数环境变量里，不进网页代码。
// 白名单登录：老师在老师页把「班级 + 编号」加进名单（accounts 表）并填上姓名，学生用「名字 + 密码」登录。
// 数据存在环境自带的 PostgreSQL 里（accounts、students 两张表，开了行级安全且没有放行规则，只有云函数能读写）。
// 初始密码 123456，第一次登录后必须改成自己的；忘了密码由老师重置回 123456。
// 名单外的人可以自己注册（只能注册学生），放进「自由学习」组：不进老师页、不出老师奖励券。
// 防刷：同一个 IP 每天只能注册 1 个，全站每天最多 REG_PER_DAY 个；注册后 90 天没用过的账号自动清掉。
const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");

// 服务端 API Key（service_role）只放在函数环境变量里，用它读写 PostgreSQL
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV, accessKey: process.env.CLOUDBASE_APIKEY });
const COL = "students";
const ACC = "accounts";
const PAGE = 20;

const TEACHER = process.env.TEACHER_PASS;
const DEFAULT_PASS = "123456";
const MAX_BYTES = 2 * 1024 * 1024;
/** 连续输错这么多次，锁一会儿，防止别人挨个试密码 */
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

const reply = (status, data) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(data),
});

function parse(event) {
  if (event && typeof event.body === "string") {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    return JSON.parse(raw || "{}");
  }
  return event || {};
}

const docId = (cls, code) => `${cls}-${code}`;
const CLS_RE = /^[0-9A-Za-z.\u4e00-\u9fa5]{1,12}$/;
// 老师名单是 1–99 号；自己注册的「自由学习」组编号会更大
const CODE_RE = /^[1-9]\d{0,5}$/;

/* ---------- 自己注册 ---------- */
const FREE = "自由学习";
const REG_PER_DAY = 200;
const REG_PER_IP = 1;
const IDLE_MS = 90 * 24 * 3600 * 1000;
/** 名字：2–12 个汉字、字母或数字 */
const NAME_RE = /^[0-9A-Za-z\u4e00-\u9fa5]{2,12}$/;
/** 注册记录、编号计数、清理日期这类内部数据，也放在 students 表里，cls 用 META 区分，老师页会跳过 */
const META = "_meta";
/** 按北京时间算「今天」 */
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
/** IP 不明文存：加盐后取一段哈希，只用来数「这个 IP 今天注册过几个」 */
const ipKey = (ip) => crypto.createHash("sha256").update(`qishang:${ip}`).digest("hex").slice(0, 16);
const cleanCls = (v) => String(v || "").trim().replace(/班$/, "");

const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString("hex");
const newToken = () => crypto.randomBytes(16).toString("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
function checkPass(acc, pass) {
  if (!acc.hash) return same(pass, DEFAULT_PASS);
  return same(hash(pass, acc.salt), acc.hash);
}

const table = (name) => app.rdb().from(name);
async function run(q) {
  const { data, error } = await q;
  if (error) throw new Error(`${error.code || ""} ${error.message || JSON.stringify(error)}`);
  return data;
}

/* 表里是下划线字段，代码里沿用原来的写法 */
const accIn = (r) => r && { cls: r.cls, code: r.code, name: r.name || "", salt: r.salt, hash: r.hash, token: r.token, fails: r.fails || 0, failAt: Number(r.fail_at) || 0 };
const accOut = (a) => {
  const r = {};
  for (const [k, v] of Object.entries(a)) r[k === "failAt" ? "fail_at" : k] = v;
  return r;
};
const stuIn = (r) => r && { cls: r.cls, code: r.code, updated: Number(r.updated) || 0, data: r.data };

async function getDoc(id, col = COL) {
  const rows = await run(table(col).select("*").eq("id", id).limit(1));
  const r = rows && rows[0];
  return col === ACC ? accIn(r) : stuIn(r);
}

/** 整行覆盖（没有就新建） */
async function setDoc(id, data, col = COL) {
  const row = col === ACC ? { salt: null, hash: null, token: null, fails: 0, fail_at: 0, ...accOut(data) } : data;
  await run(table(col).upsert({ id, ...row }, { onConflict: "id" }));
}

/** 只改给出的字段 */
async function updateDoc(id, fields, col = ACC) {
  await run(table(col).update(col === ACC ? accOut(fields) : fields).eq("id", id));
}

async function removeDoc(id, col = ACC) {
  await run(table(col).delete().eq("id", id));
}

async function getMeta(key) {
  const d = await getDoc(`${META}-${key}`);
  return (d && d.data) || {};
}
async function setMeta(key, data) {
  await setDoc(`${META}-${key}`, { cls: META, code: key, updated: Date.now(), data });
}

/** 某个表里某个班的所有行（只取要用的列） */
async function rowsOf(col, cls, cols) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await run(table(col).select(cols).eq("cls", cls).order("id").range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** 一天清理一次：「自由学习」组里 90 天没用过的账号（没同步过的按注册那天算），连同进度一起删掉 */
async function cleanupIdle() {
  const day = today();
  const m = await getMeta("cleanup");
  if (m.day === day) return 0;
  await setMeta("cleanup", { day });
  const [accs, docs] = await Promise.all([rowsOf(ACC, FREE, "id"), rowsOf(COL, FREE, "id,updated")]);
  const last = new Map(docs.map((d) => [d.id, Number(d.updated) || 0]));
  const born = (await getMeta("born")).at || {};
  const now = Date.now();
  let n = 0;
  for (const a of accs) {
    const t = last.get(a.id) || born[a.id] || 0;
    if (t && now - t > IDLE_MS) {
      await removeDoc(a.id, ACC);
      await removeDoc(a.id, COL);
      delete born[a.id];
      n++;
    }
  }
  if (n) await setMeta("born", { at: born });
  return n;
}

/* 已登录的请求带 token（登录时发的），不再每次传密码 */
async function byToken(b) {
  const cls = cleanCls(b.cls);
  const code = String(b.code || "");
  if (!CLS_RE.test(cls) || !CODE_RE.test(code) || !b.token) return { error: "请重新登录" };
  const acc = await getDoc(docId(cls, code), ACC);
  if (!acc || !acc.token || !same(b.token, acc.token)) return { error: "请重新登录" };
  return { cls, code, acc };
}

/* 老师页只要汇总后的数字，每个学生压成一小段，不把整份进度传回去 */
function summarize(d) {
  const p = (d.data && d.data.progress) || {};
  const qa = (d.data && d.data.qa) || {};
  const cards = p.cards || {};
  const lapses = {};
  let mastered = 0;
  for (const [id, c] of Object.entries(cards)) {
    if (c && c.lapses > 0) lapses[id] = c.lapses;
    if (c && c.st === 2 && c.s >= 21) mastered++;
  }
  const kp = {};
  for (const r of Object.values(qa)) {
    if (!r || !r.kp) continue;
    const k = (kp[r.kp] = kp[r.kp] || [0, 0, 0]); // 做过几次、做对几次、现在还错着几题
    k[0] += r.n || 0;
    k[1] += r.ok || 0;
    if (!r.last) k[2]++;
  }
  // 挑战模式 · 真题阅读：读了几篇、第一次做题一共对了几个、一共几个
  const reading = Object.values(p.reading || {});
  const rd = [reading.length, 0, 0];
  for (const r of reading) {
    rd[1] += Number(r && r.right) || 0;
    rd[2] += Number(r && r.total) || 0;
  }
  return {
    cls: d.cls,
    code: d.code,
    updated: d.updated,
    challenge: !!(d.data && d.data.settings && d.data.settings.challenge),
    rd,
    learned: Object.keys(cards).length,
    mastered,
    days: p.days || {},
    mistakes: (p.mistakes || []).slice(0, 40),
    lapses,
    kp,
  };
}

/** 老师名单里的班（不含「自由学习」组和内部数据行，人多了也不会拖慢老师页） */
async function allDocs(col = COL) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await run(table(col).select("*").neq("cls", FREE).neq("cls", META).order("id").range(from, from + PAGE - 1));
    out.push(...rows.map(col === ACC ? accIn : stuIn));
    if (rows.length < PAGE) return out;
  }
}

exports.main = async (event, context) => {
  if (event && event.httpMethod === "OPTIONS") return reply(204, {});
  let b;
  try {
    b = parse(event);
  } catch {
    return reply(400, { error: "请求格式不对" });
  }
  try {
    if (b.action === "classes") {
      const classes = [...new Set((await allDocs(ACC)).map((a) => a.cls))].sort((x, y) => x.localeCompare(y, "zh", { numeric: true }));
      return reply(200, { ok: true, classes });
    }
    if (b.action === "register") {
      // 只能注册学生：名字 + 密码，进「自由学习」组
      const name = String(b.name || "").trim();
      const pass = String(b.pass || "");
      if (!NAME_RE.test(name)) return reply(400, { error: "名字要 2 到 12 个字，只能用汉字、字母和数字" });
      if (pass.length < 4 || pass.length > 20) return reply(400, { error: "密码要 4 到 20 位" });
      if (pass === DEFAULT_PASS) return reply(400, { error: "不能用 123456，换一个吧" });
      if ((await run(table(ACC).select("id").eq("name", name).limit(1))).length) return reply(409, { error: `已经有人叫「${name}」了，请在名字后面加个数字，比如「${name}2」` });
      const day = today();
      const reg = await getMeta(`reg-${day}`);
      const ips = reg.ips || {};
      if ((reg.n || 0) >= REG_PER_DAY) return reply(429, { error: "今天的注册名额已经满了，明天再来吧（也可以先用游客身份学）" });
      let ip = "";
      try {
        ip = cloudbase.getCloudbaseContext(context).TCB_SOURCE_IP || "";
      } catch {
        /* 拿不到 IP 就只按全站总数限制 */
      }
      const ik = ip ? ipKey(ip) : "";
      if (ik && (ips[ik] || 0) >= REG_PER_IP) return reply(429, { error: "这个网络今天已经注册过账号了，明天再来吧（也可以先用游客身份学）" });
      // 编号从计数器里取；万一撞上（两个人同时注册），往后挪一个
      const counter = await getMeta("counter");
      let code = Math.max(1, Number(counter.next) || 1);
      for (;;) {
        if (!(await getDoc(docId(FREE, code), ACC))) break;
        code++;
      }
      const salt = crypto.randomBytes(8).toString("hex");
      const token = newToken();
      await setDoc(docId(FREE, code), { cls: FREE, code: String(code), name, salt, hash: hash(pass, salt), token }, ACC);
      await setMeta("counter", { next: code + 1 });
      if (ik) ips[ik] = (ips[ik] || 0) + 1;
      await setMeta(`reg-${day}`, { n: (reg.n || 0) + 1, ips });
      const born = await getMeta("born");
      await setMeta("born", { at: { ...(born.at || {}), [docId(FREE, code)]: Date.now() } });
      await cleanupIdle().catch((e) => console.error("cleanup", e));
      return reply(200, { ok: true, token, cls: FREE, code: String(code), name, mustChange: false, updated: 0, data: null });
    }
    if (b.action === "login") {
      // 学生只填名字和密码；不同班有同名的，先回一个 needClass 让学生选班级（同班重名老师录名单时已经区分开）
      let acc;
      if (b.name !== undefined) {
        const name = String(b.name || "").trim();
        if (!name || name.length > 12) return reply(403, { error: "请填写自己的名字" });
        let found = (await run(table(ACC).select("*").eq("name", name))).map(accIn);
        if (!found.length) return reply(403, { error: "名单里没有这个名字，检查一下有没有写错，或者找老师" });
        if (found.length > 1) {
          const cls = cleanCls(b.cls);
          if (!cls) return reply(200, { ok: true, needClass: true, classes: found.map((a) => a.cls).sort((x, y) => x.localeCompare(y, "zh", { numeric: true })) });
          found = found.filter((a) => a.cls === cls);
          if (found.length !== 1) return reply(403, { error: "这个班里没有这个名字，请重新选班级" });
        }
        acc = found[0];
      } else {
        // 旧版网页还在用班级 + 编号登录
        const cls = cleanCls(b.cls);
        const code = String(b.code || "");
        if (!CLS_RE.test(cls) || !CODE_RE.test(code)) return reply(403, { error: "班级或编号不对" });
        acc = await getDoc(docId(cls, code), ACC);
        if (!acc) return reply(403, { error: "名单里没有这个编号，请找老师" });
      }
      const id = docId(acc.cls, acc.code);
      if (acc.fails >= MAX_FAILS && Date.now() - (acc.failAt || 0) < LOCK_MS)
        return reply(429, { error: "密码错太多次了，过 10 分钟再试，或找老师重置" });
      if (!checkPass(acc, String(b.pass || ""))) {
        const fails = Date.now() - (acc.failAt || 0) < LOCK_MS ? (acc.fails || 0) + 1 : 1;
        await updateDoc(id, { fails, failAt: Date.now() });
        return reply(403, { error: acc.hash ? "密码不对（忘了就找老师重置）" : "密码不对，第一次登录的密码是 123456" });
      }
      // 同一个学生多台手机共用一个 token；改密码时换新的，旧手机就要重新登录
      const token = acc.token || newToken();
      await updateDoc(id, { token, fails: 0 });
      const d = await getDoc(id);
      return reply(200, { ok: true, token, cls: acc.cls, code: acc.code, name: acc.name, mustChange: !acc.hash, updated: d ? d.updated : 0, data: d ? d.data : null });
    }
    if (b.action === "sync") {
      const s = await byToken(b);
      if (s.error) return reply(403, s);
      const d = await getDoc(docId(s.cls, s.code));
      return reply(200, { ok: true, name: s.acc.name, mustChange: !s.acc.hash, updated: d ? d.updated : 0, data: d ? d.data : null });
    }
    if (b.action === "save") {
      const s = await byToken(b);
      if (s.error) return reply(403, s);
      const size = Buffer.byteLength(JSON.stringify(b.data || {}));
      if (!b.data || size > MAX_BYTES) return reply(413, { error: "数据太大" });
      const updated = Date.now();
      await setDoc(docId(s.cls, s.code), { cls: s.cls, code: s.code, updated, data: b.data });
      return reply(200, { ok: true, updated });
    }
    if (b.action === "password") {
      const s = await byToken(b);
      if (s.error) return reply(403, s);
      const pass = String(b.pass || "");
      if (pass.length < 4 || pass.length > 20) return reply(400, { error: "密码要 4 到 20 位" });
      if (pass === DEFAULT_PASS) return reply(400, { error: "不能再用 123456，换一个吧" });
      const salt = crypto.randomBytes(8).toString("hex");
      const token = newToken();
      await updateDoc(docId(s.cls, s.code), { salt, hash: hash(pass, salt), token, fails: 0 });
      return reply(200, { ok: true, token });
    }
    if (b.action === "teacher" || b.action === "roster") {
      if (!TEACHER || String(b.pass || "") !== TEACHER) return reply(403, { error: "老师口令不对" });
    }
    if (b.action === "teacher") {
      // 「自由学习」组的人不进老师页，只报个人数；内部数据行也跳过
      const [docs, accs, reg, free] = await Promise.all([allDocs(), allDocs(ACC), getMeta(`reg-${today()}`), rowsOf(ACC, FREE, "id")]);
      return reply(200, {
        ok: true,
        students: docs.map(summarize),
        roster: accs.map((a) => ({ cls: a.cls, code: a.code, name: a.name, changed: !!a.hash, seen: !!a.token })),
        free: { total: free.length, today: reg.n || 0, limit: REG_PER_DAY },
      });
    }
    if (b.action === "roster") {
      const cls = cleanCls(b.cls);
      if (!CLS_RE.test(cls)) return reply(400, { error: "班级名不对（只能用数字、字母、汉字和点，最多 12 个字）" });
      if (cls === FREE) return reply(400, { error: `「${FREE}」是自己注册的同学用的，不能当班级名` });
      if (b.op === "add") {
        const from = Number(b.from);
        const to = Number(b.to);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 99 || from > to) return reply(400, { error: "编号范围要在 1 到 99 之间" });
        const have = new Set((await allDocs(ACC)).map((a) => docId(a.cls, a.code)));
        const ids = [];
        for (let n = from; n <= to; n++) if (!have.has(docId(cls, n))) ids.push(n);
        // 已经在名单里的不动，免得把学生改好的密码冲掉
        for (let i = 0; i < ids.length; i += 10)
          await Promise.all(ids.slice(i, i + 10).map((n) => setDoc(docId(cls, n), { cls, code: String(n) }, ACC)));
        return reply(200, { ok: true, added: ids.length });
      }
      const code = String(b.code || "");
      if (!CODE_RE.test(code)) return reply(400, { error: "编号不对" });
      const id = docId(cls, code);
      if (b.op === "reset") {
        // 密码回到 123456，token 作废：这个学生所有手机都要重新登录
        await setDoc(id, { cls, code }, ACC);
        return reply(200, { ok: true });
      }
      if (b.op === "name") {
        // 姓名只给老师页和学生本人登录后看，网页代码里没有
        const name = String(b.name || "").trim();
        if (name.length > 12) return reply(400, { error: "名字最多 12 个字" });
        // 学生用名字登录，同一个班不能有两个一样的名字
        if (name && (await allDocs(ACC)).some((a) => a.cls === cls && a.code !== code && a.name === name))
          return reply(400, { error: `${cls}班已经有「${name}」了，同名的请加上一、二区分` });
        await updateDoc(id, { name: name || null });
        return reply(200, { ok: true });
      }
      if (b.op === "remove") {
        // 只从名单移除，学习进度还留在云端，重新加回来就能接着用
        await removeDoc(id);
        return reply(200, { ok: true });
      }
      return reply(400, { error: "未知操作" });
    }
    return reply(400, { error: "未知操作" });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "服务器出错，请稍后再试" });
  }
};
