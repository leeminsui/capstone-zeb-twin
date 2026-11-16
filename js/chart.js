/* ZEB.chart — 캔버스 추이 차트. 정수 스텝 i 를 받아 그린다. */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data;
  let C = null;
  function colors() {
    if (C) return C;
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    C = { bg: v("--pn"), bd: v("--bd"), bd2: v("--bd-2"), tx: v("--tx"), lb: v("--lb"), dim: v("--dim"),
          pv: v("--pv-m"), cool: v("--cool-m"), heat: v("--heat"), grid: v("--grid-m"), ok: v("--ok") };
    return C;
  }
  const FONT = '13px "Pretendard Variable", sans-serif';
  const p2 = n => String(n).padStart(2, "0");

  function prep(canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = FONT; g.textBaseline = "middle"; g.lineJoin = "round"; g.lineCap = "round";
    return { g, w, h };
  }
  function path(g, pts) { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); }
  function hourTicks(g, c, i0, n, X, top, bottom, every) {
    g.textAlign = "center";
    for (let k = 0; k <= n; k++) {
      const t = D.timeOf(i0 + k);
      if (t.getUTCMinutes() !== 0 || t.getUTCHours() % every) continue;
      g.strokeStyle = c.bd2; g.lineWidth = 1; g.beginPath(); g.moveTo(X(k) + .5, top); g.lineTo(X(k) + .5, bottom); g.stroke();
      g.fillStyle = c.dim; g.fillText(p2(t.getUTCHours()) + ":00", X(k), bottom + 13);
    }
  }
  function legend(g, c, x, y, items) {
    g.textAlign = "left";
    items.forEach(it => {
      g.strokeStyle = it[0]; g.lineWidth = 2.6; g.setLineDash(it[2] || []);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = c.lb; g.fillText(it[1], x + 24, y + 1);
      x += 24 + g.measureText(it[1]).width + 18;
    });
  }

  // 지난 3시간 실측 + 현재 6시간 예측 + 1·2시간 전 예측
  function forecast(canvas, i) {
    const o = prep(canvas); if (!o) return; const { g, w, h } = o, c = colors();
    const L = 46, R = 16, T = 34, B = 26, pw = w - L - R, ph = h - T - B;
    const P = 12, H = D.HZ, span = P + H, YM = 80;
    const X = k => L + k / span * pw, Y = v => T + ph - Math.min(v, YM) / YM * ph;
    g.fillStyle = "rgba(200,133,0,.07)"; g.fillRect(X(P), T, X(span) - X(P), ph);
    g.textAlign = "right";
    [0, 20, 40, 60, 80].forEach(v => {
      g.strokeStyle = c.bd2; g.lineWidth = 1; g.beginPath(); g.moveTo(L, Y(v) + .5); g.lineTo(w - R, Y(v) + .5); g.stroke();
      g.fillStyle = c.dim; g.fillText(String(v), L - 8, Y(v));
    });
    hourTicks(g, c, i - P, span, X, T, T + ph, 1);
    g.setLineDash([3, 4]); g.strokeStyle = c.pv; g.lineWidth = 1.6; g.globalAlpha = .65;
    [8, 4].forEach(back => {
      const r = D.horizon(i - back), pts = [];
      for (let k = 0; k < H; k++) { const xk = P - back + 1 + k; if (xk >= 0 && xk <= span) pts.push([X(xk), Y(r[k])]); }
      if (pts.length > 1) { path(g, pts); g.stroke(); }
    });
    g.setLineDash([]); g.globalAlpha = 1;
    const cur = D.horizon(i), fpts = cur.map((v, k) => [X(P + 1 + k), Y(v)]);
    fpts.unshift([X(P), Y(D.series("meas")[Math.max(0, Math.min(D.N - 1, i))])]);
    g.strokeStyle = c.pv; g.lineWidth = 2.6; path(g, fpts.filter(p => p[0] <= X(span) + .5)); g.stroke();
    const m = D.past("meas", i, P + 1), mpts = m.map((v, k) => [X(k), Y(v)]);
    g.strokeStyle = c.tx; g.lineWidth = 2.6; path(g, mpts); g.stroke();
    g.fillStyle = c.tx; g.beginPath(); g.arc(X(P), Y(m[P]), 4.5, 0, 7); g.fill();
    g.strokeStyle = c.lb; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(P) + .5, T - 6); g.lineTo(X(P) + .5, T + ph); g.stroke(); g.setLineDash([]);
    legend(g, c, L, 14, [[c.tx, "실측"], [c.pv, "현재 예측"], [c.pv, "1·2시간 전 예측", [3, 4]]]);
    g.textAlign = "right"; g.fillStyle = c.lb; g.fillText("현재 → 6시간 뒤", w - R, 15);
  }

  // 최근 24시간: 위 실내온도와 쾌적 범위, 아래 냉난방 전력
  function roomTrend(canvas, i) {
    const o = prep(canvas); if (!o) return; const { g, w, h } = o, c = colors();
    const L = 46, R = 16, T = 34, B = 26, pw = w - L - R, ph = h - T - B, n = 96;
    const h1 = ph * .64, h2 = ph * .26, T2 = T + ph - h2;
    const rt = D.past("rt", i, n + 1), cl = D.past("cl", i, n + 1), ch = D.past("ch", i, n + 1);
    const pc = D.past("pc", i, n + 1), hp = D.past("ph", i, n + 1);
    const lo = Math.floor(Math.min(...rt, ...cl) - .3), hi = Math.ceil(Math.max(...rt, ...ch) + .3);
    const X = k => L + k / n * pw, Y = v => T + h1 - (v - lo) / (hi - lo) * h1;
    g.textAlign = "right";
    for (let v = lo; v <= hi; v++) {
      g.strokeStyle = c.bd2; g.lineWidth = 1; g.beginPath(); g.moveTo(L, Y(v) + .5); g.lineTo(w - R, Y(v) + .5); g.stroke();
      if ((hi - lo) <= 6 || (v - lo) % 2 === 0) { g.fillStyle = c.dim; g.fillText(v === hi ? v + "°C" : String(v), L - 8, Y(v)); }
    }
    hourTicks(g, c, i - n, n, X, T, T + ph, 3);
    g.fillStyle = "rgba(61,220,132,.14)"; g.beginPath();
    for (let k = 0; k <= n; k++) g.lineTo(X(k), Y(ch[k]));
    for (let k = n; k >= 0; k--) g.lineTo(X(k), Y(cl[k]));
    g.closePath(); g.fill();
    g.strokeStyle = c.tx; g.lineWidth = 2.6; path(g, rt.map((v, k) => [X(k), Y(v)])); g.stroke();
    g.fillStyle = c.tx; g.beginPath(); g.arc(X(n), Y(rt[n]), 4.5, 0, 7); g.fill();
    const pm = Math.max(D.max("pc"), D.max("ph"), 1), bw = Math.max(1, pw / n - 2);
    for (let k = 1; k <= n; k++) {
      const v = Math.max(pc[k], hp[k]); if (v <= 0) continue;
      g.fillStyle = hp[k] > pc[k] ? c.heat : c.cool;
      g.fillRect(X(k) - bw, T2 + h2 - v / pm * h2, bw, v / pm * h2);
    }
    g.strokeStyle = c.bd; g.lineWidth = 1; g.beginPath(); g.moveTo(L, T2 + h2 + .5); g.lineTo(w - R, T2 + h2 + .5); g.stroke();
    g.textAlign = "right"; g.fillStyle = c.dim; g.fillText("kW", L - 8, T2 + h2 / 2);
    legend(g, c, L, 14, [[c.tx, "실내온도"], ["rgba(61,220,132,.55)", "쾌적 범위"], [c.cool, "냉방 전력 (최대 " + pm.toFixed(0) + " kW)"]]);
  }

  // 14일 전체: 태양광 면적, 냉방 띠, 재생 위치
  let tlCache = null;
  function timeline(canvas, pos) {
    const o = prep(canvas); if (!o) return; const { g, w, h } = o, c = colors();
    const dpr = canvas.width / w;
    if (!tlCache || tlCache.width !== canvas.width || tlCache.height !== canvas.height) {
      tlCache = document.createElement("canvas"); tlCache.width = canvas.width; tlCache.height = canvas.height;
      const s = tlCache.getContext("2d"); s.setTransform(dpr, 0, 0, dpr, 0, 0); s.font = FONT; s.textBaseline = "top";
      const N = D.N, pv = D.series("pvs"), pm = D.max("pvs") || 1, X = k => k / (N - 1) * w;
      s.fillStyle = c.pv; s.globalAlpha = .55; s.beginPath(); s.moveTo(0, h - 4);
      for (let k = 0; k < N; k++) s.lineTo(X(k), h - 4 - pv[k] / pm * (h - 8));
      s.lineTo(w, h - 4); s.closePath(); s.fill(); s.globalAlpha = 1;
      s.fillStyle = c.cool;
      for (let k = 0; k < N; k++) if (D.mode(k) === 1) s.fillRect(X(k), h - 3, Math.max(1, w / N), 3);
      const days = D.results().days;
      days.forEach((d, k) => {
        const x = k / days.length * w;
        if (k) { s.strokeStyle = c.bd; s.beginPath(); s.moveTo(x + .5, 0); s.lineTo(x + .5, h); s.stroke(); }
        if (w / days.length > 52) { s.fillStyle = c.dim; s.fillText(d.label, x + 5, 1); }
      });
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tlCache, 0, 0); g.restore();
    const x = pos / (D.N - 1) * w;
    g.strokeStyle = c.tx; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }

  ZEB.chart = { forecast, roomTrend, timeline, colors };
})();
