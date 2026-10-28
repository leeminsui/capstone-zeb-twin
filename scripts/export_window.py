#!/usr/bin/env python3
"""서버 DB에서 재생 구간을 뽑아 data/zeb_window.js 를 만든다.

사용법:
    python scripts/export_window.py --db-dir "D:/00.대학/4-2/캡스톤/DB" \
        --start 2026-09-29 --end 2026-10-13

읽는 DB (모두 읽기 전용으로 연다 — 수집 스크립트가 돌고 있어도 안전):
    ehp_control_log.db            mpc_control_log_adv   15분 MPC 제어 로그
    pv_forecast_for_ehp_control.db pv_forecast_24step   PV 예측 (lead 1 = 15분 앞)
    pv_mppt_data_v2.db            pv_data               MPPT 실측 (원시 ~2초 간격)
    room_temperature.db           readings              DS18B20 실내온도 실측

주의: MPC 로그의 pv_kw 는 실측이 아니라 소형 패널 예측값을 3600배 스케일한 것이다.
      실측 발전량은 meas (W, 대전 패널 원단위) 쪽을 봐야 한다.
"""
import argparse
import datetime as dt
import json
import sqlite3
from pathlib import Path

STEP_MIN = 15
FIELDS = ["rt", "oat", "pc", "ph", "ld", "gi", "pvs", "cur",
          "pr", "cost", "cl", "ch", "fc", "meas", "ghi", "ptemp", "rtm", "hum"]
MPC_MAP = [("rt", "room_temp_est_c"), ("oat", "outdoor_temp_c"), ("pc", "p_cooling_kw"),
           ("ph", "p_heating_kw"), ("ld", "load_kw"), ("gi", "grid_import_kw"),
           ("pvs", "pv_kw"), ("cur", "pv_curtail_kw"), ("pr", "tou_price"),
           ("cost", "hourly_cost_krw"), ("cl", "comfort_min_c"), ("ch", "comfort_max_c")]


def ro(path):
    return sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)


def quarter_slot(col):
    """ISO 문자열 컬럼을 15분 슬롯 키로 자르는 SQL 조각."""
    return (f"substr({col},1,14)||printf('%02d',"
            f"(CAST(substr({col},15,2) AS INTEGER)/15)*15)")


def build(db_dir: Path, start: str, end: str) -> dict:
    t0 = dt.datetime.fromisoformat(start)
    n = int((dt.datetime.fromisoformat(end) - t0).total_seconds() // (STEP_MIN * 60))
    key = {(t0 + dt.timedelta(minutes=STEP_MIN * i)).strftime("%Y-%m-%dT%H:%M"): i
           for i in range(n)}
    out = {k: [None] * n for k in FIELDS}
    mode = [0] * n

    def put(field, slot, value, digits=2):
        i = key.get(slot[:16].replace(" ", "T"))
        if i is not None and value is not None:
            out[field][i] = round(float(value), digits)

    with ro(db_dir / "ehp_control_log.db") as c:
        c.row_factory = sqlite3.Row
        rows = c.execute(
            "SELECT * FROM mpc_control_log_adv "
            "WHERE timestamp_kst>=? AND timestamp_kst<?", (start, end))
        for r in rows:
            slot = r["timestamp_kst"].replace(" ", "T")[:16]
            for dst, src in MPC_MAP:
                put(dst, slot, r[src])
            i = key.get(slot)
            if i is not None:
                mode[i] = {"cooling": 1, "heating": 2}.get(r["mode"], 0)

    with ro(db_dir / "pv_forecast_for_ehp_control.db") as c:
        for ts, w in c.execute(
                "SELECT target_time_kst, predicted_pv_power_w FROM pv_forecast_24step "
                "WHERE lead_step=1 AND target_time_kst>=? AND target_time_kst<?",
                (start, end)):
            put("fc", ts, w)

    with ro(db_dir / "pv_mppt_data_v2.db") as c:
        slot = quarter_slot("timestamp")
        for s, power, ghi, temp in c.execute(
                f"SELECT {slot} s, AVG(power), AVG(solar_radiation_w_m2), AVG(temperature_1_c) "
                f"FROM pv_data WHERE timestamp>=? AND timestamp<? GROUP BY s", (start, end)):
            put("meas", s, power)
            put("ghi", s, ghi, 1)
            put("ptemp", s, temp, 1)

    room_db = db_dir / "room_temperature.db"
    if room_db.exists():
        with ro(room_db) as c:
            slot = quarter_slot("received_at")
            for s, temp, hum in c.execute(
                    f"SELECT {slot} s, AVG(temperature_c), AVG(humidity_pct) "
                    f"FROM readings WHERE received_at>=? AND received_at<? GROUP BY s",
                    (start, end)):
                put("rtm", s, temp)
                put("hum", s, hum, 1)

    return {"start": t0.isoformat(), "step_min": STEP_MIN, "n": n,
            "mode": mode, "pv_scale": 3600, **out}


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db-dir", required=True, help="DB 파일들이 있는 폴더")
    p.add_argument("--start", default="2026-09-29", help="구간 시작 (포함)")
    p.add_argument("--end", default="2026-10-13", help="구간 끝 (제외)")
    p.add_argument("--out", default="data/zeb_window.js")
    a = p.parse_args()

    payload = build(Path(a.db_dir), a.start, a.end)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, separators=(",", ":"))
    out.write_text(f"window.ZEB_DATA = {body};\n", encoding="utf-8")

    filled = sum(1 for v in payload["rt"] if v is not None)
    cooling = sum(1 for m in payload["mode"] if m == 1)
    print(f"{out}  {len(body)//1024} KB")
    print(f"  {a.start} ~ {a.end}   {payload['n']} 스텝")
    print(f"  MPC 로그 {filled} 스텝, 냉방 {cooling} 스텝")


if __name__ == "__main__":
    main()
