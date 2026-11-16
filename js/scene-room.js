/* ZEB.sceneRoom — 3층 사무실 단면 (실내 제어 화면).
   지붕과 앞·오른쪽 벽을 걷어내고 위에서 비스듬히 내려다본다. 원근 없는 직교 투영.
   데이터에 없는 실내기별 전력·구역별 온도는 그리지 않는다. */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data, std = ZEB.gl.std, col = ZEB.gl.col;
  const reduced = ZEB.gl.reduced;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const debug = { particlePhase: 0, peopleVisible: 0 };

  function build() {
    const scene = new THREE.Scene(); scene.background = col(0x06090C);
    const L = 26, DP = 10, H = 3.0, X0 = -L / 2, Z0 = -DP / 2;
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
    const TARGET = v3(0, 1.55, .1), RADIUS = 60;
    const orbit = new ZEB.gl.Orbit({ az: .5, pol: 1.0, polMin: .5, polMax: 1.3 });

    const hemi = new THREE.HemisphereLight(0xC4D4E4, 0x1A222A, .5); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xFFF3DE, 1); sun.position.set(-6, 14, -22); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 70 });
    sun.shadow.bias = -.0006; sun.shadow.normalBias = .06;
    const fill = new THREE.DirectionalLight(0xBFD0E0, .35); fill.position.set(18, 20, 22); scene.add(fill);

    function mesh(geo, mat, x, y, z, parent, shadow) {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
      (parent || scene).add(m); return m;
    }
    const box = (w, h, d, mat, x, y, z, parent, shadow) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, shadow);
    function outline(m, color, op) {
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: op })));
    }

    // ── 바닥과 벽 ──
    const tile = (function () {
      const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
      g.fillStyle = "#46515B"; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "#39434C"; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(L / 1.2, DP / 1.2); t.anisotropy = ZEB.gl.anisotropy(); return t;
    })();
    const slab = box(L + .5, .35, DP + .5, std(0x2A343D), 0, -.18, 0); outline(slab, 0x6F8FA6, .7);
    const floor = mesh(new THREE.PlaneGeometry(L, DP), std(0xffffff, { map: tile, roughness: .9 }), 0, .005, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    const rug = mesh(new THREE.PlaneGeometry(6.4, 2.2), std(0x5C5A52, { roughness: 1 }), 9.2, .012, 2.2); rug.rotation.x = -Math.PI / 2; rug.castShadow = false;

    const wallM = std(0x4B5761), frameM = std(0xB9C3CB, { roughness: .5 }), concrete = std(0x7C858C, { roughness: .95 });
    const left = box(.25, H, DP, wallM, X0 - .12, H / 2, 0); outline(left, 0x6F8FA6, .5);
    box(.25, .22, DP + .5, wallM, L / 2 + .12, .11, 0); box(L + .5, .22, .25, wallM, 0, .11, DP / 2 + .12);
    const board = box(.04, 1.2, 2.6, std(0xE9EDF0, { roughness: .6 }), X0 + .04, 1.6, -1.2, null, false);
    box(.06, 2.1, 1.0, std(0x39434C), X0 + .05, 1.05, 3.4, null, false);
    void board;

    // 커튼월: 멀리언과 유리, 그 뒤에 하늘
    for (let k = 0; k <= 13; k++) box(.09, H, .14, frameM, X0 + k * (L / 13), H / 2, Z0);
    [0.06, .95, H - .06].forEach(y => box(L, .1, .14, frameM, 0, y, Z0));
    const glass = mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshBasicMaterial({ color: col(0x9CC8EA), transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }), 0, H / 2, Z0, null, false);
    const skyMat = new THREE.MeshBasicMaterial({ color: col(0x6FA2CF) });
    mesh(new THREE.PlaneGeometry(L, H), skyMat, 0, H / 2, Z0 - .35, null, false);
    const cityMat = new THREE.MeshBasicMaterial({ color: col(0x4E6A82) });
    [[-10, 1.9, 4.6], [-4.6, 1.2, 4], [1.5, 2.2, 5.4], [8.4, 1.5, 4.8]].forEach(b => mesh(new THREE.PlaneGeometry(b[2], b[1]), cityMat, b[0], b[1] / 2, Z0 - .3, null, false));
    void glass;
    [-8.6, -.2, 8.2].forEach(x => { const c = box(.55, H, .55, concrete, x, H / 2, Z0 + .55); outline(c, 0x1B2630, .4); });

    // 천장 높이를 알려 주는 테두리
    (function () {
      const g = new THREE.BufferGeometry().setFromPoints([v3(X0, H, Z0), v3(L / 2, H, Z0), v3(L / 2, H, DP / 2), v3(X0, H, DP / 2), v3(X0, H, Z0)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col(0x6F8FA6), transparent: true, opacity: .35 })));
      [[L / 2, DP / 2], [L / 2, Z0], [X0, DP / 2]].forEach(p => {
        const e = new THREE.BufferGeometry().setFromPoints([v3(p[0], 0, p[1]), v3(p[0], H, p[1])]);
        scene.add(new THREE.Line(e, new THREE.LineBasicMaterial({ color: col(0x6F8FA6), transparent: true, opacity: .25 })));
      });
    })();

    // ── 가구 ──
    const wood = std(0xA98A66, { roughness: .6 }), metal = std(0x6A747D, { roughness: .5, metalness: .3 }), pedM = std(0xC2C8CD, { roughness: .7 });
    const chairM = std(0x2B323A, { roughness: .9 }), paper = std(0xEEF1F3, { roughness: .9 }), keyM = std(0x23292F);
    const screenM = new THREE.MeshStandardMaterial({ color: col(0x10171D), emissive: col(0x5FB6E6), emissiveIntensity: .9, roughness: .3 });
    const seats = [];
    function desk(x, z, k) {
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      box(2.0, .05, .95, wood, 0, .74, 0, g);
      [[-.94, -.42], [.94, -.42], [-.94, .42], [.94, .42]].forEach(p => box(.05, .72, .05, metal, p[0], .36, p[1], g));
      box(.42, .56, .6, pedM, .68, .29, 0, g);
      box(.6, .36, .035, std(0x161C22), -.2, 1.07, -.3, g); box(.56, .32, .01, screenM, -.2, 1.07, -.279, g, false);
      box(.06, .14, .06, metal, -.2, .84, -.3, g); box(.24, .015, .16, metal, -.2, .775, -.3, g);
      box(.44, .02, .15, keyM, -.2, .775, .08, g, false);
      if (k % 2) box(.22, .012, .3, paper, .5, .772, .1, g, false);
      if (k % 3 === 0) mesh(new THREE.CylinderGeometry(.04, .035, .09, 10), std(0xD9D2C4), .15, .81, .25, g);
      // 의자
      const cx = -.2, cz = .9;
      box(.46, .07, .46, chairM, cx, .47, cz, g); box(.44, .5, .06, chairM, cx, .8, cz + .23, g);
      mesh(new THREE.CylinderGeometry(.03, .03, .34, 8), metal, cx, .28, cz, g);
      for (let a = 0; a < 5; a++) { const s = box(.3, .03, .04, metal, cx + Math.cos(a * 1.257) * .15, .1, cz + Math.sin(a * 1.257) * .15, g); s.rotation.y = -a * 1.257; }
      seats.push({ x: x + cx, z: z + cz, k });
    }
    let dk = 0;
    for (let i = 0; i < 5; i++) for (let r = 0; r < 2; r++) desk(-10.4 + i * 3.7, r ? 2.3 : -2.5, dk++);

    // 끝쪽 회의 공간: 유리 칸막이, 탁자, 의자
    const part = mesh(new THREE.PlaneGeometry(4.2, H - .3), new THREE.MeshBasicMaterial({ color: col(0x9CC8EA), transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false }), 6.9, (H - .3) / 2, -1.2, null, false);
    part.rotation.y = Math.PI / 2;
    box(.07, H - .3, .07, frameM, 6.9, (H - .3) / 2, .9); box(.07, .07, 4.2, frameM, 6.9, H - .3, -1.2);
    box(2.6, .05, 1.2, wood, 10.2, .74, -2.6); box(.08, .72, .08, metal, 9.2, .36, -2.6); box(.08, .72, .08, metal, 11.2, .36, -2.6);
    [[9.5, -1.7], [10.9, -1.7], [9.5, -3.5], [10.9, -3.5]].forEach(p => { box(.44, .07, .44, chairM, p[0], .47, p[1]); box(.44, .46, .06, chairM, p[0], .78, p[1] + (p[1] > -2.6 ? .22 : -.22)); });

    // 화분
    const potM = std(0xDDE1E4), leafM = std(0x3F7048, { roughness: 1 }), leafM2 = std(0x2F5A3A, { roughness: 1 });
    [[-12.2, -4.1], [-4.6, -4.2], [3.6, -4.2], [12.2, 4.2], [-12.2, 4.3]].forEach((p, k) => {
      mesh(new THREE.CylinderGeometry(.24, .18, .42, 12), potM, p[0], .21, p[1]);
      for (let a = 0; a < 6; a++) {
        const lf = mesh(new THREE.SphereGeometry(.2, 8, 6), a % 2 ? leafM : leafM2, p[0] + Math.cos(a * 1.05 + k) * .2, .78 + (a % 3) * .16, p[1] + Math.sin(a * 1.05 + k) * .2);
        lf.scale.set(.75, 1.7, .75); lf.rotation.set(Math.sin(a) * .5, 0, Math.cos(a) * .5);
      }
    });

    // ── 사람 ──
    const SKIN = [0xE8C7A6, 0xD9B08C, 0xF0D4B8], HAIR = [0x25201C, 0x3A2E26, 0x15120F];
    const SHIRT = [0xE7ECEF, 0x9DB3C8, 0x4A627F, 0xC8CDD1, 0x7C8A72, 0x2F3B4A], PANTS = [0x2E3640, 0x3D4652, 0x4A4640];
    const people = [], walkers = [];
    function person(seated, k) {
      const g = new THREE.Group();
      const sk = std(SKIN[k % 3], { roughness: .8 }), hr = std(HAIR[(k * 2) % 3], { roughness: .9 });
      const sh = std(SHIRT[(k * 5) % 6], { roughness: .9 }), pa = std(PANTS[k % 3], { roughness: .9 }), shoe = std(0x1E2328);
      const parts = {};
      if (seated) {
        box(.36, .5, .2, sh, 0, .9, .02, g).rotation.x = -.08;
        [-.1, .1].forEach(sx => { box(.14, .13, .44, pa, sx, .56, -.2, g); box(.12, .44, .12, pa, sx, .26, -.4, g); box(.11, .07, .24, shoe, sx, .04, -.46, g); });
        [-.22, .22].forEach(sx => {
          const u = box(.095, .3, .1, sh, sx, .95, -.06, g); u.rotation.x = .45;
          box(.085, .085, .3, sh, sx * .9, .8, -.3, g);
          mesh(new THREE.SphereGeometry(.05, 8, 6), sk, sx * .8, .8, -.47, g);
        });
        box(.09, .08, .09, sk, 0, 1.19, 0, g);
        parts.head = mesh(new THREE.SphereGeometry(.118, 14, 12), sk, 0, 1.33, -.01, g);
        const h = mesh(new THREE.SphereGeometry(.124, 14, 10, 0, 6.3, 0, 1.75), hr, 0, 1.345, .012, g); h.rotation.x = .25;
        if (k % 3 === 1) box(.2, .2, .06, hr, 0, 1.24, .1, g);
      } else {
        parts.legs = [-.09, .09].map(sx => { const p = new THREE.Group(); p.position.set(sx, .86, 0); g.add(p); box(.14, .84, .15, pa, 0, -.42, 0, p); box(.12, .07, .26, shoe, 0, -.83, -.05, p); return p; });
        box(.36, .56, .2, sh, 0, 1.16, 0, g);
        parts.arms = [-.23, .23].map(sx => { const p = new THREE.Group(); p.position.set(sx, 1.4, 0); g.add(p); box(.095, .56, .1, sh, 0, -.28, 0, p); mesh(new THREE.SphereGeometry(.05, 8, 6), sk, 0, -.6, 0, p); return p; });
        box(.09, .08, .09, sk, 0, 1.48, 0, g);
        mesh(new THREE.SphereGeometry(.118, 14, 12), sk, 0, 1.62, -.01, g);
        const h = mesh(new THREE.SphereGeometry(.124, 14, 10, 0, 6.3, 0, 1.75), hr, 0, 1.635, .012, g); h.rotation.x = .25;
        if (k % 2) box(.16, .22, .02, std(0x1C2A36), 0, 1.02, -.16, g);
      }
      scene.add(g); return { g, parts, k };
    }
    seats.forEach(s => { const p = person(true, s.k); p.g.position.set(s.x, 0, s.z + .05); p.seat = s; people.push(p); });
    [0, 1].forEach(k => { const p = person(false, k + 3); p.z = k ? 4.15 : .15; p.off = k * .47; walkers.push(p); });

    // ── 천장 조명과 실내기 ──
    const stripM = new THREE.MeshStandardMaterial({ color: col(0xF4F6F7), emissive: col(0xFFF3D6), emissiveIntensity: 1 });
    for (let k = 0; k < 6; k++) box(2.4, .05, .16, stripM, -10.4 + k * 4.16, H - .02, (k % 2) ? 1.9 : -1.9, null, false);
    const lamps = [-8, 0, 8].map(x => { const p = new THREE.PointLight(0xFFF1D8, .5, 16, 2); p.position.set(x, H - .3, .3); scene.add(p); return p; });

    const UX = [-8.5, 0, 8.5], UZ = .1;
    const unitM = new THREE.MeshStandardMaterial({ color: col(0xDCE3E8), emissive: col(0x3EC5FF), emissiveIntensity: 0, roughness: .5 });
    const grilleM = std(0x7F8C96, { roughness: .5 });
    const airM = new THREE.MeshBasicMaterial({ color: col(0x3EC5FF), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const ringM = new THREE.MeshBasicMaterial({ color: col(0x3EC5FF), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const diskM = new THREE.MeshBasicMaterial({ color: col(0x3EC5FF), transparent: true, opacity: 0, depthWrite: false });
    UX.forEach(x => {
      const u = box(1.25, .22, 1.25, unitM, x, H - .11, UZ); outline(u, 0x1B2630, .5);
      box(.78, .03, .78, grilleM, x, H - .235, UZ, null, false);
      [[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]].forEach(o => {
        const g = new THREE.BufferGeometry().setFromPoints([v3(x + o[0], H, UZ + o[1]), v3(x + o[0], H + .9, UZ + o[1])]);
        scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col(0x6F8FA6), transparent: true, opacity: .5 })));
      });
      const cone = mesh(new THREE.ConeGeometry(2.7, H - .28, 44, 1, true), airM, x, (H - .28) / 2, UZ, null, false); void cone;
      const ring = mesh(new THREE.RingGeometry(2.45, 2.7, 56), ringM, x, .02, UZ, null, false); ring.rotation.x = -Math.PI / 2;
      const disk = mesh(new THREE.CircleGeometry(2.45, 56), diskM, x, .018, UZ, null, false); disk.rotation.x = -Math.PI / 2;
    });
    const PN = 70, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(PN * 3 * 3), pSeed = [];
    for (let k = 0; k < PN * 3; k++) pSeed.push([Math.random(), Math.random() * 6.283, .25 + Math.random() * .75]);
    pGeo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
    const pMat = new THREE.PointsMaterial({ color: col(0x9FE3FF), size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    scene.add(new THREE.Points(pGeo, pMat));
    let phase = 0, walkT = 0;

    // ── 태그 ──
    const A_ROOM = v3(-10.8, .1, 4.4), A_WIN = v3(11.6, 2.4, Z0);
    const PC_MAX = Math.max(D.max("pc"), D.max("ph"), 1);
    const skyDay = col(0x5F8DB8), skyGrey = col(0x7C8791), skyNight = col(0x0B121B), tmpC = new THREE.Color();
    const cityDay = col(0x44607A), cityNight = col(0x131C26);
    let host = null, tags = null;
    const f1 = v => v.toFixed(1);

    function fit() {
      const s = ZEB.gl.fit(host), a = s.w / s.h, half = Math.max(7.2, 14.4 / a);
      cam.left = -half * a; cam.right = half * a; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
    }
    function attach(el) { host = el; ZEB.gl.attach(host); fit(); tags = new ZEB.gl.Tags(host); orbit.bind(host); }
    function detach() { if (tags) tags.remove(); tags = null; if (host) host.onpointerdown = host.onpointermove = host.onpointerup = host.onpointercancel = null; host = null; }
    function resize() { if (host) fit(); }

    function update(s, dt) {
      if (!host) return;
      const a = (s.hour - 6) / 12 * Math.PI, up = Math.sin(a), day = up > 0, cc = s.cc;
      const work = s.hour >= 8 && s.hour < 19.5;
      const dayF = day ? Math.min(1, up * 1.8) : 0;
      // 창밖과 조명
      tmpC.copy(skyDay).lerp(skyGrey, cc); skyMat.color.copy(skyNight).lerp(tmpC, dayF);
      cityMat.color.copy(cityNight).lerp(cityDay, dayF);
      sun.position.set(-Math.cos(a) * 14, 5 + Math.max(0, up) * 14, -22);
      sun.intensity = day ? (.15 + 1.0 * up) * (1 - .8 * cc) : 0; sun.castShadow = day && cc < .8;
      hemi.intensity = .16 + .34 * dayF + (work ? .14 : 0);
      fill.intensity = .1 + .25 * dayF + (work ? .1 : 0);
      stripM.emissiveIntensity = work ? 1.1 : .04;
      lamps.forEach(p => { p.intensity = work ? .5 : 0; });
      screenM.emissiveIntensity = work ? .9 : 0;

      // 사람: 업무시간에만
      let vis = 0;
      people.forEach(p => {
        const on = work && ((p.k * 7 + 3) % 10 !== 0);
        p.g.visible = on; if (on) vis++;
        if (on && !reduced) p.parts.head.position.y = 1.33 + Math.sin(walkT * .0021 + p.k) * .004;
        p.g.rotation.y = 0;
      });
      if (!reduced) walkT += dt;
      walkers.forEach(p => {
        p.g.visible = work; if (!work) return; vis++;
        const per = 46000, t = ((walkT + p.off * per) % per) / per, tri = t < .5 ? t * 2 : (1 - t) * 2;
        p.g.position.set(-11 + tri * 16.5, 0, p.z); p.g.rotation.y = t < .5 ? -Math.PI / 2 : Math.PI / 2;
        const sw = Math.sin(walkT * .007 + p.off * 9) * .5;
        p.parts.legs[0].rotation.x = sw; p.parts.legs[1].rotation.x = -sw;
        p.parts.arms[0].rotation.x = -sw * .7; p.parts.arms[1].rotation.x = sw * .7;
      });
      debug.peopleVisible = vis;

      // 냉난방
      const on = s.cool || s.heat, frac = Math.min(1, (s.cool ? s.pc : s.ph) / PC_MAX);
      const c = s.heat ? 0xFF8A5C : 0x3EC5FF;
      unitM.emissive.copy(col(c)); unitM.emissiveIntensity = on ? .55 : 0;
      [airM, ringM, diskM].forEach(m => m.color.copy(col(c)));
      airM.opacity = on ? .07 + .09 * frac : 0; ringM.opacity = on ? .55 : 0; diskM.opacity = on ? .07 + .08 * frac : 0;
      pMat.color.copy(col(s.heat ? 0xFFC2A8 : 0x9FE3FF)); pMat.opacity = on ? .85 : 0;
      if (on && !reduced) phase = (phase + dt * (.00018 + .00042 * frac)) % 1;
      debug.particlePhase = phase;
      if (on) {
        for (let u = 0; u < 3; u++) for (let k = 0; k < PN; k++) {
          const sd = pSeed[u * PN + k], t = (sd[0] + phase) % 1, r = (.35 + t * 2.3) * sd[2], o = (u * PN + k) * 3;
          pArr[o] = UX[u] + Math.cos(sd[1]) * r; pArr[o + 1] = (H - .3) * (1 - t); pArr[o + 2] = UZ + Math.sin(sd[1]) * r;
        }
        pGeo.attributes.position.needsUpdate = true;
      }

      const o = orbit.step(dt);
      cam.position.set(TARGET.x + RADIUS * Math.sin(o.pol) * Math.sin(o.az), TARGET.y + RADIUS * Math.cos(o.pol), TARGET.z + RADIUS * Math.sin(o.pol) * Math.cos(o.az));
      cam.lookAt(TARGET);
      ZEB.gl.render(scene, cam);

      const st = s.cool ? "냉방 운전" : s.heat ? "난방 운전" : "정지", cls = s.cool ? "cool" : s.heat ? "heat" : "";
      UX.forEach((x, k) => tags.set("u" + k, cls, v3(x, H + .9, UZ), "EHP-" + (k + 1) + "<b>" + st + "</b>", 14));
      const warn = D.status(s).rt;
      tags.set("rt", warn ? "warn" : "", A_ROOM, "실내온도<b>" + f1(s.rt) + "<u>°C" + (s.over > .05 ? " · 상한 +" + f1(s.over) : s.rt < s.cl - .05 ? " · 하한 −" + f1(s.cl - s.rt) : "") + "</u></b>", 12);
      tags.set("win", "", A_WIN, "창밖 일사<b>" + s.sghi.toFixed(0) + "<u>W/m²</u></b>", 12);
      tags.place(cam);
    }
    return { attach, detach, resize, update };
  }

  let inst = null;
  ZEB.sceneRoom = { get() { return inst || (inst = build()); }, debug };
})();
