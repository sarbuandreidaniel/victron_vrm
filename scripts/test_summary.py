"""Offline tests for the period summaries behind the summary service.

    .venv_ha/bin/python integrations/victron_vrm/scripts/test_summary.py [cache.json]

With a copy of `.storage/victron_vrm.<entry>` it also prints yesterday, last
month and last year as the notification would show them.
"""

from datetime import date
import json
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.history import VrmHistory  # noqa: E402
from victron_vrm.summary import MESSAGE_MAX, bounds, default_day, kwh, summarize, units  # noqa: E402


def vals(**kw):
    return [kw.get(c, 0.0) for c in CODES]


def test_defaults_and_bounds():
    assert default_day("day", date(2026, 11, 3)) == date(2026, 11, 2)
    assert default_day("day", date(2026, 1, 1)) == date(2025, 12, 31)
    assert default_day("month", date(2026, 11, 1)) == date(2026, 10, 31)
    assert default_day("month", date(2027, 1, 1)) == date(2026, 12, 31)
    assert default_day("year", date(2027, 1, 1)) == date(2026, 12, 31)
    assert bounds("month", date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert bounds("month", date(2026, 12, 5)) == (date(2026, 12, 1), date(2026, 12, 31))
    assert bounds("year", date(2026, 6, 1)) == (date(2026, 1, 1), date(2026, 12, 31))


def test_format():
    assert kwh(3.25) == "3,2" or kwh(3.25) == "3,3"
    assert kwh(1234.4) == "1.234"
    assert kwh(99.96) == "100,0"


def test_figures_match_card():
    # 10 kWh solar → house of which 2 to the EV, 4 battery → house of which 1 to the EV
    r = summarize("month", date(2026, 10, 5), vals(Pc=10, Pb=6, Pg=1, Bc=4, Bg=0.5, Gc=3, Gb=1, Pe=2, Be=1, Ge=0.5), 31)
    k = r["kwh"]
    assert k["production"] == 17 and k["consumption"] == 17 and k["ev"] == 3.5
    assert k["house"] == 13.5 and k["import"] == 4 and k["export"] == 1.5
    assert k["battery_charge"] == 7 and k["battery_discharge"] == 4.5 and k["losses"] == 2.5
    assert r["independence"] == round(14 / 17 * 100, 1) and r["self_consumption"] == round(16 / 17 * 100, 1)
    assert r["start"] == "2026-10-01" and r["end"] == "2026-10-31" and r["label"] == "octombrie 2026"
    assert "Mașina" in r["message"] and "Pierderi" in r["message"]


def test_day_has_no_losses_and_empty_period():
    r = summarize("day", date(2026, 11, 2), vals(Pc=5, Gc=1), 1)
    assert r["label"] == "luni, 2 noiembrie 2026"
    assert "Pierderi" not in r["message"] and "Mașina" not in r["message"]
    empty = summarize("year", date(2024, 5, 1), None, 0)
    assert not empty["has_data"] and empty["message"].startswith("Nu există")


def test_message_fits_notification():
    # the 11 Nov 2026 notification was cut at 256 UTF-16 units ("Azi, după progn")
    nov11 = vals(Pc=3.2, Pb=4.6, Bc=3.5, Gc=28.3, Pe=1.4, Be=1.9, Ge=17.1)
    fc = {"date": date(2026, 11, 12), "t": [5.2, 30.1, 12.0]}
    r = summarize("day", date(2026, 11, 11), nov11, 1, forecast=fc)
    assert units(r["message"]) <= MESSAGE_MAX, (units(r["message"]), r["message"])
    assert "Independență" in r["message"] and "🔋" in r["message"] and r["message"].endswith("(mașina ~12,0)")
    # worst case: every line, widest numbers
    big = vals(Pc=8888, Pb=8888, Pg=8888, Bc=8888, Bg=8888, Gc=8888, Gb=8888, Pe=1, Be=1, Ge=8888)
    for period, days in (("day", 1), ("month", 31), ("year", 365)):
        r = summarize(period, date(2026, 10, 5), big, days, forecast={"date": date(2026, 10, 6), "t": [88.8, 88.8, 88.8]})
        assert units(r["message"]) <= MESSAGE_MAX, (period, units(r["message"]), r["message"])
        assert r["message"].startswith("☀️ Producție") and "🏠 Casa" in r["message"] and "⚡ Import" in r["message"]


def test_history_period():
    h = VrmHistory.__new__(VrmHistory)
    t = vals(Pc=1)
    h.data = {"years": {"2026": {"t": vals(Pc=3), "m": {
        "10": {"t": vals(Pc=2), "d": {"01": {"t": t, "h": {}}, "02": {"t": t, "h": {}}}},
        "11": {"t": t, "d": {"01": {"t": t, "h": {}}}},
    }}}}
    assert h.period("day", date(2026, 10, 2)) == (t, 1)
    assert h.period("day", date(2026, 10, 3)) == (None, 0)
    assert h.period("month", date(2026, 10, 9)) == (vals(Pc=2), 2)
    assert h.period("year", date(2026, 1, 1)) == (vals(Pc=3), 3)
    assert h.period("year", date(2025, 1, 1)) == (None, 0)


def show(cache: Path, today: date):
    h = VrmHistory.__new__(VrmHistory)
    h.data = json.loads(cache.read_text())["data"]
    for period in ("day", "month", "year"):
        day = default_day(period, today)
        r = summarize(period, day, *h.period(period, day))
        print(f"\n## {r['title']}\n{r['message']}")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    if len(sys.argv) > 1:
        show(Path(sys.argv[1]), date.today())
        # a year that has already ended in the cache
        h = VrmHistory.__new__(VrmHistory)
        h.data = json.loads(Path(sys.argv[1]).read_text())["data"]
        r = summarize("year", date(2026, 1, 1), *h.period("year", date(2026, 1, 1)))
        print(f"\n## {r['title']} (până acum)\n{r['message']}")
