/* 화면 3 — 알고리즘 구조도.
   상자·문구·연결은 ZEB.algoSpec 에서 읽는다. 코드를 확인한 뒤에는 이 데이터만 고치면 된다.
   지금 내용은 추정이다(confirmed: false). */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data, f1 = v => v.toFixed(1);

  ZEB.algoSpec = {
    confirmed: false,
    forecast: {
      title: "발전 예측", note: "15분마다 앞으로 6시간(24칸)을 다시 예측",
      inputs: [
        { id: "wx",   title: "기상 예보",  sub: "Solcast, 앞으로 6시간",   series: "sghi", dir: "future", max: 1000 },
        { id: "site", title: "현장 센서",  sub: "일사량과 패널온도, 지난 6시간", series: "sghi", dir: "past",   max: 1000 },
        { id: "meas", title: "발전 실측",  sub: "지난 6시간",              series: "meas", dir: "past",   max: 80 }
      ],
      model: {
        title: "예측 모델", note: "시드 3개 평균",
        blocks: [
          { id: "enc",  title: "인코더",        lines: ["지나간 값을 요약"],          x: 16,  y: 40,  w: 150, h: 78 },
          { id: "dec",  title: "디코더",        lines: ["예보를 따라", "24칸 생성"],   x: 16,  y: 178, w: 150, h: 78 },
          { id: "head", title: "물리 제약 출력", lines: ["맑은 하늘 한계 이내", "밤에는 0"], x: 198, y: 96,  w: 150, h: 110 }
        ],
        links: [["enc", "dec", "어텐션"], ["dec", "head", ""]]
      },
      output: { title: "6시간 예측", sub: "24칸, 15분 간격", scale: 3600 }
    },
    control: {
      title: "EHP 제어", note: "예측을 받아 6시간 운전 계획을 세우고 첫 칸만 실행",
      controllers: [
        { id: "mpc", label: "MPC", state: "운영 중", active: true,
          goal: "6시간 전기요금 합계를 가장 작게",
          constraints: ["실내온도를 쾌적 범위 안에", "건물 열 모델(RC)로 온도 변화 계산", "EHP 용량과 켜짐, 꺼짐", "남는 태양광은 최대한 건물에서 사용"],
          solver: "Gurobi 혼합정수계획, 15분마다 다시 풀이" },
        { id: "rl", label: "강화학습", state: "예정", active: false }
      ],
      plan: { title: "6시간 운전 계획", sub: "이후 6시간 실제 운전값", note: "흰 테두리 칸만 지금 실행" },
      loop: "15분 뒤 다시 측정해서 처음부터 반복"
    }
  };

  const NS = "http://www.w3.org/2000/svg", W = 900, H = 704;
  let svg = null, dyn = null, hot = null, lastI = -1, lastStage = -1, pnl = null;

  function el(n, a, t, parent) {
    const e = document.createElementNS(NS, n);
    for (const k in a) e.setAttribute(k, a[k]);
    if (t != null) e.textContent = t;
    (parent || svg).appendChild(e); return e;
  }
  const T = (x, y, s, cls, extra) => el("text", Object.assign({ x, y, class: cls || "" }, extra || {}), s);
  const R = (x, y, w, h, cls, extra) => el("rect", Object.assign({ x, y, width: w, height: h, class: "bx " + (cls || "") }, extra || {}));
  const A = (d, cls) => el("path", { d, class: "ar " + (cls || ""), "marker-end": "url(#ah" + (cls ? "-" + cls : "") + ")" });
  function cells(x, y, n, cw, kind) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(el("rect", { x: x + k * cw, y, width: cw - 2, height: 26, "data-cell": kind, class: "cell" }));
    return out;
  }
  function paint(list, vals, max, rgb) {
    list.forEach((c, k) => c.setAttribute("fill", "rgba(" + rgb + "," + (0.10 + 0.9 * Math.min(1, (vals[k] || 0) / max)).toFixed(2) + ")"));
  }

  function draw() {
    const SP = ZEB.algoSpec, F = SP.forecast, C = SP.control;
    svg.textContent = ""; dyn = { sparks: [], blocks: {} }; hot = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    const defs = el("defs", {});
    [["", "var(--lb)"], ["-pv", "var(--pv)"], ["-cool", "var(--cool)"]].forEach(m => {
      const mk = el("marker", { id: "ah" + m[0], viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, null, defs);
      el("path", { d: "M0 0L10 5L0 10z", fill: m[1] }, null, mk);
    });

    // ───────── 발전 예측 ─────────
    T(14, 24, F.title, "h"); T(14 + F.title.length * 17 + 12, 24, F.note, "mu");
    el("line", { x1: 14, x2: W - 14, y1: 34, y2: 34, class: "rule" });
    F.inputs.forEach((inp, k) => {
      const y = 44 + k * 94;
      hot[0].push(R(14, y, 210, 84));
      T(24, y + 21, inp.title, "b"); T(24, y + 39, inp.sub, "mu");
      dyn.sparks.push({ inp, path: el("path", { class: "spark", "data-spark": inp.id }), x: 24, y: y + 50, w: 190, h: 26 });
      A("M224 " + (y + 42) + "H260");
    });
    const MX = 262, MY = 44, M = F.model;
    hot[1].push(R(MX, MY, 364, 272, "pv"));
    T(MX + 12, MY + 23, M.title, "b v-pv"); T(MX + 352, MY + 23, M.note, "mu", { "text-anchor": "end" });
    M.blocks.forEach(b => {
      R(MX + b.x, MY + b.y, b.w, b.h, "in");
      T(MX + b.x + 10, MY + b.y + 22, b.title, "b");
      b.lines.forEach((ln, i) => T(MX + b.x + 10, MY + b.y + 44 + i * 19, ln, "mu"));
      dyn.blocks[b.id] = b;
    });
    M.links.forEach(l => {
      const a = dyn.blocks[l[0]], b = dyn.blocks[l[1]];
      if (!a || !b) return;
      if (Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) < 4) {            // 위아래로 놓인 상자
        const x = MX + a.x + a.w / 2;
        A("M" + x + " " + (MY + a.y + a.h) + "V" + (MY + b.y - 2));
        if (l[2]) T(x + 10, MY + (a.y + a.h + b.y) / 2 + 5, l[2], "mu");
      } else {                                                           // 옆 상자로
        const x1 = MX + a.x + a.w, y1 = MY + a.y + a.h / 2, x2 = MX + b.x, y2 = MY + b.y + b.h / 2, xm = (x1 + x2) / 2;
        A("M" + x1 + " " + y1 + "H" + xm + "V" + y2 + "H" + (x2 - 2));
      }
    });
    A("M626 180H662", "pv");
    R(664, 44, 222, 272, "pv");
    T(676, 65, F.output.title, "b"); T(676, 83, F.output.sub, "mu");
    dyn.fc1 = cells(676, 94, 12, 16.5, "forecast"); dyn.fc2 = cells(676, 124, 12, 16.5, "forecast");
    T(676, 178, "15분 뒤", "mu"); dyn.fcNext = T(676, 208, "", "big v-pv");
    dyn.fcErr = T(676, 232, "", "mu");
    el("line", { x1: 676, x2: 874, y1: 248, y2: 248, class: "rule" });
    T(676, 272, "× " + F.output.scale, "mu"); dyn.fcBld = T(676, 296, "", "b");

    // ───────── EHP 제어 ─────────
    T(262, 364, C.title, "h"); T(262 + 84, 364, C.note, "mu");
    el("line", { x1: 14, x2: W - 14, y1: 374, y2: 374, class: "rule" });
    A("M775 316V338H119V382", "pv");
    const IN = [["발전 예측 24칸", "pv"], ["전기요금 단가 24칸", ""], ["실내 상태", ""], ["외기온도", ""]];
    dyn.inBoxes = IN.map((it, k) => {
      const y = 384 + k * 74, r = R(14, y, 210, 66, it[1]);
      T(24, y + 21, it[0], "b");
      A("M224 " + (y + 33) + "H260");
      return { r, y };
    });
    dyn.inFc = cells(24, 416, 24, 7.9, "in"); dyn.inPr = cells(24, 490, 24, 7.9, "in");
    dyn.roomTxt = T(24, 586, "", "mu"); dyn.oatTxt = T(24, 660, "", "mu");

    const CX = 262, CY = 384;
    hot[2].push(R(CX, CY, 364, 288, "cool"));
    const act = C.controllers.filter(c => c.active)[0] || C.controllers[0];
    C.controllers.forEach((c, k) => {
      const g = el("g", { "data-ctrl": c.id, "data-active": String(!!c.active) });
      const tw = 364 / C.controllers.length;
      el("rect", { x: CX + k * tw, y: CY, width: tw, height: 32, class: c.active ? "tab on" : "tab" }, null, g);
      el("text", { x: CX + k * tw + tw / 2, y: CY + 21, "text-anchor": "middle", class: c.active ? "b tabon" : "mu" }, c.label + "  " + c.state, g);
    });
    T(CX + 16, CY + 60, "목표", "mu"); T(CX + 16, CY + 82, act.goal || "", "b");
    T(CX + 16, CY + 116, "지켜야 할 조건", "mu");
    (act.constraints || []).forEach((s, i) => { el("rect", { x: CX + 16, y: CY + 131 + i * 25, width: 8, height: 8, class: "okdot" }); T(CX + 32, CY + 140 + i * 25, s); });
    T(CX + 16, CY + 250, "풀이", "mu"); T(CX + 16, CY + 272, act.solver || "", "");

    A("M626 446H662", "cool");
    hot[3].push(R(664, 384, 222, 124, "cool"));
    T(676, 405, C.plan.title, "b"); T(676, 423, C.plan.sub, "mu");
    dyn.pl1 = cells(676, 432, 12, 16.5, "plan"); dyn.pl2 = cells(676, 462, 12, 16.5, "plan");
    dyn.pl1[0].setAttribute("class", "cell now");
    T(676, 503, C.plan.note, "mu");
    A("M775 508V522", "cool");
    hot[4].push(R(664, 524, 222, 64, "cool")); T(676, 546, "EHP", "b"); dyn.ehpTxt = T(676, 570, "", "mu");
    A("M775 588V602");
    hot[4].push(R(664, 604, 222, 68)); T(676, 626, "건물", "b"); dyn.bldTxt = T(676, 650, "", "mu");
    A("M775 672V684H119V674");
    T(450, 699, C.loop, "mu", { "text-anchor": "middle" });

    pnl.tagEl.textContent = SP.confirmed ? "15분마다 갱신" : "구조는 추정 — 코드 확인 후 확정";
  }

  function refresh(s) {
    const i = s.i, hz = D.horizon(i);
    dyn.sparks.forEach(sp => {
      const a = sp.inp.dir === "future" ? D.future(sp.inp.series, i, 24) : D.past(sp.inp.series, i, 24);
      sp.path.setAttribute("d", a.map((v, k) => (k ? "L" : "M") + (sp.x + k / 23 * sp.w).toFixed(1) + " " + (sp.y + sp.h - Math.min(1, v / sp.inp.max) * sp.h).toFixed(1)).join(""));
    });
    paint(dyn.fc1, hz.slice(0, 12), 80, "255,176,32"); paint(dyn.fc2, hz.slice(12), 80, "255,176,32");
    paint(dyn.inFc, hz, 80, "255,176,32"); paint(dyn.inPr, D.future("pr", i, 24), 200, "245,139,192");
    const a = D.at(i), plan = D.future(a.heat ? "ph" : "pc", i, 24), pm = Math.max(D.max("pc"), D.max("ph"), 1);
    paint(dyn.pl1, plan.slice(0, 12), pm, a.heat ? "255,138,92" : "62,197,255"); paint(dyn.pl2, plan.slice(12), pm, a.heat ? "255,138,92" : "62,197,255");
    dyn.fcNext.textContent = f1(hz[0]) + " W";
    const e = a.meas - a.fc;
    dyn.fcErr.textContent = "지금 실측 " + f1(a.meas) + " W, 오차 " + (Math.abs(e) < .05 ? "0.0" : (e > 0 ? "+" : "") + f1(e)) + " W";
    dyn.fcBld.textContent = "건물 환산 " + f1(a.pv) + " kW";
    dyn.roomTxt.textContent = "지금 " + f1(a.rt) + "°C, 범위 " + f1(a.cl) + "–" + f1(a.ch);
    dyn.inBoxes[2].r.setAttribute("class", "bx " + (D.status(a).rt ? "warn" : ""));
    dyn.oatTxt.textContent = "지금 " + f1(a.at) + "°C";
    dyn.ehpTxt.textContent = a.cool ? "냉방 " + f1(a.pc) + " kW" : a.heat ? "난방 " + f1(a.ph) + " kW" : "정지";
    dyn.bldTxt.textContent = "실내 " + f1(a.rt) + "°C";
  }

  ZEB.shell.registerView(3, {
    mount(elm) {
      pnl = ZEB.shell.panel("예측과 제어 알고리즘", "");
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("id", "alg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      pnl.body.appendChild(svg); elm.appendChild(pnl.root);
      draw(); lastI = -1; lastStage = -1;
    },
    unmount() { svg = null; dyn = null; },
    resize() {},
    update(s) {
      if (!svg) return;
      if (s.i !== lastI) { lastI = s.i; refresh(s); }
      const st = Math.min(4, Math.floor(s.frac * 5));
      if (st !== lastStage) {
        lastStage = st;
        svg.querySelectorAll(".hot").forEach(n => n.classList.remove("hot"));
        hot[st].forEach(n => n.classList.add("hot"));
        dyn.pl1[0].classList.toggle("hot", st === 3);
      }
    },
    summary() { return "15분마다 6시간을 예측하고, 그 예측으로 EHP 운전을 다시 계산합니다."; },
    rows(s) {
      const hz = D.horizon(s.i);
      return [
        { name: "15분 뒤 예측", value: f1(hz[0]), unit: "W", cls: "v-pv" },
        { name: "6시간 예측 합계", value: (hz.reduce((a, b) => a + b, 0) / 4).toFixed(0), unit: "Wh", cls: "v-pv" },
        { name: "건물 환산 발전", value: f1(s.pv), unit: "kW", cls: "v-pv" },
        { name: "요금 단가", value: f1(s.pr), unit: "원/kWh" },
        { name: "실내온도", value: f1(s.rt), unit: "°C", status: D.status(s).rt },
        { name: "쾌적 범위", value: f1(s.cl) + "–" + f1(s.ch), unit: "°C" },
        { name: "EHP 지령", value: s.cool ? "냉방" : s.heat ? "난방" : "정지", unit: "", cls: s.cool ? "v-cool" : s.heat ? "v-heat" : "" },
        { name: "EHP 소비전력", value: f1(s.heat ? s.ph : s.pc), unit: "kW", cls: s.heat ? "v-heat" : "v-cool" }
      ];
    }
  });
})();
