/* ZEB.gl — 공유 렌더러와 3D 위 계측 태그.
   ZEB.sceneExterior — 공학 2호관 외관 (발전 예측 화면). */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ───────── 공유 렌더러: WebGL 컨텍스트는 하나만 만든다 ─────────
  ZEB.gl = (function () {
    let renderer = null, canvas = null;
    const api = { contexts: 0, reduced };
    function ensure() {
      if (renderer) return;
      canvas = document.createElement("canvas");
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      api.contexts++;
    }
    api.attach = function (host) { ensure(); host.insertBefore(canvas, host.firstChild); return api.fit(host); };
    api.fit = function (host) {
      ensure();
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      return { w, h };
    };
    api.render = function (scene, camera) { renderer.render(scene, camera); };
    api.anisotropy = function () { ensure(); return Math.min(8, renderer.capabilities.getMaxAnisotropy()); };

    // 계측 태그: 3D 좌표에 붙고, 패널 밖으로 잘리지 않게 밀어 넣는다
    api.Tags = function (host) {
      const layer = document.createElement("div"); layer.className = "tags"; host.appendChild(layer);
      const items = {}, v = new THREE.Vector3(), PAD = 8;
      this.set = function (id, cls, pos, html, ld) {
        let t = items[id];
        if (!t) {
          const el = document.createElement("div"), body = document.createElement("span"), line = document.createElement("i");
          el.style.transform = "none"; el.append(body, line); layer.appendChild(el);
          t = items[id] = { el, body, line, html: "", cls: null };
        }
        t.pos = pos; t.ld = ld || 22; t.live = true;
        if (t.cls !== cls) { t.cls = cls; t.el.className = "tag " + cls; }
        if (t.html !== html) { t.html = html; t.body.innerHTML = html; t.w = 0; }
      };
      this.sweep = function () { for (const k in items) { if (!items[k].live) { items[k].el.remove(); delete items[k]; } else items[k].live = false; } };
      this.place = function (camera) {
        const W = host.clientWidth, H = host.clientHeight, placed = [];
        Object.keys(items).map(k => items[k]).forEach(t => {
          v.copy(t.pos).project(camera);
          t.sx = (v.x * .5 + .5) * W; t.sy = (-v.y * .5 + .5) * H; t.vis = v.z < 1;
          if (!t.w) { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; }
        });
        Object.keys(items).map(k => items[k]).filter(t => t.vis).sort((a, b) => b.sy - a.sy).forEach(t => {
          let left = Math.max(PAD, Math.min(W - PAD - t.w, t.sx - t.w / 2));
          let top = Math.max(PAD, Math.min(H - PAD - t.h, t.sy - t.ld - t.h));
          for (const p of placed) {
            if (left < p.left + p.w + 4 && p.left < left + t.w + 4 && top < p.top + p.h + 4 && p.top < top + t.h + 4) {
              top = p.top - t.h - 4;
              if (top < PAD) { top = PAD; left = (p.left + p.w + 6 + t.w <= W - PAD) ? p.left + p.w + 6 : Math.max(PAD, p.left - t.w - 6); }
            }
          }
          placed.push({ left, top, w: t.w, h: t.h });
          t.el.style.left = left + "px"; t.el.style.top = top + "px"; t.el.hidden = false;
          t.line.style.setProperty("--lx", Math.max(4, Math.min(t.w - 4, t.sx - left)) + "px");
          t.line.style.setProperty("--ld", Math.max(0, t.sy - (top + t.h)) + "px");
        });
        Object.keys(items).map(k => items[k]).filter(t => !t.vis).forEach(t => { t.el.hidden = true; });
      };
      this.remove = function () { layer.remove(); };
    };

    // 궤도 카메라: 끌어서 돌리고, 손을 떼면 3초 뒤 기본 시점으로 돌아간다
    api.Orbit = function (def) {
      const o = this; let az = def.az, pol = def.pol, drag = null, lastDrag = -1e9;
      this.bind = function (host) {
        host.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY }; host.classList.add("drag"); host.setPointerCapture(e.pointerId); };
        host.onpointermove = e => {
          if (!drag) return;
          az -= (e.clientX - drag.x) * .006; pol = Math.max(def.polMin, Math.min(def.polMax, pol - (e.clientY - drag.y) * .005));
          drag = { x: e.clientX, y: e.clientY }; lastDrag = performance.now();
        };
        host.onpointerup = host.onpointercancel = () => { drag = null; host.classList.remove("drag"); lastDrag = performance.now(); };
      };
      this.step = function (dt) {
        if (!drag && performance.now() - lastDrag > 3000) {
          const k = reduced ? 1 : Math.min(1, dt * .003);
          let d = def.az - az; d = Math.atan2(Math.sin(d), Math.cos(d));
          az += d * k; pol += (def.pol - pol) * k;
        }
        return { az, pol };
      };
    };
    return api;
  })();

  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // r128은 hex 색을 선형값으로 읽는다. sRGB 출력에서 의도한 색이 나오도록 변환해 쓴다.
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: col(c), roughness: .85, metalness: .04 }, o || {}));
  ZEB.gl.col = col; ZEB.gl.std = std;
  function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

  // 외벽 텍스처: 창 띠가 있는 벽과, 밤에 불 켜진 창
  function facade(floors, bays, o, seed) {
    o = o || {}; const CW = 48, CH = 72, r = rng(seed || 7);
    const mk = () => { const c = document.createElement("canvas"); c.width = bays * CW; c.height = floors * CH; return c; };
    const a = mk(), b = mk(), g = a.getContext("2d"), e = b.getContext("2d");
    g.fillStyle = o.wall || "#C6CAC6"; g.fillRect(0, 0, a.width, a.height);
    e.fillStyle = "#000"; e.fillRect(0, 0, b.width, b.height);
    for (let f = 0; f < floors; f++) {
      g.fillStyle = o.band || "#AEB3B0"; g.fillRect(0, f * CH + CH - 12, a.width, 12);
      for (let k = 0; k < bays; k++) {
        const x = k * CW + 7, y = f * CH + 16;
        g.fillStyle = o.glass || "#1F2C38"; g.fillRect(x, y, CW - 14, 36);
        g.fillStyle = o.mull || "#9FA5A2"; g.fillRect(x + (CW - 14) / 2 - 1, y, 2, 36);
        if (r() < (o.lit == null ? .34 : o.lit)) { e.fillStyle = r() < .5 ? "#fff" : "#bbb"; e.fillRect(x, y, CW - 14, 36); }
      }
    }
    const map = new THREE.CanvasTexture(a), em = new THREE.CanvasTexture(b);
    map.encoding = THREE.sRGBEncoding; map.anisotropy = em.anisotropy = ZEB.gl.anisotropy();
    return { map, em };
  }

  function build() {
    const scene = new THREE.Scene();
    scene.background = col(0x06090C);
    scene.fog = new THREE.Fog(0x06090C, 190, 400); scene.fog.color.copy(scene.background);
    const cam = new THREE.PerspectiveCamera(30, 1, 1, 800);
    const TARGET = v3(1, 4, 1), RADIUS = 84;
    const orbit = new ZEB.gl.Orbit({ az: -0.625, pol: 1.137, polMin: .45, polMax: 1.45 });

    const hemi = new THREE.HemisphereLight(0xA9C0D6, 0x0A0E12, .5); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xFFF1DA, 1.2); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
    sun.shadow.bias = -.0008; sun.shadow.normalBias = .35;
    const moon = new THREE.DirectionalLight(0x7F9CC4, 0); moon.position.set(-30, 60, 40); scene.add(moon);

    const litMats = [];           // 밤에 창이 켜지는 재질
    function mesh(geo, mat, x, y, z, shadow) {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
      scene.add(m); return m;
    }
    function outline(m, color, op) {
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: op })));
    }
    function wallMat(tex, strength) {
      const m = std(0xffffff, { map: tex.map, emissiveMap: tex.em, emissive: col(0xFFD8A0), emissiveIntensity: 0 });
      m.userData.lit = strength; litMats.push(m); return m;
    }
    function block(w, h, d, x, z, o, seed, edgeColor, edgeOp, strength) {
      const fl = Math.max(1, Math.round(h / 3.3));
      const tx = facade(fl, Math.max(2, Math.round(d / 2.6)), o, seed), tz = facade(fl, Math.max(2, Math.round(w / 2.6)), o, seed + 3);
      const roof = std(o.roof || 0x59636C, { roughness: .95 });
      const m = mesh(new THREE.BoxGeometry(w, h, d), [wallMat(tx, strength), wallMat(tx, strength), roof, roof, wallMat(tz, strength), wallMat(tz, strength)], x, h / 2 + (o.base || 0), z);
      if (edgeColor != null) outline(m, edgeColor, edgeOp);
      return m;
    }

    // ── 바닥 ──
    const ground = mesh(new THREE.PlaneGeometry(900, 900), std(0x0B1116, { roughness: 1 }), 0, 0, 0);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    const gh = new THREE.GridHelper(600, 100, col(0x2A3946), col(0x18222B)); gh.position.y = .02; scene.add(gh);
    const flat = (w, d, x, z, c, y) => { const p = mesh(new THREE.PlaneGeometry(w, d), std(c, { roughness: 1 }), x, y || .05, z); p.rotation.x = -Math.PI / 2; p.castShadow = false; return p; };
    flat(160, 9, 0, 46, 0x141B21); flat(160, .25, 0, 46, 0x39444E, .07);
    flat(25, 33, 0, 2.5, 0x232D35);
    [[-6.3, -4.5], [6.3, -4.5], [-6.3, 8.5], [6.3, 8.5]].forEach(p => flat(8.6, 9.6, p[0], p[1], 0x1A2E22, .07));

    // ── 공학 2호관: ㄷ자 4층 ──
    const FH = 3.2, HT = 4 * FH, BASE = .5, ROOF = BASE + HT;
    const MAIN = { wall: "#C6CAC6", band: "#AEB3B0", glass: "#1F2C38", mull: "#9FA5A2", roof: 0x4C5660, base: BASE, lit: .34 };
    mesh(new THREE.BoxGeometry(42, BASE, 9), std(0x6B747C), 0, BASE / 2, -16);
    mesh(new THREE.BoxGeometry(9, BASE, 35.5), std(0x6B747C), -16.25, BASE / 2, 1);
    mesh(new THREE.BoxGeometry(9, BASE, 35.5), std(0x6B747C), 16.25, BASE / 2, 1);
    [[40, 7.5, 0, -16, 11], [7.5, 34, -16.25, 1, 23], [7.5, 34, 16.25, 1, 37]].forEach(w => {
      block(w[0], HT, w[1], w[2], w[3], MAIN, w[4], 0x1B2630, .5, .95);
      const cap = mesh(new THREE.BoxGeometry(w[0] + .5, .45, w[1] + .5), std(0xB4BABF), w[2], ROOF + .22, w[3]);
      outline(cap, 0x1B2630, .45);
      mesh(new THREE.BoxGeometry(w[0] - .5, .1, w[1] - .5), std(0x4C5660, { roughness: .95 }), w[2], ROOF + .46, w[3]);
    });

    // E2 타워: 벽돌색, 창과 층 구분, 계단실 띠, 간판
    const BR = { wall: "#6C5444", band: "#5A4538", glass: "#18222B", mull: "#7C6453", roof: 0x3F342D, lit: .28 };
    const TH = HT + 1.8;
    block(9, TH, 9, 16.25, 17.5, Object.assign({ base: BASE }, BR), 51, 0x2A2019, .6, .9);
    mesh(new THREE.BoxGeometry(9.5, .4, 9.5), std(0x53433A), 16.25, BASE + TH + .2, 17.5);
    mesh(new THREE.BoxGeometry(3.4, HT - .4, .25), wallMat(facade(4, 2, { wall: "#D2D3CC", band: "#B9BBB4", lit: .5 }, 61), .95), 16.25, BASE + (HT - .4) / 2, 22.08);
    (function sign() {
      const c = document.createElement("canvas"); c.width = 192; c.height = 96; const g = c.getContext("2d");
      g.fillStyle = "#6C5444"; g.fillRect(0, 0, 192, 96);
      g.fillStyle = "#F1EEE6"; g.font = "bold 64px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("E2", 96, 52);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const p = mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ map: t }), 16.25, BASE + TH - 1.0, 22.02, false);
      const q = mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ map: t }), 11.73, BASE + TH - 1.0, 17.5, false);
      q.rotation.y = -Math.PI / 2; void p;
    })();
    mesh(new THREE.BoxGeometry(4, .25, 2.4), std(0x8A9299), 16.25, 3.4, 23.2);   // 현관 캐노피

    // ── 중정 조경 ──
    const trunk = std(0x3B2F26, { roughness: 1 }), leafA = std(0x2D4E38, { roughness: 1 }), leafB = std(0x3A6347, { roughness: 1 }), hedge = std(0x24402F, { roughness: 1 });
    function tree(x, z, s) {
      mesh(new THREE.CylinderGeometry(.14 * s, .24 * s, 3.2 * s, 7), trunk, x, 1.6 * s, z);
      const a = mesh(new THREE.SphereGeometry(1.7 * s, 10, 8), leafA, x, 4.1 * s, z); a.scale.y = .85;
      mesh(new THREE.SphereGeometry(1.15 * s, 9, 7), leafB, x + .7 * s, 4.9 * s, z - .4 * s);
    }
    [[-6.3, -4.5, 1], [6.3, -4.5, .9], [-6.3, 8.5, .95], [6.3, 8.5, 1.05]].forEach(t => tree(t[0], t[1], t[2]));
    const hr = rng(5);
    for (let k = 0; k < 22; k++) {
      const q = [[-6.3, -4.5], [6.3, -4.5], [-6.3, 8.5], [6.3, 8.5]][k % 4], a = hr() * 6.28, d = 2.6 + hr() * 1.6;
      const h = mesh(new THREE.SphereGeometry(.6 + hr() * .35, 9, 7), hedge, q[0] + Math.cos(a) * d, .45, q[1] + Math.sin(a) * d * 1.05); h.scale.y = .72;
    }
    const tr = rng(17);
    for (let k = 0; k < 26; k++) {
      const a = tr() * 6.28, d = 34 + tr() * 30, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(z - 46) < 7) continue;
      tree(x, z, .9 + tr() * .5);
    }
    const car = rng(29), carCols = [0x9AA3AB, 0x20262D, 0x56616B, 0x6E2F2A, 0x24374F];
    for (let k = 0; k < 9; k++) {
      const c = std(carCols[Math.floor(car() * 5)], { roughness: .45, metalness: .3 }), x = -40 + k * 9 + car() * 3;
      mesh(new THREE.BoxGeometry(4.2, 1.0, 1.9), c, x, .7, 39.5);
      mesh(new THREE.BoxGeometry(2.2, .75, 1.75), c, x - .2, 1.55, 39.5);
    }

    // ── 주변 건물: 주 건물보다 어둡게 ──
    const CTX = { wall: "#1C2730", band: "#17212A", glass: "#2B3B48", mull: "#1C2730", roof: 0x141C23, lit: .2 };
    [[-66, -34, 28, 15, 14], [60, -52, 34, 14, 17], [-74, 30, 22, 18, 11], [70, 26, 20, 26, 14], [-8, -78, 48, 14, 17],
     [-58, 82, 24, 13, 14], [100, -10, 18, 34, 20], [22, 84, 30, 14, 11]].forEach((b, k) => {
      block(b[2], b[4], b[3], b[0], b[1], CTX, 70 + k * 5, 0x2C3B47, .9, .55);
    });

    // ── 옥상 태양광 ──
    const pvTex = (function () {
      const c = document.createElement("canvas"); c.width = 132; c.height = 90; const g = c.getContext("2d");
      g.fillStyle = "#1A4788"; g.fillRect(0, 0, 132, 90);
      g.strokeStyle = "#7DB0E6"; g.lineWidth = 1.5;
      for (let x = 0; x <= 132; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 90); g.stroke(); }
      for (let y = 0; y <= 90; y += 22.5) { g.beginPath(); g.moveTo(0, y); g.lineTo(132, y); g.stroke(); }
      g.strokeStyle = "#C3CDD6"; g.lineWidth = 5; g.strokeRect(0, 0, 132, 90);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = ZEB.gl.anisotropy(); return t;
    })();
    const pvMat = std(0xffffff, { map: pvTex, roughness: .22, metalness: .55, emissive: col(0x3C8FE0), emissiveMap: pvTex, emissiveIntensity: .1 });
    const pvPos = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 14; k++) pvPos.push([-17.2 + k * 2.62, -18.4 + r * 2.4]);
    [-16.25, 16.25].forEach(cx => { for (let r = 0; r < 10; r++) for (let k = 0; k < 2; k++) pvPos.push([cx - 1.3 + k * 2.6, -10.6 + r * 2.5]); });
    const pv = new THREE.InstancedMesh(new THREE.BoxGeometry(2.25, .08, 1.5), pvMat, pvPos.length);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, .55, .08), std(0x7A848D), pvPos.length);
    const dm = new THREE.Object3D();
    pvPos.forEach((p, k) => {
      dm.position.set(p[0], ROOF + 1.12, p[1]); dm.rotation.set(-22 * Math.PI / 180, 0, 0); dm.updateMatrix(); pv.setMatrixAt(k, dm.matrix);
      dm.position.set(p[0], ROOF + .76, p[1] - .35); dm.rotation.set(0, 0, 0); dm.updateMatrix(); legs.setMatrixAt(k, dm.matrix);
    });
    pv.castShadow = pv.receiveShadow = true; scene.add(pv, legs);

    // ── 실외기 네 대 ──
    const unitMat = std(0xAEB6BD, { emissive: col(0x3EC5FF), emissiveIntensity: 0, roughness: .6 });
    for (let k = 0; k < 4; k++) {
      const x = -11.2 + k * 7.5;
      const u = mesh(new THREE.BoxGeometry(1.8, 1.5, 1.2), unitMat, x, ROOF + 1.22, -13.5); outline(u, 0x1B2630, .5);
      mesh(new THREE.CylinderGeometry(.46, .46, .07, 22), std(0x232B33), x, ROOF + 2.0, -13.5);
    }

    // ── 수전 전주와 흐름 ──
    const pole = std(0x59646E);
    mesh(new THREE.CylinderGeometry(.18, .26, 19, 8), pole, 27, 9.5, -25);
    [16.4, 14.8].forEach(y => mesh(new THREE.BoxGeometry(5, .2, .2), pole, 27, y, -25));
    function flow(pts, color, n) {
      const curve = new THREE.CatmullRomCurve3(pts.map(p => v3(p[0], p[1], p[2])));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: .3 }));
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ color: col(color), size: 1.1, transparent: true, opacity: .95, depthWrite: false });
      scene.add(line, new THREE.Points(geo, mat));
      return { curve, line, geo, mat, n, phase: 0 };
    }
    const fPv = flow([[-16.25, ROOF + 1.4, -3], [-21.6, ROOF + .4, -1.5], [-21.8, 6, 2], [-20.1, 1.6, 4]], 0xFFB020, 12);
    const fGrid = flow([[27, 16.4, -25], [24.5, 12.5, -22.5], [21.5, 6, -19.5], [20.2, 1.6, -17.5]], 0xF58BC0, 12);
    const tmp = v3(0, 0, 0);
    function stepFlow(f, frac, dt) {
      if (!reduced) f.phase = (f.phase + dt * (.00010 + .00045 * frac)) % 1;
      const a = f.geo.attributes.position.array;
      for (let k = 0; k < f.n; k++) { f.curve.getPoint((f.phase + k / f.n) % 1, tmp); a[k * 3] = tmp.x; a[k * 3 + 1] = tmp.y; a[k * 3 + 2] = tmp.z; }
      f.geo.attributes.position.needsUpdate = true;
      const on = frac > .004; f.mat.opacity = on ? .95 : 0; f.line.material.opacity = on ? .32 : .08;
    }

    // ── 태그 ──
    const A_PV = v3(-16.25, ROOF + 1.8, 3), A_EHP = v3(11.3, ROOF + 2.1, -13.5), A_GRID = v3(27, 19.2, -25);
    const PV_MAX = D.max("pvs") || 1, GI_MAX = D.max("gi") || 1;
    let host = null, tags = null;
    const bgNight = col(0x05080B), bgDay = col(0x0B1219);
    const f1 = x => x.toFixed(1);

    function attach(el) {
      host = el; const s = ZEB.gl.attach(host); cam.aspect = s.w / s.h; cam.updateProjectionMatrix();
      tags = new ZEB.gl.Tags(host); orbit.bind(host);
    }
    function detach() { if (tags) tags.remove(); tags = null; if (host) host.onpointerdown = host.onpointermove = host.onpointerup = host.onpointercancel = null; host = null; }
    function resize() { if (!host) return; const s = ZEB.gl.fit(host); cam.aspect = s.w / s.h; cam.updateProjectionMatrix(); }

    function update(s, dt) {
      if (!host) return;
      const a = (s.hour - 6) / 12 * Math.PI, up = Math.sin(a), day = up > 0, cc = s.cc;
      sun.position.set(-Math.cos(a) * 80, Math.max(6, up * 85), 45);
      sun.intensity = day ? (.2 + 1.2 * up) * (1 - .75 * cc) : 0;
      sun.castShadow = day && cc < .8;
      moon.intensity = day ? 0 : .22;
      hemi.intensity = day ? .3 + .3 * up + .15 * cc : .2;
      scene.background.copy(bgNight).lerp(bgDay, day ? Math.min(1, up * 1.6) : 0);
      scene.fog.color.copy(scene.background);
      const night = day ? Math.max(0, 1 - up * 5) : 1;
      litMats.forEach(m => { m.emissiveIntensity = night * m.userData.lit; });
      const pf = Math.min(1, s.pv / PV_MAX);
      pvMat.emissiveIntensity = .05 + .55 * pf;
      unitMat.emissive.copy(col(s.heat ? 0xFF8A5C : 0x3EC5FF));
      unitMat.emissiveIntensity = (s.cool || s.heat) ? .55 : 0;
      stepFlow(fPv, pf, dt); stepFlow(fGrid, Math.min(1, s.gi / GI_MAX), dt);

      const o = orbit.step(dt);
      cam.position.set(TARGET.x + RADIUS * Math.sin(o.pol) * Math.sin(o.az), TARGET.y + RADIUS * Math.cos(o.pol), TARGET.z + RADIUS * Math.sin(o.pol) * Math.cos(o.az));
      cam.lookAt(TARGET);
      ZEB.gl.render(scene, cam);

      const run = s.cool ? "냉방" : s.heat ? "난방" : "";
      tags.set("pv", "pv", A_PV, "옥상 태양광<b>" + f1(s.pv) + "<u>kW</u></b>", 30);
      tags.set("ehp", s.cool ? "cool" : s.heat ? "heat" : "", A_EHP,
        "EHP 실외기<b>" + (run ? f1(s.cool ? s.pc : s.ph) + "<u>kW " + run + "</u>" : "정지") + "</b>", 26);
      tags.set("grid", "grid", A_GRID, "계통 수전<b>" + f1(s.gi) + "<u>kW</u></b>", 16);
      tags.place(cam);
    }
    return { attach, detach, resize, update };
  }

  let inst = null;
  ZEB.sceneExterior = { get() { return inst || (inst = build()); } };
})();
