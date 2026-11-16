# 감시제어(SCADA) 스타일 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네 화면(발전 예측, 실내 제어, 알고리즘, 실험 결과)을 하나의 어두운 감시제어 화면으로 다시 만든다.

**Architecture:** 고정된 틀(`shell`)이 재생 상태와 공용 패널을 갖고, 화면 네 개가 같은 인터페이스로 등록된다. 데이터 계산은 DOM과 무관한 `data.js`에 모아 Node로 테스트한다. 3D 장면 두 개는 각자 파일에 두고 보이는 것 하나만 렌더링한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음, ES 모듈 없음, 전역 `ZEB` 하나), Three.js r128(저장소에 포함), Pretendard Variable(저장소에 포함), 테스트는 `node --test`와 Python Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-scada-redesign-design.md` — 시안은 `docs/superpowers/specs/mock/*.png`. 실행자는 둘 다 읽는다.

## Global Constraints

- 가장 작은 글씨 13px. 크기 단계 13 / 14 / 16 / 18 / 26 / 56.
- 모서리 0, 그림자 없음, 반투명 패널 없음(3D 위 태그 배경만 90 % 불투명).
- 색은 전부 `css/app.css`의 CSS 변수. 값은 spec 6장 표 그대로. 태양광 `#FFB020`, 냉방 `#3EC5FF`, 계통 `#D77BFF`은 색 검사기를 어두운 바탕으로 통과해야 하며 실패하면 가장 가까운 통과 값으로 바꾼다.
- 외부 요청 0건. `file://`로 열려야 한다. `<script type="module">`, `fetch`, CDN 금지.
- Three.js는 r128 유지.
- 기준 해상도 1440×900, 1920×1080에서도 겹침·잘림 없음. 가로 1280px 미만이면 안내만 표시.
- 데이터에 없는 값(실내기별 전력, 구역별 온도, 차단기 상태)을 그리지 않는다.
- 화면 문구: 모델 이름을 특정하지 않는다("예측 모델"). "Transformer" 금지.
- `data/zeb_window.js`와 `scripts/export_window.py`는 수정하지 않는다.
- `ZEB.config.showComfort = false` (쾌적 범위 유지 36 % 숨김).
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By`와 `Claude-Session` 줄.

## Review Focus

1. **밤(발전 0, 냉방 정지)**: 요약 문장·계측값·차트가 `NaN`이나 "0으로 나눔" 없이 뜬다. → Task 2, 4
2. **재생 구간의 양 끝**: `i < 96`(24시간 추이), `i < 12`(지난 3시간), `i + 24 > N`(앞으로 6시간)에서 범위 밖을 읽지 않는다. → Task 2
3. **화면을 빠르게 왕복**: 1↔2를 20번 오가도 WebGL 컨텍스트가 늘지 않고 오류가 없다. → Task 5
4. **창 크기 변경**: 1440→1920→1280 미만→1440으로 바꿔도 3D와 차트가 다시 맞춰지고 안내가 뜨고 사라진다. → Task 3
5. **움직임 줄이기 설정**: `prefers-reduced-motion`에서 입자와 자동 회전이 멈추고 값 갱신은 계속된다. → Task 5

## File Structure

```
index.html                 틀의 정적 마크업, 스크립트 로드 순서
css/app.css                토큰, 틀, 패널, 표, 태그
js/data.js                 ZEB.data — 계산 전부 (DOM 없음)
js/shell.js                ZEB.shell — 재생 루프, 공용 패널, 키보드, 자동 순환
js/chart.js                ZEB.chart — 캔버스 추이 차트
js/scene-exterior.js       ZEB.sceneExterior — 외관 3D
js/scene-room.js           ZEB.sceneRoom — 사무실 단면 3D
js/view-forecast.js        화면 1
js/view-room.js            화면 2
js/view-algo.js            화면 3 + ZEB.algoSpec(구조도 설정 데이터)
js/view-results.js         화면 4
vendor/three.min.js        r128
vendor/PretendardVariable.woff2
tests/data.test.js         node --test
tests/smoke.py             Playwright: file:// 로 열어 검사
```

스크립트 로드 순서: `vendor/three.min.js`, `data/zeb_window.js`, `js/data.js`, `js/chart.js`, `js/scene-*.js`, `js/shell.js`, `js/view-*.js`. 마지막에 `ZEB.shell.start()`.

---

### Task 1: 틀의 뼈대와 오프라인 자산

**Files:**
- Create: `vendor/three.min.js`, `vendor/PretendardVariable.woff2`, `css/app.css`, `tests/smoke.py`
- Modify: `index.html` (전체 교체)
- Keep for reference until Task 8: 기존 `index.html`을 `legacy/index.html`로 옮긴다

**Interfaces:**
- Produces (DOM id): `#hdr-date`, `#hdr-time`, `#hdr-speed`, `#lamp-ehp`, `#menu`(안에 `button[data-view="1..4"]`), `#cycle`(`li` 5개), `#center`, `#right`, `#meas`(table), `#events`(ul), `#timeline`(canvas), `#btn-play`, `#narrow`(1280px 미만 안내)
- Produces (CSS class): `.pn`, `.ph`, `.tag`, `.tag.pv|.cool|.grid|.warn`, `.lamp`, `.v-pv|.v-cool|.v-grid`, `.st`, `.st.w`
- Produces: `python3 tests/smoke.py [--only NAME]` — 실패하면 0이 아닌 값으로 끝난다

- [ ] **Step 1: `tests/smoke.py` 작성 — 검사 `shell_static`**

`file://…/index.html`을 1440×900으로 열고 다음을 확인한다.

```python
assert errors == []                                   # pageerror, console error
assert external == []                                 # file: data: 이외 요청
assert page.evaluate("document.fonts.check('14px \"Pretendard Variable\"')")
for sel in ["#hdr-time", "#menu button[data-view='4']", "#cycle li:nth-child(5)",
            "#meas", "#events", "#timeline", "#btn-play"]:
    assert page.locator(sel).count() == 1
assert page.evaluate(MIN_FONT_JS) >= 13               # 보이는 텍스트 노드 전체의 최소 font-size
assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
```

`MIN_FONT_JS`는 화면에 보이는 모든 텍스트 노드의 부모 요소 `font-size` 최솟값을 돌려준다.

- [ ] **Step 2: 실행해서 실패 확인** — `python3 tests/smoke.py --only shell_static` → FAIL (요소 없음)
- [ ] **Step 3: 자산 넣기** — `npm pack three@0.128.0`에서 `build/three.min.js`, `npm pack pretendard`에서 `dist/web/variable/woff2/PretendardVariable.woff2`를 꺼내 `vendor/`에 둔다.
- [ ] **Step 4: `css/app.css`와 `index.html` 작성** — spec 4장의 배치(열 168px / 나머지 / 344px, 행 50px / 나머지 / 46px, 간격 6px)와 6장의 토큰. `mock/scada-1.png`의 틀을 기준으로 한다. `body[data-view="4"]`이면 `#right`를 숨기고 `#center`가 두 열을 차지한다. `@media (max-width:1279px)`에서 `#narrow`만 보인다.
- [ ] **Step 5: 색 검사** — `node <dataviz>/scripts/validate_palette.js "#FFB020,#3EC5FF,#D77BFF" --mode dark`. FAIL이 있으면 통과할 때까지 값을 조정하고 `app.css`와 spec 6장 표를 함께 고친다.
- [ ] **Step 6: 통과 확인** — `python3 tests/smoke.py --only shell_static` → PASS
- [ ] **Step 7: Commit** — "틀의 뼈대와 오프라인 자산"

---

### Task 2: 데이터 계층

**Files:**
- Create: `js/data.js`, `tests/data.test.js`

**Interfaces:**
- Produces `ZEB.data` (브라우저에서는 `window.ZEB`, Node에서는 `globalThis.ZEB`; `tests/data.test.js`는 `data/zeb_window.js`와 `js/data.js`를 `vm`으로 읽는다):

```js
ZEB.config = { showComfort: false, homeIndex: 336 }      // 10/02 12:00
ZEB.data.N            // 1344
ZEB.data.series(key)  // number[] — 빈 값을 앞뒤로 메운 배열. key: rt oat pc ph ld gi pvs cur pr cost cl ch fc meas cc at sghi
ZEB.data.mode(i)      // 0 정지, 1 냉방, 2 난방
ZEB.data.timeOf(i)    // Date (KST 기준 벽시계)
ZEB.data.hm(i)        // "12:15"
ZEB.data.at(pos)      // pos는 실수. { i, frac, date, rt, cl, ch, at, pc, ld, gi, pv, cur, pr, fc, meas, cc, sghi, mode, cool, heat, over }
                      //   over = rt - ch (양수면 상한 초과), 보간은 선형, mode는 floor(pos)
ZEB.data.past(key, i, n)    // i에서 끝나는 n개. 구간 밖은 첫 값으로 채운다
ZEB.data.future(key, i, n)  // i+1에서 시작하는 n개. 구간 밖은 마지막 값으로 채운다
ZEB.data.horizon(i)   // number[24], 단위 W
ZEB.data.sky(cc)      // "맑음" | "구름" | "흐림"   (0.35, 0.7 경계)
ZEB.data.status(s)    // sample → { rt: "주의"|"" }  (rt > ch+0.05 또는 rt < cl-0.05)
ZEB.data.events(i, max = 9)  // [{ i, kind: "MPC"|"EHP"|"실내"|"예측", text, level: ""|"c"|"w" }] 최근 순
ZEB.data.results()    // 한 번 계산해 캐시
  // { r2, mae, rmse, nmae, bias, cap, points:[[fc,meas]...] (낮시간),
  //   regimes:[{name,n,mae,bias}×3], cool, coolInPv, load, grid, pv, selfUse, selfShare, cost,
  //   comfortWork, days:[{date,pv,grid,cost,sky}×14] }
```

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/data.test.js`, `node:test` + `node:assert`)

```js
test("크기와 시각", () => { assert.equal(D.N, 1344); assert.equal(D.hm(337), "12:15"); });
test("결과 집계가 README와 일치", () => {
  const r = D.results();
  near(r.r2, 0.854, 0.001); near(r.mae, 3.95, 0.01); near(r.nmae, 5.8, 0.05);
  assert.equal(r.cool, 370); assert.equal(r.coolInPv, 346);
  near(r.load, 64839, 1); near(r.grid, 50824, 1); near(r.selfShare, 21.6, 0.05);
  near(r.cost, 1531834, 1);
  near(r.regimes[0].bias, -6.72, 0.01); near(r.regimes[2].bias, -0.16, 0.01);
  assert.equal(r.days.length, 14); assert.equal(r.points.length, 648);
});
test("이벤트", () => {
  const e = D.events(337);
  assert.ok(e.length <= 9 && e[0].i === 337 && e[0].kind === "MPC");
  assert.ok(e.some(x => x.kind === "EHP" && x.text === "냉방 기동 51.8 kW" && D.hm(x.i) === "10:30"));
});
test("양 끝에서 범위 밖을 읽지 않는다", () => {
  for (const i of [0, 3, 11, 95, 1320, 1343]) {
    assert.equal(D.past("rt", i, 96).length, 96);
    assert.equal(D.future("pc", i, 24).length, 24);
    assert.equal(D.horizon(i).length, 24);
    for (const v of [...D.past("rt", i, 96), ...D.future("pc", i, 24), ...D.horizon(i)]) assert.ok(Number.isFinite(v));
    assert.ok(Array.isArray(D.events(i)));
  }
});
test("밤에도 값이 유한하다", () => {
  const s = D.at(4 * 96 + 8.5);                 // 10/03 02:07
  for (const k of ["rt","cl","ch","at","pc","ld","gi","pv","pr","fc","meas","cc","sghi","over"]) assert.ok(Number.isFinite(s[k]), k);
  assert.equal(s.cool, false);
});
test("보간", () => { const a = D.at(337), b = D.at(338), m = D.at(337.5); near(m.rt, (a.rt + b.rt) / 2, 1e-9); assert.equal(m.i, 337); });
```

- [ ] **Step 2: 실패 확인** — `node --test tests/` → FAIL (`ZEB.data` 없음)
- [ ] **Step 3: `js/data.js` 구현** — 정의는 spec 8장 "값의 정의" 표. 예측 지표는 전 구간(1,344스텝), `regimes`와 `points`는 낮시간. `cap = max(fc, meas)`. 이벤트 규칙은 spec 4장. 하루의 `sky`는 09~17시 `cc` 평균.
- [ ] **Step 4: 통과 확인** — `node --test tests/` → 6 pass
- [ ] **Step 5: Commit** — "데이터 계층과 테스트"

---

### Task 3: 틀의 동작

**Files:**
- Create: `js/shell.js`
- Modify: `index.html`(스크립트 태그), `tests/smoke.py`(검사 `shell_behavior`, `resize`)

**Interfaces:**
- Consumes: `ZEB.data`, Task 1의 DOM id
- Produces:

```js
ZEB.shell.registerView(id /* 1..4 */, {
  title, tag,                      // 가운데 패널 제목 띠 좌·우 (화면이 패널을 직접 그리면 생략)
  fullWidth,                       // true면 오른쪽 열 숨김
  mount(centerEl),                 // 가운데를 채운다
  unmount(),
  update(sample, dtMs, playing),   // 매 프레임
  resize(),
  summary(sample),                 // 한 줄 문장
  rows(sample)                     // [{ name, value, unit, cls, status }]  status "" 이면 "정상"
})
ZEB.shell.start()                  // URL 인자: ?view=1..4  ?i=정수  ?paused=1  ?idle=초  ?dwell=초
ZEB.shell.state                    // { pos, rate, playing, view, carousel }
ZEB.shell.setView(n) / seek(pos) / setPlaying(b)
ZEB.shell.panel(title, tag)        // → { root, body }  제목 띠가 달린 .pn 요소를 만든다
```

- 키: spec 7장 표 그대로. 속도 단계 `[15, 60, 240, 720]`분/초, 기본 60.
- 자동 순환: 기본 `idle=60`, `dwell=30`. 켜지면 `#hdr-speed`에 "자동 순환" 추가.
- 요약 문장은 `#center` 맨 위 `#summary`(16px 한 줄)에 쓴다.
- 15분 제어 주기: `frac`을 5등분해 `#cycle li`에 `d`(끝남), `r`(진행 중) 클래스.
- `#lamp-ehp`: 냉방 "EHP 냉방"(하늘색), 난방 "EHP 난방", 그 외 "EHP 정지"(회색).

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# shell_behavior — ?paused=1&i=337 로 연다. 임시 화면 4개는 테스트가 아니라 shell이 기본 제공하는 빈 화면.
assert text("#hdr-time") == "12:15:00" and text("#hdr-date") == "2026-10-02"
press("2"); assert attr("body", "data-view") == "2"
press("4"); assert not visible("#right")
press("ArrowRight"); assert text("#hdr-time") == "13:15:00"
press("Shift+ArrowLeft"); assert text("#hdr-date") == "2026-10-01"
press("Home"); assert text("#hdr-time") == "12:00:00"
press("]"); assert "4시간/초" in text("#hdr-speed")
assert count("#events li") >= 1 and count("#cycle li.r") == 1
# carousel — ?idle=2&dwell=1
wait(3500); assert "자동 순환" in text("#hdr-speed") and attr("body","data-view") != "1"
press("1"); assert "자동 순환" not in text("#hdr-speed")
# resize
set_viewport(1920, 1080); assert no_overflow()
set_viewport(1200, 800);  assert visible("#narrow")
set_viewport(1440, 900);  assert not visible("#narrow")
```

- [ ] **Step 2: 실패 확인** — `python3 tests/smoke.py --only shell_behavior,resize` → FAIL
- [ ] **Step 3: `js/shell.js` 구현** — `requestAnimationFrame` 루프에서 `dt = max(0, min(120, now - last))`. 등록되지 않은 화면 번호는 제목만 있는 빈 패널로 채운다(이후 Task가 교체).
- [ ] **Step 4: 통과 확인** — `python3 tests/smoke.py` → 전부 PASS
- [ ] **Step 5: Commit** — "틀의 동작: 재생, 키보드, 자동 순환"

---

### Task 4: 발전 예측 화면

**Files:**
- Create: `js/chart.js`, `js/scene-exterior.js`, `js/view-forecast.js`
- Modify: `index.html`, `tests/smoke.py`(검사 `view1`, `view1_night`)

**Interfaces:**
- Consumes: `ZEB.data`, `ZEB.shell.registerView`, `ZEB.shell.panel`
- Produces:

```js
ZEB.chart.forecast(canvas, i)        // 지난 3시간 실측 + 현재 6시간 예측 + 1·2시간 전 예측(점선)
ZEB.chart.roomTrend(canvas, i)       // Task 5에서 사용: 24시간 실내온도+쾌적 띠 / 냉방 막대(위아래 두 칸)
ZEB.chart.timeline(canvas, pos)      // shell이 사용하도록 Task 3의 임시 구현을 이것으로 교체
ZEB.gl                               // 공유 THREE.WebGLRenderer 하나. ZEB.gl.attach(canvasHostEl) 로 옮겨 붙인다
ZEB.sceneExterior.create(hostEl) → { update(sample, dtMs, playing), resize(), setActive(bool) }
```

- 3D 요구사항은 spec 5.1 전체("시안에서 고쳐야 할 것" 다섯 줄 포함). 공학 2호관 치수는 `legacy/index.html`의 것을 쓴다(본관 40×7.5, 양쪽 날개 7.5×34, 4층, 층고 3.2).
- 태그는 `hostEl` 안의 DOM. 패널 경계에서 8px 안쪽으로 밀어 넣어 잘리지 않게 한다.
- 계측값 8행과 요약 문장은 spec 5.1, 4장 표.

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# view1 — ?view=1&paused=1&i=337
assert count("#center canvas") >= 2                       # 3D + 추이
assert texts("#meas td:first-child") == ["일사량","구름량","외기온도","15분 뒤 예측","실측","예측 오차","건물 환산 발전","계통 수전"]
assert "2.6 W" in text("#summary")
tags = boxes("#center .tag"); assert len(tags) == 3
for b in tags: assert inside(b, box("#center"))           # 잘리지 않음
assert gl_nonblank("#center canvas")                      # 3D 캔버스 중앙 100×100이 한 가지 색이 아님
shot("view1")
# view1_night — ?view=1&paused=1&i=392  (10/03 02:00)
assert "NaN" not in text("body") and "Infinity" not in text("body")
assert errors == []
shot("view1_night")
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: `js/chart.js` 구현** — 세 함수. 격자선은 흐리게, 선 굵기 2.6px, 글씨 13px.
- [ ] **Step 4: `js/scene-exterior.js` 구현**
- [ ] **Step 5: `js/view-forecast.js` 구현**
- [ ] **Step 6: 통과 확인 후 캡처를 눈으로 본다** — `tests/shots/view1.png`, `view1_night.png`를 `mock/scada-1.png`와 비교. spec 5.1의 다섯 항목이 모두 고쳐졌는지 하나씩 확인하고, 안 된 것은 고친 뒤 다시 캡처한다.
- [ ] **Step 7: Commit** — "발전 예측 화면"

---

### Task 5: 실내 제어 화면

**Files:**
- Create: `js/scene-room.js`, `js/view-room.js`
- Modify: `index.html`, `tests/smoke.py`(검사 `view2`, `view2_night`, `switching`, `reduced_motion`)

**Interfaces:**
- Consumes: `ZEB.gl`, `ZEB.chart.roomTrend`, `ZEB.shell`
- Produces: `ZEB.sceneRoom.create(hostEl) → { update, resize, setActive }` (Task 4와 같은 모양)

- 3D 요구사항은 spec 5.2 전체. 직교 투영. 재실 규칙: 08:00~19:30에만 앉아 있고 두 명이 통로를 오간다.
- 실내기별 전력·구역별 온도 태그 금지.

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# view2 — ?view=2&paused=1&i=337
assert texts("#meas td:first-child") == ["실내온도","쾌적 범위","외기온도","EHP 운전","EHP 소비전력","건물 부하","태양광 발전","요금 단가"]
assert text("#meas tr:nth-child(1) .st") == "주의"
assert count("#center .tag.cool") == 3 and "54.9 kW" in text("#summary")
shot("view2")
# view2_night — i=392 : 냉방 정지, 사람 없음
assert count("#center .tag.cool") == 0 and errors == []
shot("view2_night")
# switching — 1↔2 를 20번
for _ in range(20): press("2"); press("1")
assert page.evaluate("ZEB.gl.contexts") == 1 and errors == []
# reduced_motion — emulate_media(reduced_motion="reduce"), ?view=2&i=337 재생 상태
p0 = evaluate("ZEB.sceneRoom.debug.particlePhase"); wait(600)
assert evaluate("ZEB.sceneRoom.debug.particlePhase") == p0
t0 = text("#hdr-time"); wait(1200); assert text("#hdr-time") != t0     # 값 갱신은 계속
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: `js/scene-room.js` 구현**
- [ ] **Step 4: `js/view-room.js` 구현**
- [ ] **Step 5: 통과 확인 후 캡처를 눈으로 본다** — `mock/scada-2.png`와 비교. spec 5.2의 다섯 항목 확인.
- [ ] **Step 6: Commit** — "실내 제어 화면"

---

### Task 6: 알고리즘 화면

**Files:**
- Create: `js/view-algo.js`
- Modify: `index.html`, `tests/smoke.py`(검사 `view3`)

**Interfaces:**
- Consumes: `ZEB.data`, `ZEB.shell`
- Produces:

```js
ZEB.algoSpec = {
  confirmed: false,                       // false면 제목 띠에 "구조는 추정 — 코드 확인 후 확정"
  forecast: { inputs:[{id,title,sub,series,dir}], model:{title,note,blocks:[{id,title,lines}],links:[[from,to,label]]}, output:{...} },
  control:  { inputs:[...], controllers:[{id:"mpc",label:"MPC",state:"운영 중",active:true,goal,constraints:[...],solver},
                                         {id:"rl", label:"강화학습",state:"예정",active:false}], output:{...}, loop:"15분 뒤 다시 측정해서 처음부터 반복" }
}
```

- 상자·문구·화살표는 전부 `ZEB.algoSpec`에서 읽는다. 초기 내용은 `mock/scada-3.png`와 `/tmp`가 아닌 **spec 5.3**을 따른다(모델 이름 없음).
- SVG. 좌표계 904×750, `preserveAspectRatio="xMidYMid meet"`.
- 15분 제어 주기 단계와 맞춰 상자 테두리 강조: 1 기상 수집 → 예측 입력 3개, 2 발전량 예측 → 예측 모델, 3 MPC 최적화 → 제어기, 4 첫 입력 적용 → 운전 계획 첫 칸, 5 EHP 운전 → EHP·건물.
- 글자가 상자나 색칸과 겹치지 않아야 한다(시안의 알려진 결함).

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# view3 — ?view=3&paused=1&i=337
assert "구조는 추정" in text("#center .ph")
assert count("#alg [data-cell='forecast']") == 24 and count("#alg [data-cell='plan']") == 24
assert count("#alg [data-ctrl]") == 2 and attr("#alg [data-ctrl='mpc']", "data-active") == "true"
assert "Transformer" not in text("body")
assert "이후 6시간 실제 운전값" in text("#alg") and "× 3600" in text("#alg")
assert no_text_overlap("#alg")            # text 요소끼리, text와 [data-cell] 사이의 경계 상자가 겹치지 않음
evaluate("ZEB.algoSpec.confirmed = true; ZEB.shell.setView(1); ZEB.shell.setView(3)")
assert "구조는 추정" not in text("#center .ph")
shot("view3")
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: `js/view-algo.js` 구현**
- [ ] **Step 4: 통과 확인, 캡처 확인**
- [ ] **Step 5: Commit** — "알고리즘 화면"

---

### Task 7: 실험 결과 화면

**Files:**
- Create: `js/view-results.js`
- Modify: `index.html`, `css/app.css`(결과 화면 전용 규칙), `tests/smoke.py`(검사 `view4`)

**Interfaces:**
- Consumes: `ZEB.data.results()`, `ZEB.config.showComfort`, `ZEB.shell`
- Produces: 화면 4 (`fullWidth: true`)

- HTML과 SVG. 구성은 spec 5.4와 `mock/results-light.png`, 스타일은 Global Constraints.
- 큰 숫자 두 개만 56px 이상. 숫자는 전부 `results()`에서 온다.
- 산점도의 현재 위치 점과 "하루씩 보면"의 오늘 강조는 `update`에서 갱신한다.

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# view4 — ?view=4&paused=1&i=337
assert not visible("#right")
t = text("#center")
for s in ["0.854", "3.95", "5.8", "94", "370", "346", "64,839", "21.6", "153"]: assert s in t, s
assert "36" not in text("#res-control") or "쾌적" not in t          # showComfort=false
assert count("#res-waffle rect") == 370 and count("#res-waffle rect.on") == 346
assert count("#res-days li") == 14 and count("#res-days li.today") == 1
assert count("#res-scatter circle.pt") == 648
assert font_px("#res-r2") >= 56 and font_px("#res-share") >= 56
shot("view4")
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: `js/view-results.js` 구현**
- [ ] **Step 4: 통과 확인, 캡처 확인** — 1920×1080 캡처도 본다.
- [ ] **Step 5: Commit** — "실험 결과 화면"

---

### Task 8: 정리와 배포

**Files:**
- Delete: `legacy/`
- Modify: `README.md`, `tests/smoke.py`(검사 `full_run`)

- [ ] **Step 1: `smoke.py`에 검사 추가**

```python
# full_run — 화면 1, 재생, 속도 720분/초로 14일 끝까지 (약 30초) 돌리고 처음으로 돌아오는지
assert errors == [] and text("#hdr-date") in ("2026-09-29", "2026-09-30")
# 네 화면 × (1440×900, 1920×1080) 캡처, 모두 no_overflow, MIN_FONT >= 13, external == []
```

- [ ] **Step 2: 실행** — `node --test tests/ && python3 tests/smoke.py` → 전부 PASS
- [ ] **Step 3: `legacy/` 삭제, README 갱신** — 화면 설명을 새 네 화면으로 바꾸고, 조작 키 표, 오프라인 동작, 테스트 실행법을 적는다. "Transformer" 표기를 "예측 모델"로 바꾸고 spec 9장 2번(재생 구간의 예측은 예전 모델)을 "읽을 때 주의할 점"에 옮긴다. "실험 결과" 수치 표는 유지한다.
- [ ] **Step 4: 캡처 여덟 장을 눈으로 확인** — spec 10장 목록을 하나씩 대조.
- [ ] **Step 5: Commit, push** — "기존 화면 제거, README 갱신". GitHub Pages 주소에서 네 화면이 뜨는지 확인.
