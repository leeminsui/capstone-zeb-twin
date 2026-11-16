/* 화면 4 — 실험 결과. 14일 전체 집계라 재생 위치와 무관하다.
   재생 위치는 산점도의 현재 점과 "하루씩 보면"의 오늘 강조에만 쓴다.
   숫자는 전부 ZEB.data.results() 에서 온다. */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data;
  const NS = "http://www.w3.org/2000/svg";
  const f = (v, n) => v.toFixed(n), num = v => Math.round(v).toLocaleString("en-US");
  const signed = v => (v < 0 ? "−" : "+") + Math.abs(v).toFixed(1);
  let root = null, nowDot = null, dayEls = [], lastI = -1, lastDay = -1, R = null;

  function h(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function s(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e); return e;
  }

  // 예측 대 실측 산점도. 좌표계 320×320, 눈금 0–80 W
  const SC = { L: 44, T: 12, S: 262, MAX: 80 };
  const sx = v => SC.L + Math.min(v, SC.MAX) / SC.MAX * SC.S, sy = v => SC.T + SC.S - Math.min(v, SC.MAX) / SC.MAX * SC.S;
  function scatter() {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("id", "res-scatter"); svg.setAttribute("viewBox", "0 0 320 320");
    [0, 40, 80].forEach(v => {
      s("line", { x1: sx(v), x2: sx(v), y1: SC.T, y2: SC.T + SC.S, class: "gl" }, svg);
      s("line", { x1: SC.L, x2: SC.L + SC.S, y1: sy(v), y2: sy(v), class: "gl" }, svg);
      s("text", { x: sx(v), y: SC.T + SC.S + 18, "text-anchor": v === 80 ? "end" : v ? "middle" : "start", class: "ax" }, svg, String(v));
      if (v) s("text", { x: SC.L - 8, y: sy(v) + 5, "text-anchor": "end", class: "ax" }, svg, String(v));
    });
    s("text", { x: SC.L + SC.S / 2, y: 314, "text-anchor": "middle", class: "ax" }, svg, "예측한 발전량 (W)");
    s("text", { x: SC.L + 8, y: SC.T + 18, class: "ax" }, svg, "실제 발전량 (W)");
    s("line", { x1: sx(0), y1: sy(0), x2: sx(SC.MAX), y2: sy(SC.MAX), class: "diag" }, svg);
    const g = s("g", {}, svg);
    R.points.forEach(p => s("circle", { cx: sx(p[0]).toFixed(1), cy: sy(p[1]).toFixed(1), r: 2.4, class: "pt" }, g));
    nowDot = s("circle", { r: 6.5, class: "now" }, svg);
    return svg;
  }

  function waffle() {
    const COLS = 37, P = 12, rows = Math.ceil(R.cool / COLS);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("id", "res-waffle"); svg.setAttribute("viewBox", "0 0 " + (COLS * P - 2) + " " + (rows * P - 2));
    for (let k = 0; k < R.cool; k++)
      s("rect", { x: (k % COLS) * P, y: Math.floor(k / COLS) * P, width: P - 2, height: P - 2, class: k < R.coolInPv ? "on" : "" }, svg);
    return svg;
  }

  function build() {
    R = D.results();
    root = h("div", { class: "res" });
    const P = ZEB.shell.panel;

    // ── 왼쪽: 발전량 예측 ──
    const a = P("태양광 발전량 예측", "밤 포함 전 구간 " + num(D.N) + "스텝"); a.root.id = "res-forecast";
    const ab = h("div", { class: "pb" });
    ab.appendChild(h("div", { class: "hero" },
      '<b id="res-r2">' + f(R.r2, 3) + '</b><div><strong>결정계수 R²</strong>예측 모델이 15분 뒤 발전량을 예측한 결과</div>'));
    const row = h("div", { class: "fc-row" });
    const box = h("div", { class: "sc-box" }); box.appendChild(scatter()); row.appendChild(box);
    const side = h("div", { class: "side" });
    side.appendChild(h("div", { class: "kv2" },
      '<div><span>평균 오차 MAE</span><b>' + f(R.mae, 2) + '<u>W</u></b></div>' +
      '<div><span>용량 대비 nMAE</span><b>' + f(R.nmae, 1) + '<u>%</u></b></div>'));
    const bm = Math.max.apply(null, R.regimes.map(g => Math.abs(g.bias))) || 1;
    side.appendChild(h("div", { class: "sub" }, "하늘 상태별 예측 치우침 <span>낮시간</span>"));
    side.appendChild(h("div", { class: "bias" }, R.regimes.map(g =>
      '<span>' + g.name + '</span><i><em style="width:' + Math.max(1.5, Math.abs(g.bias) / bm * 100).toFixed(1) + '%"></em></i><b>' + signed(g.bias) + ' W</b>').join("")));
    const worst = R.regimes.slice().sort((x, y) => x.bias - y.bias)[0];
    if (worst.bias < -1) side.appendChild(h("p", { class: "note" }, worst.name + " 날에 실제보다 가장 높게 예측했습니다. 값은 실측에서 예측을 뺀 것입니다."));
    side.appendChild(h("p", { class: "note" }, "점이 점선에 가까울수록 정확합니다. 흰 점은 지금 재생 중인 시각입니다."));
    row.appendChild(side); ab.appendChild(row); a.body.appendChild(ab); root.appendChild(a.root);

    // ── 오른쪽: 냉방 제어 ──
    const b = P("EHP 냉방 제어", "14일 전체"); b.root.id = "res-control";
    const bb = h("div", { class: "pb" });
    bb.appendChild(h("div", { class: "hero" },
      '<b id="res-share">' + Math.round(R.coolShare) + '<u>%</u></b><div><strong>발전 시간에 맞춘 냉방</strong>냉방 ' + R.cool + '회 가운데 ' + R.coolInPv + '회가 태양광 발전 중</div>'));
    bb.appendChild(waffle());
    bb.appendChild(h("div", { class: "lg" }, '<span><i class="sw cool"></i>발전 중에 가동</span><span><i class="sw off"></i>발전이 없을 때 가동</span><span>한 칸은 15분</span>'));
    const gridShare = 100 - R.selfShare;
    bb.appendChild(h("div", { class: "sub" }, "건물이 쓴 전기 " + num(R.load) + " kWh의 출처 <span>태양광은 건물 환산 × " + (window.ZEB_DATA.pv_scale || 3600) + "</span>"));
    bb.appendChild(h("div", { class: "src" }, '<i class="pv" style="width:' + f(R.selfShare, 2) + '%"></i><i class="grid" style="width:' + f(gridShare, 2) + '%"></i>'));
    bb.appendChild(h("div", { class: "src-l" },
      '<span><b>태양광 ' + f(R.selfShare, 1) + ' %</b> ' + num(R.selfUse) + ' kWh</span><span><b>계통 수전 ' + f(gridShare, 1) + ' %</b> ' + num(R.grid) + ' kWh</span>'));
    let kv = '<div><span>14일 전기요금</span><b>' + Math.round(R.cost / 1e4) + '<u>만 원</u></b></div>' +
             '<div><span>하루 평균</span><b>' + f(R.cost / R.days.length / 1e4, 1) + '<u>만 원</u></b></div>';
    if (ZEB.config.showComfort) kv += '<div><span>업무시간 쾌적 범위 유지</span><b>' + Math.round(R.comfortWork) + '<u>%</u></b></div>';
    bb.appendChild(h("div", { class: "kv2 line" }, kv));
    b.body.appendChild(bb); root.appendChild(b.root);

    // ── 아래: 하루씩 보면 ──
    const c = P("하루씩 보면", ""); c.root.id = "res-days";
    c.tagEl.innerHTML = '<i class="sw pv"></i>태양광 발전 <i class="sw grid"></i>계통 수전 · 하루 합계 kWh';
    const ul = h("ul", {});
    const dm = Math.max.apply(null, R.days.map(d => Math.max(d.pv, d.grid))) || 1;
    dayEls = R.days.map(d => {
      const li = h("li", { title: d.label + " 태양광 " + num(d.pv) + " kWh, 계통 " + num(d.grid) + " kWh" },
        '<div class="bars"><i class="pv" style="height:' + f(d.pv / dm * 100, 1) + '%"></i><i class="grid" style="height:' + f(d.grid / dm * 100, 1) + '%"></i></div>' +
        '<b>' + d.label + '</b><span>' + d.dow + ' ' + d.sky + '</span>');
      ul.appendChild(li); return li;
    });
    c.body.appendChild(ul); root.appendChild(c.root);
    return root;
  }

  ZEB.shell.registerView(4, {
    fullWidth: true,
    mount(el) { el.appendChild(build()); lastI = -1; lastDay = -1; },
    unmount() { root = null; nowDot = null; dayEls = []; },
    resize() {},
    update(sm) {
      if (!root || sm.i === lastI) return;
      lastI = sm.i;
      const show = sm.fc > 1 || sm.meas > 1;
      nowDot.setAttribute("cx", sx(sm.fc).toFixed(1)); nowDot.setAttribute("cy", sy(sm.meas).toFixed(1));
      nowDot.style.display = show ? "" : "none";
      const day = Math.min(dayEls.length - 1, Math.floor(sm.i / (1440 / D.STEP_MIN)));
      if (day !== lastDay) { lastDay = day; dayEls.forEach((li, k) => li.classList.toggle("today", k === day)); }
    },
    summary() {
      const r = R || D.results();
      return "냉방의 " + Math.round(r.coolShare) + "%를 태양광이 발전하는 시간에 돌렸고, 발전량 예측은 실제 변동의 " + Math.round(r.r2 * 100) + "%를 설명했습니다.";
    },
    rows() { return []; }
  });
})();
