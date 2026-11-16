#!/usr/bin/env python3
"""화면 검사. index.html을 file:// 로 열어 확인한다.

    python3 tests/smoke.py                # 전부
    python3 tests/smoke.py --only view1,view4

실패하면 0이 아닌 값으로 끝난다. 캡처는 tests/shots/ 에 남는다.
"""
import argparse
import pathlib
import sys
import traceback

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "tests" / "shots"

MIN_FONT_JS = """() => {
  let min = 999;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style')) continue;
    const r = el.getClientRects();
    if (!r.length || r[0].width === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // SVG 안의 글자는 viewBox 배율만큼 화면에서 커지거나 작아진다
    let px = parseFloat(cs.fontSize);
    const svg = el.closest('svg');
    if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      const b = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      px *= Math.min(b.width / vb.width, b.height / vb.height);
    }
    if (px < min) min = px;
  }
  return min;
}"""

TEXT_OVERLAP_JS = """(sel) => {
  const root = document.querySelector(sel);
  const box = e => e.getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const texts = [...root.querySelectorAll('text')].filter(t => t.textContent.trim());
  const cells = [...root.querySelectorAll('[data-cell],[data-spark]')];
  const bad = [];
  for (let i = 0; i < texts.length; i++) {
    const a = box(texts[i]);
    for (let j = i + 1; j < texts.length; j++) if (hit(a, box(texts[j]))) bad.push(texts[i].textContent + ' × ' + texts[j].textContent);
    for (const c of cells) if (hit(a, box(c))) bad.push(texts[i].textContent + ' × cell');
  }
  return bad;
}"""

GL_NONBLANK_JS = """(sel) => {
  const c = document.querySelector(sel);
  const t = document.createElement('canvas'); t.width = 100; t.height = 100;
  const g = t.getContext('2d');
  g.drawImage(c, c.width / 2 - 50, c.height / 2 - 50, 100, 100, 0, 0, 100, 100);
  const d = g.getImageData(0, 0, 100, 100).data, seen = new Set();
  for (let i = 0; i < d.length; i += 16) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return seen.size;
}"""


class Page:
    """검사에서 쓰는 짧은 이름들."""

    def __init__(self, browser, query="", w=1440, h=900, reduced=False):
        self.ctx = browser.new_context(viewport={"width": w, "height": h},
                                       reduced_motion="reduce" if reduced else "no-preference")
        self.p = self.ctx.new_page()
        self.errors, self.external = [], []
        self.p.on("pageerror", lambda e: self.errors.append(str(e)))
        self.p.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.p.on("request", lambda r: None if r.url.startswith(("file:", "data:", "blob:")) else self.external.append(r.url))
        self.p.goto(URL + (("?" + query) if query else ""))
        self.p.evaluate("document.fonts.ready")
        self.p.wait_for_timeout(700)

    def close(self): self.ctx.close()
    def text(self, sel): return self.p.locator(sel).first.inner_text().strip()
    def texts(self, sel): return [t.strip() for t in self.p.locator(sel).all_inner_texts()]
    def count(self, sel): return self.p.locator(sel).count()
    def attr(self, sel, name): return self.p.locator(sel).first.get_attribute(name)
    def visible(self, sel): return self.p.locator(sel).first.is_visible()
    def press(self, key): self.p.keyboard.press(key); self.p.wait_for_timeout(120)
    def wait(self, ms): self.p.wait_for_timeout(ms)
    def evaluate(self, js, arg=None): return self.p.evaluate(js, arg)
    def box(self, sel): return self.p.locator(sel).first.bounding_box()
    def boxes(self, sel): return [l.bounding_box() for l in self.p.locator(sel).all()]
    def font_px(self, sel): return self.p.evaluate("s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)", sel)
    def min_font(self): return self.p.evaluate(MIN_FONT_JS)
    def no_overflow(self): return self.p.evaluate("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight")
    def set_viewport(self, w, h): self.p.set_viewport_size({"width": w, "height": h}); self.p.wait_for_timeout(350)
    def shot(self, name): SHOTS.mkdir(parents=True, exist_ok=True); self.p.screenshot(path=str(SHOTS / f"{name}.png"))
    def clean(self): assert self.errors == [], self.errors[:3]; assert self.external == [], self.external[:3]


