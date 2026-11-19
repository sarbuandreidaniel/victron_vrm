"""Offline tests for the weekly summary, the solar window and the odometer readings.

Run with the repo's HA virtualenv:
    .venv_ha/bin/python integrations/victron_vrm/scripts/test_week_window.py
"""

from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.forecast import solar_window  # noqa: E402
from victron_vrm.odometer import add_reading  # noqa: E402
from victron_vrm.summary import bounds, default_day, label, summarize  # noqa: E402


def test_week_bounds_and_label():
    assert bounds("week", date(2026, 11, 19)) == (date(2026, 11, 16), date(2026, 11, 22))
    assert bounds("week", date(2026, 11, 16)) == (date(2026, 11, 16), date(2026, 11, 22))
    assert label("week", date(2026, 11, 19)) == "16–22 noiembrie 2026"
    assert label("week", date(2026, 11, 1)) == "26 octombrie – 1 noiembrie 2026"
    assert label("week", date(2026, 12, 30)) == "28 decembrie 2026 – 3 ianuarie 2027"
    # on a Thursday the last complete week ended last Sunday; on a Monday, yesterday
    assert default_day("week", date(2026, 11, 19)) == date(2026, 11, 15)
    assert default_day("week", date(2026, 11, 16)) == date(2026, 11, 15)


def test_week_summary_has_no_losses_line():
    vals = [{"Pc": 13.6, "Pb": 33.3, "Bc": 19.8, "Gc": 9.6, "Gb": 1.1, "Bg": 0.1}.get(c, 0.0) for c in CODES]
    out = summarize("week", date(2026, 11, 19), vals, 4)
    assert out["label"] == "16–22 noiembrie 2026"
    assert "kWh/zi" in out["message"] and "Pierderi" not in out["message"]
    assert "Pierderi" in summarize("month", date(2026, 11, 19), vals, 19)["message"]


def test_solar_window():
    hours = {"09": [1.0, 0.6, 0], "10": [2.9, 1.1, 0], "11": [3.6, 0.5, 0], "12": [4.0, 0.5, 0],
             "13": [2.2, 0.5, 0], "14": [0.4, 0.3, 0], "15": [0.1, 0.4, 0], "20": [0, 5, 4]}
    w = solar_window(hours)
    assert (w["start"], w["end"]) == (9, 14)
    assert w["surplus_kwh"] == round(0.4 + 1.8 + 3.1 + 3.5 + 1.7, 2)
    # the EV part of VRM's consumption forecast is not the house's use
    assert solar_window({"12": [3.0, 6.0, 5.0]})["surplus_kwh"] == 2.0
    assert solar_window({"12": [0.2, 0.1, 0]}) is None
    assert solar_window({}) is None


def test_odometer_keeps_the_highest_reading_of_the_day():
    days = {}
    assert add_reading(days, date(2026, 11, 19), 4950.0)
    assert add_reading(days, date(2026, 11, 19), 4953.0)
    assert not add_reading(days, date(2026, 11, 19), 4951.0)
    assert not add_reading(days, date(2026, 11, 20), 0.0)
    assert days == {"2026-11-19": 4953.0}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
