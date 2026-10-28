// 云函数本地演练：用一个内存里的假数据库代替 PostgreSQL，跑注册、防刷、登录、老师页。
// 运行：node --test cloud/register.test.cjs
const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const Module = require("node:module");

/* ---------- 假数据库：只实现云函数用到的那几个查询 ---------- */
const db = { accounts: new Map(), students: new Map() };
let ip = "1.1.1.1";

function query(name) {
  const rows = db[name];
  const st = { filters: [], op: "select", from: 0, to: Infinity, cols: "*" };
  const q = {
    select(cols = "*") {
      st.cols = cols;
      return q;
    },
    eq(k, v) {
      st.filters.push((r) => r[k] === v);
      return q;
    },
    neq(k, v) {
      st.filters.push((r) => r[k] !== v);
      return q;
    },
    order() {
      return q;
    },
    range(a, b) {
      st.from = a;
      st.to = b;
      return q;
    },
    limit(n) {
      st.to = st.from + n - 1;
      return q;
    },
    upsert(row) {
      st.op = "upsert";
      st.row = row;
      return q;
    },
    update(fields) {
      st.op = "update";
      st.row = fields;
      return q;
    },
    delete() {
      st.op = "delete";
      return q;
    },
    then(ok, bad) {
      try {
        const hit = [...rows.values()].filter((r) => st.filters.every((f) => f(r))).sort((a, b) => (a.id < b.id ? -1 : 1));
        let data = null;
        if (st.op === "select") {
          data = hit.slice(st.from, st.to + 1).map((r) => {
            if (st.cols === "*") return { ...r };
            return Object.fromEntries(st.cols.split(",").map((c) => [c, r[c]]));
          });
        } else if (st.op === "upsert") rows.set(st.row.id, JSON.parse(JSON.stringify(st.row)));
        else if (st.op === "update") for (const r of hit) Object.assign(r, st.row);
        else if (st.op === "delete") for (const r of hit) rows.delete(r.id);
        return Promise.resolve({ data, error: null }).then(ok, bad);
      } catch (e) {
        return Promise.reject(e).then(ok, bad);
      }
    },
  };
  return q;
}

const fakeSdk = {
  SYMBOL_CURRENT_ENV: "env",
  init: () => ({ rdb: () => ({ from: query }) }),
  getCloudbaseContext: () => ({ TCB_SOURCE_IP: ip }),
};
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === "@cloudbase/node-sdk") return fakeSdk;
  return load.call(this, req, ...rest);
};
process.env.TEACHER_PASS = "t";
const { main } = require("./functions/api/index.js");

const call = async (data) => {
  const r = await main(data, {});
  return { status: r.statusCode, ...JSON.parse(r.body) };
};

beforeEach(() => {
  db.accounts.clear();
  db.students.clear();
  ip = "1.1.1.1";
  // 老师名单里的一个学生
  db.accounts.set("7.5-1", { id: "7.5-1", cls: "7.5", code: "1", name: "张三", salt: null, hash: null, token: null, fails: 0, fail_at: 0 });
});

test("注册：进自由学习组，直接拿到 token，可以登录、同步", async () => {
  const r = await call({ action: "register", name: "小明同学", pass: "abcd" });
  assert.equal(r.status, 200);
  assert.equal(r.cls, "自由学习");
  assert.equal(r.code, "1");
  assert.ok(r.token);
  const l = await call({ action: "login", name: "小明同学", pass: "abcd" });
  assert.equal(l.status, 200);
  assert.equal(l.cls, "自由学习");
  assert.equal(l.mustChange, false);
  const s = await call({ action: "save", cls: l.cls, code: l.code, token: l.token, data: { progress: {} } });
  assert.equal(s.status, 200);
  const y = await call({ action: "sync", cls: l.cls, code: l.code, token: l.token });
  assert.equal(y.status, 200);
});

test("注册：名字和密码不合规、重名都不行", async () => {
  assert.equal((await call({ action: "register", name: "a", pass: "abcd" })).status, 400);
  assert.equal((await call({ action: "register", name: "小明 同学", pass: "abcd" })).status, 400);
  assert.equal((await call({ action: "register", name: "小明", pass: "12" })).status, 400);
  assert.equal((await call({ action: "register", name: "小明", pass: "123456" })).status, 400);
  // 和老师名单里的同学重名
  assert.equal((await call({ action: "register", name: "张三", pass: "abcd" })).status, 409);
});

test("防刷：同一个 IP 一天只能注册 1 个，换 IP 可以", async () => {
  assert.equal((await call({ action: "register", name: "甲同学", pass: "abcd" })).status, 200);
  const r = await call({ action: "register", name: "乙同学", pass: "abcd" });
  assert.equal(r.status, 429);
  assert.match(r.error, /这个网络今天已经注册过/);
  ip = "2.2.2.2";
  const ok = await call({ action: "register", name: "乙同学", pass: "abcd" });
  assert.equal(ok.status, 200);
  assert.equal(ok.code, "2");
});

test("防刷：全站一天最多 200 个", async () => {
  for (let i = 0; i < 200; i++) {
    ip = `10.0.${Math.floor(i / 250)}.${i % 250}`;
    assert.equal((await call({ action: "register", name: `同学${i}`, pass: "abcd" })).status, 200, `第 ${i + 1} 个`);
  }
  ip = "9.9.9.9";
  const r = await call({ action: "register", name: "晚来的同学", pass: "abcd" });
  assert.equal(r.status, 429);
  assert.match(r.error, /名额已经满了/);
});

test("IP 不明文存", async () => {
  ip = "123.45.67.89";
  await call({ action: "register", name: "小红同学", pass: "abcd" });
  assert.ok(!JSON.stringify([...db.students.values()]).includes("123.45.67.89"));
});

test("老师页：看不到自由学习组和内部数据，只看到人数", async () => {
  await call({ action: "register", name: "小明同学", pass: "abcd" });
  const t = await call({ action: "teacher", pass: "t" });
  assert.equal(t.status, 200);
  assert.deepEqual(
    t.roster.map((m) => m.cls),
    ["7.5"],
  );
  assert.ok(t.students.every((s) => s.cls === "7.5"));
  assert.equal(t.free.total, 1);
  assert.equal(t.free.today, 1);
  // 老师不能往「自由学习」加名单
  assert.equal((await call({ action: "roster", pass: "t", cls: "自由学习", op: "add", from: 1, to: 3 })).status, 400);
});

test("老师名单的学生照常登录（初始密码 123456）", async () => {
  const l = await call({ action: "login", name: "张三", pass: "123456" });
  assert.equal(l.status, 200);
  assert.equal(l.mustChange, true);
});

test("清理：90 天没用过的自由学习账号会被删，老师名单的不动", async () => {
  await call({ action: "register", name: "旧同学", pass: "abcd" });
  // 把注册时间改到 100 天前，清理日期改成昨天，再注册一个人触发清理
  const born = db.students.get("_meta-born");
  born.data.at["自由学习-1"] = Date.now() - 100 * 864e5;
  db.students.get("_meta-cleanup").data.day = "2000-01-01";
  ip = "3.3.3.3";
  await call({ action: "register", name: "新同学", pass: "abcd" });
  assert.ok(!db.accounts.has("自由学习-1"));
  assert.ok(db.accounts.has("自由学习-2"));
  assert.ok(db.accounts.has("7.5-1"));
});