def inside(b, outer, pad=0):
    return (b["x"] >= outer["x"] + pad - 0.5 and b["y"] >= outer["y"] + pad - 0.5 and
            b["x"] + b["width"] <= outer["x"] + outer["width"] - pad + 0.5 and
            b["y"] + b["height"] <= outer["y"] + outer["height"] - pad + 0.5)


CHECKS = {}


def check(fn):
    CHECKS[fn.__name__] = fn
    return fn


# ───────────────────────── Task 1 ─────────────────────────
@check
def shell_static(B):
    pg = Page(B, "paused=1&i=337")
    pg.clean()
    assert pg.evaluate("[...document.fonts].some(f => f.family.includes('Pretendard') && f.status === 'loaded')")
    for sel in ["#hdr-time", "#menu button[data-view='4']", "#cycle li:nth-child(5)",
                "#meas", "#events", "#timeline", "#btn-play"]:
        assert pg.count(sel) == 1, sel
    assert pg.min_font() >= 13, pg.min_font()
    assert pg.no_overflow()
    pg.close()


# ───────────────────────── Task 3 ─────────────────────────
@check
def shell_behavior(B):
    pg = Page(B, "paused=1&i=337")
    assert pg.text("#hdr-time") == "12:15:00" and pg.text("#hdr-date") == "2026-10-02"
    assert pg.attr("body", "data-view") == "1"
    pg.press("2"); assert pg.attr("body", "data-view") == "2"
    assert pg.attr("#menu button[data-view='2']", "aria-current") == "true"
    pg.press("4"); assert not pg.visible("#right")
    pg.press("1"); assert pg.visible("#right")
    pg.press("ArrowRight"); assert pg.text("#hdr-time") == "13:15:00"
    pg.press("Shift+ArrowLeft"); assert pg.text("#hdr-date") == "2026-10-01"
    pg.press("Home"); assert pg.text("#hdr-time") == "12:00:00" and pg.text("#hdr-date") == "2026-10-02"
    pg.press("]"); assert "4시간/초" in pg.text("#hdr-speed")
    pg.press("["); pg.press("["); assert "15분/초" in pg.text("#hdr-speed")
    assert pg.count("#events li") >= 1 and pg.count("#cycle li.r") == 1
    assert pg.text("#btn-play") == "재생"
    pg.press("Space"); assert pg.text("#btn-play") == "일시정지"
    t0 = pg.text("#hdr-time"); pg.wait(1300); assert pg.text("#hdr-time") != t0
    pg.p.click("#menu button[data-view='3']"); assert pg.attr("body", "data-view") == "3"
    assert pg.min_font() >= 13, pg.min_font()
    pg.clean(); pg.close()


@check
def carousel(B):
    pg = Page(B, "idle=2&dwell=1")
    pg.wait(3500)
    assert "자동 순환" in pg.text("#hdr-speed") and pg.attr("body", "data-view") != "1"
    pg.press("1")
    assert "자동 순환" not in pg.text("#hdr-speed") and pg.attr("body", "data-view") == "1"
    pg.clean(); pg.close()


@check
def resize(B):
    pg = Page(B, "paused=1&i=337")
    pg.set_viewport(1920, 1080); assert pg.no_overflow() and not pg.visible("#narrow")
    pg.set_viewport(1200, 800); assert pg.visible("#narrow") and not pg.visible("#hdr")
    pg.set_viewport(1440, 900); assert not pg.visible("#narrow") and pg.visible("#hdr") and pg.no_overflow()
    pg.clean(); pg.close()


# ───────────────────────── Task 4 ─────────────────────────
@check
def view1(B):
    pg = Page(B, "view=1&paused=1&i=337")
    pg.wait(1200)
    assert pg.count("#view canvas") >= 2
    assert pg.texts("#meas td:first-child") == ["일사량", "구름량", "외기온도", "15분 뒤 예측", "실측", "예측 오차", "건물 환산 발전", "계통 수전"]
    assert "2.6 W" in pg.text("#summary"), pg.text("#summary")
    tags = pg.boxes("#view .tag"); assert len(tags) == 3, len(tags)
    host = pg.box("#view .stage")
    for b in tags: assert inside(b, host), (b, host)
    assert pg.evaluate(GL_NONBLANK_JS, "#view .stage canvas") > 8
    assert pg.min_font() >= 13, pg.min_font()
    pg.shot("view1"); pg.clean(); pg.close()


