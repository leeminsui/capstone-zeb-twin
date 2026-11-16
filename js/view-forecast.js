/* 화면 1 — 발전 예측: 옥상 태양광 3D와 발전량 추이 */
(function () {
  "use strict";
  const ZEB = window.ZEB, D = ZEB.data, f1 = v => v.toFixed(1);
  let scene = null, chart = null, lastI = -1;

  ZEB.shell.registerView(1, {
    mount(el) {
      const a = ZEB.shell.panel("옥상 태양광 설비", "3D 감시 · 끌어서 회전");
      const stage = document.createElement("div"); stage.className = "stage"; a.body.appendChild(stage);
      const b = ZEB.shell.panel("발전량 추이와 6시간 예측", "대전 실증 패널 한 장의 값 (W)");
      b.root.style.flex = "0 0 228px";
      const box = document.createElement("div"); box.className = "chartbox"; chart = document.createElement("canvas"); box.appendChild(chart); b.body.appendChild(box);
      el.append(a.root, b.root);
      scene = ZEB.sceneExterior.get(); scene.attach(stage); lastI = -1;
    },
    unmount() { if (scene) scene.detach(); scene = null; chart = null; },
    resize() { if (scene) scene.resize(); lastI = -1; },
    update(s, dt) {
      if (!scene) return;
      scene.update(s, dt);
      if (s.i !== lastI) { lastI = s.i; ZEB.chart.forecast(chart, s.i); }
    },
    summary(s) {
      if (s.fc < 1 && s.meas < 1) {
        const wh = D.horizon(s.i).reduce((a, b) => a + b, 0) / 4;
        return "지금은 발전이 없습니다. 앞으로 6시간 예측 합계는 " + wh.toFixed(0) + " Wh입니다.";
      }
      const e = s.meas - s.fc;
      if (Math.abs(e) < 0.05) return "지금 발전량이 15분 전 예측과 일치합니다.";
      return "지금 발전량은 15분 전 예측보다 " + f1(Math.abs(e)) + " W " + (e < 0 ? "낮습니다." : "높습니다.");
    },
    rows(s) {
      const e = s.meas - s.fc;
      return [
        { name: "일사량", value: s.sghi.toFixed(0), unit: "W/m²" },
        { name: "구름량", value: (s.cc * 100).toFixed(0), unit: "%" },
        { name: "외기온도", value: f1(s.at), unit: "°C" },
        { name: "15분 뒤 예측", value: f1(D.horizon(s.i)[0]), unit: "W", cls: "v-pv" },
        { name: "실측", value: f1(s.meas), unit: "W" },
        { name: "예측 오차", value: Math.abs(e) < 0.05 ? "0.0" : (e > 0 ? "+" : "") + f1(e), unit: "W" },
        { name: "건물 환산 발전", value: f1(s.pv), unit: "kW", cls: "v-pv" },
        { name: "계통 수전", value: f1(s.gi), unit: "kW", cls: "v-grid" }
      ];
    }
  });
})();
