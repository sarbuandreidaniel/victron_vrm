"""Offline tests for the history aggregation (no VRM token needed).

Run with the repo's HA virtualenv:
    .venv_ha/bin/python integrations/victron_vrm/scripts/test_history.py
"""

from datetime import date, datetime
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.history import apply_window, bucket_hours, month_keys  # noqa: E402

TZ = ZoneInfo("Europe/Bucharest")


def ms(y, mo, d, h, tz=TZ):
    return int(datetime(y, mo, d, h, tzinfo=tz).timestamp() * 1000)


def test_bucket_and_window():
    records = {c: [] for c in CODES}
    # 2026-03-14: 2 kWh solar→house at 12:00, 1 kWh grid→house at 20:00
    records["Pc"] = [[ms(2026, 3, 14, 12), 2.0]]
    records["Gc"] = [[ms(2026, 3, 14, 20), 1.0], [ms(2026, 3, 15, 0), 0.5]]
    b = bucket_hours(records, TZ)
    assert b[date(2026, 3, 14)][12][CODES.index("Pc")] == 2.0
    assert b[date(2026, 3, 15)][0][CODES.index("Gc")] == 0.5

    years: dict = {}
    apply_window(years, date(2026, 3, 14), date(2026, 3, 16), b)
    day = years["2026"]["m"]["03"]["d"]["14"]
    assert day["t"][CODES.index("Pc")] == 2.0 and day["t"][CODES.index("Gc")] == 1.0
    assert set(day["h"]) == {"12", "20"}
    assert years["2026"]["m"]["03"]["t"][CODES.index("Gc")] == 1.5
    assert years["2026"]["t"] == years["2026"]["m"]["03"]["t"]

    # Re-fetching a window replaces (not adds) and drops days that are now empty.
    records["Pc"] = [[ms(2026, 3, 14, 12), 3.0]]
    records["Gc"] = []
    apply_window(years, date(2026, 3, 14), date(2026, 3, 16), bucket_hours(records, TZ))
    assert years["2026"]["m"]["03"]["d"]["14"]["t"][CODES.index("Pc")] == 3.0
    assert "15" not in years["2026"]["m"]["03"]["d"]
    assert years["2026"]["t"][CODES.index("Pc")] == 3.0

    # A window with no data at all removes the month and the year.
    apply_window(years, date(2026, 3, 1), date(2026, 4, 1), {})
    assert years == {}


def test_dst():
    # 2026-10-25: clocks go back at 04:00 local, so 03:xx happens twice.
    first = int(datetime(2026, 10, 25, 0, 30, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)  # 03:30 EEST
    second = first + 3600_000  # 03:30 EET
    records = {c: [] for c in CODES}
    records["Gc"] = [[first, 0.4], [second, 0.6]]
    b = bucket_hours(records, TZ)
    assert abs(b[date(2026, 10, 25)][3][CODES.index("Gc")] - 1.0) < 1e-9


def test_month_keys():
    assert list(month_keys(date(2025, 11, 20), date(2026, 2, 1))) == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
