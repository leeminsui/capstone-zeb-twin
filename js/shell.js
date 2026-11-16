/* ZEB.shell — 틀: 재생 루프, 공용 패널, 키보드, 자동 순환.
   화면은 registerView 로 등록한다. 인터페이스는 계획서 Task 3. */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data;
  const $ = id => document.getElementById(id);
  const RATES = [15, 60, 240, 720];                      // 분/초
  const RATE_LABEL = { 15: "15분/초", 60: "1시간/초", 240: "4시간/초", 720: "12시간/초" };
  const VIEW_NAMES = { 1: "발전 예측", 2: "실내 제어", 3: "알고리즘", 4: "실험 결과" };

  const state = { pos: ZEB.config.homeIndex, rate: 60, playing: true, view: 1, carousel: false };
  const views = {};
  let cur = null, lastI = -1, lastRows = "", lastWarn = {}, lastInput = 0, lastSwitch = 0;
  let idleMs = 60000, dwellMs = 30000, lastT = 0, tlStatic = null;

  function panel(title, tag) {
    const root = document.createElement("div"); root.className = "pn"; root.style.flex = "1";
    const ph = document.createElement("div"); ph.className = "ph";
    const b = document.createElement("b"); b.textContent = title || "";
    const s = document.createElement("span"); s.textContent = tag || "";
    ph.append(b, s);
    const body = document.createElement("div"); body.style.cssText = "flex:1;min-height:0;position:relative;display:flex;flex-direction:column";
    root.append(ph, body);
    return { root, body, head: ph, titleEl: b, tagEl: s };
  }

  function placeholder(n) {
    return {
      mount(el) { el.appendChild(panel(VIEW_NAMES[n], "준비 중").root); },
      unmount() {}, update() {}, resize() {},
      summary() { return VIEW_NAMES[n] + " 화면입니다."; },
      rows() { return []; }
    };
  }

  function registerView(id, v) { views[id] = v; if (cur && state.view === id) setView(id, true); }

  function setView(n, force) {
    n = Math.max(1, Math.min(4, n | 0));
    if (!force && cur && n === state.view) return;
    if (cur) cur.unmount();
    state.view = n;
    document.body.dataset.view = String(n);
    document.querySelectorAll("#menu button").forEach(b => b.setAttribute("aria-current", b.dataset.view === String(n) ? "true" : "false"));
    const host = $("view"); host.textContent = "";
    cur = views[n] || placeholder(n);
    cur.mount(host);
    lastRows = ""; lastI = -1; lastWarn = {};
    lastSwitch = performance.now();
    if (cur.resize) cur.resize();
    render(0);
  }

  const seek = pos => { state.pos = Math.max(0, Math.min(D.N - 1, pos)); lastI = -1; render(0); };
  const setPlaying = b => { state.playing = !!b; $("btn-play").textContent = state.playing ? "일시정지" : "재생"; drawSpeed(); };

  function drawSpeed() {
    const el = $("hdr-speed");
    el.textContent = (state.playing ? "기록 재생 " : "일시정지 ") + RATE_LABEL[state.rate];
    if (state.carousel) { const b = document.createElement("b"); b.textContent = "자동 순환"; el.appendChild(b); }
  }

  // ── 공용 패널 ──
  function drawHeader(s) {
    $("hdr-date").textContent = D.dateStr(s.pos);
    $("hdr-time").textContent = D.hms(s.pos);
    const l = $("lamp-ehp");
    l.className = "lamp " + (s.cool ? "cool" : s.heat ? "heat" : "off");
    l.textContent = s.cool ? "EHP 냉방" : s.heat ? "EHP 난방" : "EHP 정지";
    const stage = Math.min(4, Math.floor(s.frac * 5));
    document.querySelectorAll("#cycle li").forEach((li, k) => { li.className = k < stage ? "d" : k === stage ? "r" : ""; });
  }

  function drawRows(s) {
    const rows = cur.rows ? cur.rows(s) : [];
    const html = rows.map(r =>
      "<tr><td>" + r.name + "</td><td class=\"" + (r.cls || "") + "\">" + r.value + "</td><td>" + (r.unit || "") +
      "</td><td class=\"st" + (r.status ? " w" : "") + "\" data-k=\"" + r.name + "\">" + (r.status || "정상") + "</td></tr>").join("");
    if (html === lastRows) return;
    lastRows = html; $("meas").innerHTML = html;
    const warn = {};
    rows.forEach(r => { if (r.status) warn[r.name] = 1; });
    document.querySelectorAll("#meas td.st.w").forEach(td => { if (!lastWarn[td.dataset.k]) td.classList.add("flash"); });
    lastWarn = warn;
  }

  function drawEvents(i) {
    $("events").innerHTML = D.events(i, 9).map(e =>
      "<li class=\"" + e.level + "\"><span>" + D.hm(e.i) + "</span><span>" + e.kind + "</span><b>" + e.text + "</b></li>").join("");
  }

  function drawTimeline() {
    const c = $("timeline"), w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (ZEB.chart && ZEB.chart.timeline) { ZEB.chart.timeline(c, state.pos); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = "#25313B";
    for (let d = 1; d < 14; d++) { g.beginPath(); g.moveTo(d / 14 * w + .5, 0); g.lineTo(d / 14 * w + .5, h); g.stroke(); }
    g.strokeStyle = "#E8EFF4"; g.lineWidth = 2;
    const x = state.pos / (D.N - 1) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }

  function render(dt) {
    const s = D.at(state.pos);
    drawHeader(s);
    if (cur.summary) { const t = cur.summary(s); if ($("summary").textContent !== t) $("summary").textContent = t; }
    drawRows(s);
    if (s.i !== lastI) { lastI = s.i; drawEvents(s.i); }
    drawTimeline();
    if (cur.update) cur.update(s, dt, state.playing);
  }

  function frame(now) {
    const dt = Math.max(0, Math.min(120, now - lastT)); lastT = now;
    if (state.playing) {
      state.pos += state.rate * dt / 1000 / D.STEP_MIN;
      if (state.pos >= D.N - 1) state.pos = 0;
    }
    if (!state.carousel && now - lastInput > idleMs) { state.carousel = true; setPlaying(true); lastSwitch = now; }
    if (state.carousel && now - lastSwitch > dwellMs) setView(state.view % 4 + 1);
    render(dt);
    requestAnimationFrame(frame);
  }

  function touched() {
    lastInput = performance.now();
    if (state.carousel) { state.carousel = false; drawSpeed(); }
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    touched();
    const k = e.key;
    if (k >= "1" && k <= "4") setView(+k);
    else if (k === " ") setPlaying(!state.playing);
    else if (k === "ArrowRight" || k === "ArrowLeft") seek(state.pos + (k === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 96 : 4));
    else if (k === "Home") seek(ZEB.config.homeIndex);
    else if (k === "]" || k === "[") {
      const i = RATES.indexOf(state.rate) + (k === "]" ? 1 : -1);
      state.rate = RATES[Math.max(0, Math.min(RATES.length - 1, i))]; drawSpeed();
    } else return;
    e.preventDefault();
  }

  function start() {
    const q = new URLSearchParams(location.search);
    if (q.has("i")) state.pos = Math.max(0, Math.min(D.N - 1, +q.get("i") || 0));
    if (q.has("idle")) idleMs = (+q.get("idle") || 60) * 1000;
    if (q.has("dwell")) dwellMs = (+q.get("dwell") || 30) * 1000;
    lastInput = lastT = performance.now();

    window.addEventListener("keydown", onKey);
    ["pointerdown", "wheel"].forEach(ev => window.addEventListener(ev, touched, { passive: true }));
    window.addEventListener("resize", () => { if (cur && cur.resize) cur.resize(); drawTimeline(); });
    $("btn-play").addEventListener("click", () => setPlaying(!state.playing));
    document.querySelectorAll("#menu button").forEach(b => b.addEventListener("click", () => setView(+b.dataset.view)));
    const tl = $("timeline"); let drag = false;
    const tlSeek = e => { const r = tl.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * (D.N - 1)); };
    tl.addEventListener("pointerdown", e => { drag = true; tl.setPointerCapture(e.pointerId); tlSeek(e); });
    tl.addEventListener("pointermove", e => { if (drag) tlSeek(e); });
    ["pointerup", "pointercancel"].forEach(ev => tl.addEventListener(ev, () => { drag = false; }));

    setPlaying(!q.has("paused"));
    setView(+q.get("view") || 1, true);
    requestAnimationFrame(frame);
  }

  ZEB.shell = { registerView, start, state, setView, seek, setPlaying, panel };
})();