@check
def view1_night(B):
    pg = Page(B, "view=1&paused=1&i=392")
    pg.wait(1200)
    body = pg.text("body")
    assert "NaN" not in body and "Infinity" not in body
    assert "발전이 없습니다" in pg.text("#summary")
    pg.shot("view1_night"); pg.clean(); pg.close()


# ───────────────────────── Task 5 ─────────────────────────
ROOM_ROWS = ["실내온도", "쾌적 범위", "외기온도", "EHP 운전", "EHP 소비전력", "건물 부하", "태양광 발전", "요금 단가"]


@check
def view2(B):
    pg = Page(B, "view=2&paused=1&i=337")
    pg.wait(1200)
    assert pg.texts("#meas td:first-child") == ROOM_ROWS
    assert pg.text("#meas tr:nth-child(1) .st") == "주의"
    assert pg.count("#view .tag.cool") == 3, pg.count("#view .tag.cool")
    assert "54.9 kW" in pg.text("#summary"), pg.text("#summary")
    host = pg.box("#view .stage")
    for b in pg.boxes("#view .tag"): assert inside(b, host), (b, host)
    assert pg.evaluate(GL_NONBLANK_JS, "#view .stage canvas") > 8
    assert pg.min_font() >= 13, pg.min_font()
    pg.shot("view2"); pg.clean(); pg.close()


@check
def view2_night(B):
    pg = Page(B, "view=2&paused=1&i=392")
    pg.wait(1200)
    assert pg.count("#view .tag.cool") == 0
    assert pg.evaluate("ZEB.sceneRoom.debug.peopleVisible") == 0
    assert "NaN" not in pg.text("body")
    pg.shot("view2_night"); pg.clean(); pg.close()


@check
def switching(B):
    pg = Page(B, "view=1&paused=1&i=337")
    for _ in range(20):
        pg.press("2"); pg.press("1")
    assert pg.evaluate("ZEB.gl.contexts") == 1
    assert pg.count("#view .tags") == 1 and pg.count("#view .tag") == 3
    pg.clean(); pg.close()


@check
def reduced_motion(B):
    pg = Page(B, "view=2&i=337", reduced=True)
    pg.wait(600)
    p0 = pg.evaluate("ZEB.sceneRoom.debug.particlePhase"); pg.wait(700)
    assert pg.evaluate("ZEB.sceneRoom.debug.particlePhase") == p0
    t0 = pg.text("#hdr-time"); pg.wait(1300); assert pg.text("#hdr-time") != t0
    pg.clean(); pg.close()


# ───────────────────────── Task 6 ─────────────────────────
@check
def view3(B):
    pg = Page(B, "view=3&paused=1&i=337")
    pg.wait(600)
    assert "구조는 추정" in pg.text("#view .ph")
    assert pg.count("#alg [data-cell='forecast']") == 24 and pg.count("#alg [data-cell='plan']") == 24
    assert pg.count("#alg [data-ctrl]") == 2 and pg.attr("#alg [data-ctrl='mpc']", "data-active") == "true"
    assert pg.attr("#alg [data-ctrl='rl']", "data-active") == "false"
    assert "Transformer" not in pg.text("body")
    t = pg.evaluate("document.querySelector('#alg').textContent")
    assert "이후 6시간 실제 운전값" in t and "× 3600" in t
    bad = pg.evaluate(TEXT_OVERLAP_JS, "#alg"); assert bad == [], bad[:5]
    assert pg.count("#alg .hot") >= 1                      # 15분 주기 단계에 맞춘 강조
    assert pg.min_font() >= 13, pg.min_font()
    pg.shot("view3")
    pg.evaluate("ZEB.algoSpec.confirmed = true; ZEB.shell.setView(1); ZEB.shell.setView(3)")
    assert "구조는 추정" not in pg.text("#view .ph")
    pg.set_viewport(1920, 1080); assert pg.min_font() >= 13 and pg.evaluate(TEXT_OVERLAP_JS, "#alg") == []
    pg.clean(); pg.close()


