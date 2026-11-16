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
