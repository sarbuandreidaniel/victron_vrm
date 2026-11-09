"""Offline tests for the VRM forecast cache and the forecast line of the summary.

Run with the repo's HA virtualenv:
    .venv_ha/bin/python integrations/victron_vrm/scripts/test_forecast.py
"""

from datetime import date, datetime
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.forecast import accuracy, apply_forecast, bucket_forecast, remaining  # noqa: E402
from victron_vrm.summary import summarize  # noqa: E402

TZ = ZoneInfo("Europe/Bucharest")


def ms(y, mo, d, h):
    return int(datetime(y, mo, d, h, tzinfo=TZ).timestamp() * 1000)


def test_bucket_wh_to_kwh():
    records = {
        "solar_yield_forecast": [[ms(2026, 11, 10, 11), 2720.0], [ms(2026, 11, 10, 12), 2380.0]],
        "vrm_consumption_fc": [[ms(2026, 11, 10, 20), 5070.0], [ms(2026, 11, 11, 0), 470.0]],
        "vrm_consum_evcs_fc": [[ms(2026, 11, 10, 20), 3970.0], [ms(2026, 11, 10, 21), None]],
    }
    b = bucket_forecast(records, TZ)
    assert b[date(2026, 11, 10)][11] == [2.72, 0.0, 0.0]
    assert b[date(2026, 11, 10)][20] == [0.0, 5.07, 3.97]
    assert b[date(2026, 11, 11)][0][1] == 0.47
    days: dict = {"2026-11-10": {"t": [99, 99, 99], "h": {}}, "2026-11-01": {"t": [1, 2, 0], "h": {}}}
    apply_forecast(days, b)
    assert days["2026-11-10"]["t"] == [5.1, 5.07, 3.97]
    assert set(days["2026-11-10"]["h"]) == {"11", "12", "20"}
    assert days["2026-11-01"]["t"] == [1, 2, 0], "days VRM did not return are kept"


def test_remaining_pro_rata():
    day = {"t": [6, 0, 0], "h": {"10": [2, 0, 0], "11": [2, 0, 0], "12": [2, 0, 0]}}
    assert remaining(day, datetime(2026, 11, 10, 11, 30, tzinfo=TZ)) == 3.0
    assert remaining(day, datetime(2026, 11, 10, 9, 0, tzinfo=TZ)) == 6.0
    assert remaining(day, datetime(2026, 11, 10, 13, 0, tzinfo=TZ)) == 0.0
    assert remaining(None, datetime(2026, 11, 10, 13, 0, tzinfo=TZ)) is None


def test_accuracy():
    def prod(pc, pb, pg):
        v = [0.0] * len(CODES)
        v[CODES.index("Pc")], v[CODES.index("Pb")], v[CODES.index("Pg")] = pc, pb, pg
        return v

    fc = {
        "2026-11-06": {"t": [13.6, 24.4, 7.3], "h": {}},
        "2026-11-07": {"t": [17.0, 22.9, 4.5], "h": {}},
        "2026-11-08": {"t": [0.2, 22.9, 4.5], "h": {}},  # too little forecast solar: skipped
    }
    actual = {
        "2026-11-06": prod(9.6, 7.8, 3.8),
        "2026-11-07": prod(5.4, 10.7, 0.0),
        "2026-11-08": prod(1, 1, 0),
        "2026-11-05": prod(5, 1, 0),  # no forecast: skipped
    }
    ratio, n = accuracy(fc, actual)
    assert n == 2
    assert abs(ratio - (21.2 + 16.1) / (13.6 + 17.0)) < 1e-9
    assert accuracy({}, actual) == (None, 0)


def test_summary_forecast_line():
    vals = [0.0] * len(CODES)
    vals[CODES.index("Pc")] = 5
    vals[CODES.index("Pe")] = 2
    vals[CODES.index("Gc")] = vals[CODES.index("Ge")] = 2
    fc = {"date": date(2026, 11, 10), "t": [14.8, 27.0, 7.4]}
    out = summarize("day", date(2026, 11, 9), vals, 1, forecast=fc)
    # the forecast must not change the day's own figures
    assert out["kwh"]["ev"] == 4 and "🚗 Mașina 4,0 kWh, 50% din solar + baterie" in out["message"], out["message"]
    assert out["forecast"] == {"date": "2026-11-10", "production": 14.8, "consumption": 27.0, "ev": 7.4}
    last = out["message"].splitlines()[-1]
    assert last == "🔮 Azi, după prognoza VRM: soare ~14,8 kWh · consum ~27,0 kWh, din care mașina ~7,4", last
    no_car = summarize("day", date(2026, 11, 9), vals, 1, forecast={"date": date(2026, 11, 10), "t": [3, 20, 0]})
    assert no_car["message"].endswith("consum ~20,0 kWh")
    plain = summarize("day", date(2026, 11, 9), vals, 1)
    assert "forecast" not in plain and "🔮" not in plain["message"]
    empty = summarize("day", date(2026, 11, 9), None, 0, forecast=fc)
    assert empty["message"].startswith("Nu există date") and "🔮" in empty["message"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