# ───────────────────────── Task 7 ─────────────────────────
@check
def view4(B):
    pg = Page(B, "view=4&paused=1&i=337")
    pg.wait(500)
    assert not pg.visible("#right")
    t = pg.text("#center")
    for s in ["0.854", "3.95", "5.8", "94", "370", "346", "64,839", "21.6", "153"]: assert s in t, s
    assert "쾌적" not in t                                   # showComfort=false
    assert "높게 예측" in t and "낮게 예측" not in t          # 치우침 음수 = 실측이 예측보다 낮음 = 과대예측
    assert pg.count("#res-waffle rect") == 370 and pg.count("#res-waffle rect.on") == 346
    assert pg.count("#res-days li") == 14 and pg.count("#res-days li.today") == 1
    assert "10/2" in pg.text("#res-days li.today")
    assert pg.count("#res-scatter circle.pt") == 648 and pg.count("#res-scatter circle.now") == 1
    assert pg.font_px("#res-r2") >= 56 and pg.font_px("#res-share") >= 56
    assert pg.no_overflow() and pg.min_font() >= 13, pg.min_font()
    v = pg.box("#view")
    for sel in ["#res-forecast", "#res-control", "#res-days"]:
        b = pg.box(sel); assert inside(b, v), sel
        assert pg.evaluate("s => { const e = document.querySelector(s); return e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1 }", sel), sel
    pg.shot("view4")
    pg.press("Shift+ArrowRight"); assert "10/3" in pg.text("#res-days li.today")
    pg.evaluate("ZEB.config.showComfort = true; ZEB.shell.setView(1); ZEB.shell.setView(4)"); pg.wait(400)
    assert "쾌적" in pg.text("#center") and "36" in pg.text("#res-control")
    pg.evaluate("ZEB.config.showComfort = false; ZEB.shell.setView(1); ZEB.shell.setView(4)"); pg.wait(400)
    pg.set_viewport(1920, 1080); assert pg.no_overflow() and pg.min_font() >= 13
    pg.shot("view4-1920")
    pg.clean(); pg.close()


# ───────────────────────── Task 8 ─────────────────────────
@check
def full_run(B):
    pg = Page(B, "view=1&i=0")
    pg.press("]"); pg.press("]")
    assert "12시간" in pg.text("#hdr-speed"), pg.text("#hdr-speed")
    seen = set()
    for _ in range(45):                                     # 소프트웨어 렌더링에서는 프레임이 느려 28초보다 오래 걸린다
        pg.wait(2000); seen.add(pg.text("#hdr-date"))
        if "2026-10-12" in seen and pg.text("#hdr-date") <= "2026-09-30": break
    assert "2026-10-12" in seen and pg.text("#hdr-date") in ("2026-09-29", "2026-09-30"), (sorted(seen)[-1], pg.text("#hdr-date"))
    pg.clean(); pg.close()


@check
def all_screens(B):
    for w, h in ((1440, 900), (1920, 1080)):
        pg = Page(B, "view=1&paused=1&i=337", w=w, h=h)
        for v in (1, 2, 3, 4):
            pg.press(str(v)); pg.wait(900)
            assert pg.no_overflow(), (v, w)
            assert pg.min_font() >= 13, (v, w, pg.min_font())
            assert inside(pg.box("#view"), pg.box("#center")), (v, w)
            pg.shot(f"final-{v}-{w}")
        pg.clean(); pg.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    names = [n for n in a.only.split(",") if n] or list(CHECKS)
    failed = []
    with sync_playwright() as p:
        B = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader",
                                    "--allow-file-access-from-files"])
        for n in names:
            try:
                CHECKS[n](B)
                print(f"PASS  {n}")
            except Exception:
                failed.append(n)
                print(f"FAIL  {n}")
                tb = traceback.format_exc().strip().splitlines()
                print("      " + "\n      ".join(tb[-4:]))
        B.close()
    print(f"\n{len(names) - len(failed)}/{len(names)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
