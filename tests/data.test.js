// node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["data/zeb_window.js", "js/data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const D = ctx.ZEB.data;
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (±${tol})`);

test("크기와 시각", () => {
  assert.equal(D.N, 1344);
  assert.equal(D.hm(337), "12:15");
  assert.equal(D.dateStr(337), "2026-10-02");
  assert.equal(ctx.ZEB.config.homeIndex, 336);
  assert.equal(ctx.ZEB.config.showComfort, false);
});

test("결과 집계가 README와 일치", () => {
  const r = D.results();
  near(r.r2, 0.854, 0.001); near(r.mae, 3.95, 0.01); near(r.nmae, 5.8, 0.05);
  assert.equal(r.cool, 370); assert.equal(r.coolInPv, 346);
  near(r.load, 64839, 1); near(r.grid, 50824, 1); near(r.selfShare, 21.6, 0.05);
  near(r.cost, 1531834, 1);
  near(r.regimes[0].bias, -6.72, 0.01); near(r.regimes[2].bias, -0.16, 0.01);
  assert.deepEqual(Array.from(r.regimes, x => x.name), ["맑음", "구름", "흐림"]);
  assert.equal(r.days.length, 14); assert.equal(r.points.length, 648);
  assert.equal(r.days[3].label, "10/2");
});

test("이벤트", () => {
  const e = D.events(337);
  assert.ok(e.length <= 9 && e[0].i === 337 && e[0].kind === "MPC");
  assert.ok(e.some(x => x.kind === "EHP" && x.text === "냉방 기동 51.8 kW" && D.hm(x.i) === "10:30"));
  for (let k = 1; k < e.length; k++) assert.ok(e[k].i <= e[k - 1].i, "최근 순");
});

test("양 끝에서 범위 밖을 읽지 않는다", () => {
  for (const i of [0, 3, 11, 95, 1320, 1343]) {
    assert.equal(D.past("rt", i, 96).length, 96);
    assert.equal(D.future("pc", i, 24).length, 24);
    assert.equal(D.horizon(i).length, 24);
    for (const v of [...D.past("rt", i, 96), ...D.future("pc", i, 24), ...D.horizon(i)]) assert.ok(Number.isFinite(v));
    assert.ok(Array.isArray(D.events(i)));
  }
  assert.equal(D.at(-5).i, 0);
  assert.equal(D.at(99999).i, 1343);
});

test("밤에도 값이 유한하다", () => {
  const s = D.at(4 * 96 + 8.5); // 10/03 02:07
  for (const k of ["rt", "cl", "ch", "at", "pc", "ld", "gi", "pv", "pr", "fc", "meas", "cc", "sghi", "over"]) {
    assert.ok(Number.isFinite(s[k]), k);
  }
  assert.equal(s.cool, false);
});

test("보간", () => {
  const a = D.at(337), b = D.at(338), m = D.at(337.5);
  near(m.rt, (a.rt + b.rt) / 2, 1e-9);
  assert.equal(m.i, 337);
  near(m.frac, 0.5, 1e-9);
});

test("하늘 상태와 주의 판정", () => {
  assert.equal(D.sky(0.1), "맑음"); assert.equal(D.sky(0.5), "구름"); assert.equal(D.sky(0.9), "흐림");
  assert.equal(D.status({ rt: 24.5, cl: 21.8, ch: 24.1 }).rt, "주의");
  assert.equal(D.status({ rt: 23.0, cl: 21.8, ch: 24.1 }).rt, "");
});
