/* 화면 2 — 실내 제어: 3층 사무실 단면 3D와 실내온도 추이 */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data, f1 = v => v.toFixed(1);
  let scene = null, chart = null, lastI = -1;

  ZEB.shell.registerView(2, {
    mount(el) {
      const a = ZEB.shell.panel("3층 사무실", "3D 감시 · 끌어서 회전");
      const stage = document.createElement("div"); stage.className = "stage"; a.body.appendChild(stage);
      const b = ZEB.shell.panel("실내온도와 냉방 전력", "최근 24시간");
      b.root.style.flex = "0 0 228px";
      const box = document.createElement("div"); box.className = "chartbox"; chart = document.createElement("canvas"); box.appendChild(chart); b.body.appendChild(box);
      el.append(a.root, b.root);
      scene = ZEB.sceneRoom.get(); scene.attach(stage); lastI = -1;
    },
    unmount() { if (scene) scene.detach(); scene = null; chart = null; },
    resize() { if (scene) scene.resize(); lastI = -1; },
    update(s, dt) {
      if (!scene) return;
      scene.update(s, dt);
      if (s.i !== lastI) { lastI = s.i; ZEB.chart.roomTrend(chart, s.i); }
    },
    summary(s) {
      const room = "실내는 " + f1(s.rt) + "°C입니다.";
      if (s.cool) return "EHP가 " + f1(s.pc) + " kW로 냉방 중이고 " + room;
      if (s.heat) return "EHP가 " + f1(s.ph) + " kW로 난방 중이고 " + room;
      return "EHP는 멈춰 있고 " + room;
    },
    rows(s) {
      return [
        { name: "실내온도", value: f1(s.rt), unit: "°C", status: D.status(s).rt },
        { name: "쾌적 범위", value: f1(s.cl) + "–" + f1(s.ch), unit: "°C" },
        { name: "외기온도", value: f1(s.at), unit: "°C" },
        { name: "EHP 운전", value: s.cool ? "냉방" : s.heat ? "난방" : "정지", unit: "", cls: s.cool ? "v-cool" : s.heat ? "v-heat" : "" },
        { name: "EHP 소비전력", value: f1(s.heat ? s.ph : s.pc), unit: "kW", cls: s.heat ? "v-heat" : "v-cool" },
        { name: "건물 부하", value: f1(s.ld), unit: "kW" },
        { name: "태양광 발전", value: f1(s.pv), unit: "kW", cls: "v-pv" },
        { name: "요금 단가", value: f1(s.pr), unit: "원/kWh" }
      ];
    }
  });
})();
