/* ZEB.data — 기록에서 값을 읽고 계산하는 곳. DOM을 쓰지 않는다.
   값의 정의는 docs/superpowers/specs/2026-11-16-scada-redesign-design.md 8장. */
(function (root) {
  "use strict";
  const RAW = root.ZEB_DATA;
  const ZEB = (root.ZEB = root.ZEB || {});

  ZEB.config = {
    showComfort: false,   // 결과 화면의 "업무시간 쾌적 범위 유지" 표시
    homeIndex: 336        // 2026-10-02 12:00, 가장 맑은 날 정오
  };

  const N = RAW.n, STEP_MIN = RAW.step_min || 15, HZ = RAW.hz_len || 24;
  const KEYS = ["rt", "oat", "pc", "ph", "ld", "gi", "pvs", "cur", "pr", "cost", "cl", "ch", "fc", "meas", "cc", "at", "sghi"];

  // 빈 값은 앞의 값으로, 맨 앞이 비면 뒤의 값으로 메운다
  function filled(src) {
    const a = Array.from(src || [], v => (v === null || v === undefined ? NaN : +v));
    while (a.length < N) a.push(NaN);
    let p = NaN;
    for (let i = 0; i < N; i++) { if (Number.isNaN(a[i])) a[i] = p; else p = a[i]; }
    p = NaN;
    for (let i = N - 1; i >= 0; i--) { if (Number.isNaN(a[i])) a[i] = p; else p = a[i]; }
    for (let i = 0; i < N; i++) if (Number.isNaN(a[i])) a[i] = 0;
    return a;
  }
  const S = {};
  KEYS.forEach(k => { S[k] = filled(RAW[k]); });
  const MODE = Array.from({ length: N }, (_, i) => (RAW.mode && RAW.mode[i]) || 0);
  const HORIZON = (() => {
    let last = new Array(HZ).fill(0);
    return Array.from({ length: N }, (_, i) => {
      const r = RAW.hz && RAW.hz[i];
      if (r && r.length === HZ) last = r.map(v => (v || 0) / 10);
      return last;
    });
  })();

  // 시각은 시간대와 무관하게 "기록의 벽시계"로 다룬다
  const m0 = /^(\d+)-(\d+)-(\d+)/.exec(RAW.start);
  const T0 = Date.UTC(+m0[1], +m0[2] - 1, +m0[3]);
  const p2 = n => String(n).padStart(2, "0");
  const clampI = i => Math.max(0, Math.min(N - 1, i));
  const utc = pos => new Date(T0 + pos * STEP_MIN * 60000);
  const timeOf = i => utc(i);
  const hm = i => { const t = utc(i); return p2(t.getUTCHours()) + ":" + p2(t.getUTCMinutes()); };
  const hms = pos => { const t = utc(pos); return p2(t.getUTCHours()) + ":" + p2(t.getUTCMinutes()) + ":" + p2(t.getUTCSeconds()); };
  const dateStr = i => { const t = utc(i); return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate()); };
  const hourOf = pos => { const t = utc(pos); return t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600; };

  function at(pos) {
    pos = Math.max(0, Math.min(N - 1, +pos || 0));
    const i = Math.floor(pos), j = Math.min(N - 1, i + 1), f = pos - i;
    const L = k => S[k][i] + (S[k][j] - S[k][i]) * f;
    const s = {
      pos, i, frac: f, date: utc(pos), hour: hourOf(pos),
      rt: L("rt"), cl: L("cl"), ch: L("ch"), at: L("at"), pc: L("pc"), ph: L("ph"), ld: L("ld"), gi: L("gi"),
      pv: L("pvs"), cur: L("cur"), pr: L("pr"), fc: L("fc"), meas: L("meas"), cc: L("cc"), sghi: L("sghi"),
      mode: MODE[i]
    };
    s.cool = s.mode === 1; s.heat = s.mode === 2;
    s.over = s.rt - s.ch;
    return s;
  }

  const past = (key, i, n) => Array.from({ length: n }, (_, k) => S[key][clampI(i - (n - 1) + k)]);
  const future = (key, i, n) => Array.from({ length: n }, (_, k) => S[key][clampI(i + 1 + k)]);
  const horizon = i => HORIZON[clampI(i)];
  const sky = cc => (cc < 0.35 ? "맑음" : cc < 0.7 ? "구름" : "흐림");
  const status = s => ({ rt: (s.rt > s.ch + 0.05 || s.rt < s.cl - 0.05) ? "주의" : "" });
  const f1 = v => v.toFixed(1);

  function events(i, max) {
    max = max || 9; i = clampI(i);
    const out = [];
    for (let k = i; k > Math.max(0, i - 60) && out.length < max; k--) {
      if (k === i) out.push({ i: k, kind: "MPC", text: "최적화 완료, 첫 제어입력 적용", level: "" });
      if (MODE[k] !== MODE[k - 1]) {
        out.push({ i: k, kind: "EHP", level: "c",
          text: MODE[k] === 1 ? "냉방 기동 " + f1(S.pc[k]) + " kW" : MODE[k] === 2 ? "난방 기동 " + f1(S.ph[k]) + " kW" : "운전 정지" });
      }
      const o1 = S.rt[k] > S.ch[k], o0 = S.rt[k - 1] > S.ch[k - 1];
      if (o1 !== o0) out.push({ i: k, kind: "실내", level: "w", text: o1 ? "쾌적 상한 초과 " + f1(S.rt[k]) + "°C" : "쾌적 범위 복귀" });
      if (k % 4 === 1) out.push({ i: k, kind: "예측", level: "", text: "6시간 예측 갱신" });
    }
    return out.slice(0, max);
  }

  let RES = null;
  function results() {
    if (RES) return RES;
    const q = STEP_MIN / 60, mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const err = [], points = [], reg = { 맑음: [], 구름: [], 흐림: [] };
    let load = 0, grid = 0, pv = 0, pcE = 0, cost = 0, cool = 0, coolInPv = 0, cap = 0, workN = 0, workOk = 0;
    for (let i = 0; i < N; i++) {
      const e = S.meas[i] - S.fc[i];
      err.push(e);
      cap = Math.max(cap, S.fc[i], S.meas[i]);
      if (S.fc[i] > 1 || S.meas[i] > 1) { points.push([S.fc[i], S.meas[i]]); reg[sky(S.cc[i])].push(e); }
      load += S.ld[i] * q; grid += S.gi[i] * q; pv += S.pvs[i] * q; pcE += S.pc[i] * q; cost += S.cost[i] * q;
      if (MODE[i] === 1) { cool++; if (S.pvs[i] > 10) coolInPv++; }
      const h = Math.floor(hourOf(i));
      if (h >= 8 && h < 20) { workN++; if (!status({ rt: S.rt[i], cl: S.cl[i], ch: S.ch[i] }).rt) workOk++; }
    }
    const mu = mean(S.meas), ssr = err.reduce((s, e) => s + e * e, 0), sst = S.meas.reduce((s, v) => s + (v - mu) * (v - mu), 0);
    const mae = mean(err.map(Math.abs));
    const per = 1440 / STEP_MIN, days = [];
    const DOW = "일월화수목금토";
    for (let d = 0; d < Math.floor(N / per); d++) {
      let dpv = 0, dgi = 0, dc = 0; const ccs = [];
      for (let k = d * per; k < (d + 1) * per; k++) {
        dpv += S.pvs[k] * q; dgi += S.gi[k] * q; dc += S.cost[k] * q;
        const h = hourOf(k); if (h >= 9 && h < 17) ccs.push(S.cc[k]);
      }
      const t = utc(d * per);
      days.push({ label: (t.getUTCMonth() + 1) + "/" + t.getUTCDate(), dow: DOW[t.getUTCDay()], pv: dpv, grid: dgi, cost: dc, sky: sky(mean(ccs)) });
    }
    RES = {
      r2: 1 - ssr / sst, mae, rmse: Math.sqrt(mean(err.map(e => e * e))), bias: mean(err), cap, nmae: mae / cap * 100,
      points,
      regimes: ["맑음", "구름", "흐림"].map(name => ({ name, n: reg[name].length, mae: mean(reg[name].map(Math.abs)), bias: mean(reg[name]) })),
      cool, coolInPv, coolShare: cool ? coolInPv / cool * 100 : 0,
      load, grid, pv, coolEnergy: pcE, selfUse: load - grid, selfShare: (load - grid) / load * 100, cost,
      comfortWork: workN ? workOk / workN * 100 : 0,
      days
    };
    return RES;
  }

  ZEB.data = {
    N, STEP_MIN, HZ,
    series: key => S[key], mode: i => MODE[clampI(i)], max: key => S[key].reduce((a, b) => Math.max(a, b), 0),
    timeOf, hm, hms, dateStr, hourOf,
    at, past, future, horizon, sky, status, events, results
  };
})(typeof window !== "undefined" ? window : globalThis);
