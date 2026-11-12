"""Offline tests for the EV energy from the charger's meter (ev_gx.py).

Run with the repo's HA virtualenv:
    .venv_ha/bin/python integrations/victron_vrm/scripts/test_ev_gx.py
"""

from datetime import date, datetime
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.ev_gx import local_hours, split  # noqa: E402

TZ = ZoneInfo("Europe/Bucharest")


def ts(y, mo, d, h):
    return datetime(y, mo, d, h, tzinfo=TZ).timestamp()


def vals(**kw):
    v = [0.0] * len(CODES)
    for k, x in kw.items():
        v[CODES.index(k)] = x
    return v


def test_local_hours():
    rows = [
        {"start": ts(2026, 10, 12, 22), "change": 0.0},
        {"start": ts(2026, 10, 13, 2), "change": 0.351},
        {"start": ts(2026, 10, 13, 3), "change": -5.0},  # meter reset: never negative
        {"start": ts(2026, 10, 13, 4) * 1000, "change": 1.0},  # milliseconds also accepted
    ]
    meter, first = local_hours(rows, TZ)
    assert first == "2026-10-12T22", first
    assert meter == {"2026-10-13": {"02": 0.351, "04": 1.0}}, meter

    # DST fall-back: 03:00 local happens twice, both go into hour "03"
    a = datetime(2026, 10, 25, 0, 0, tzinfo=ZoneInfo("UTC")).timestamp()  # 03:00 EEST
    b = datetime(2026, 10, 25, 1, 0, tzinfo=ZoneInfo("UTC")).timestamp()  # 03:00 EET
    meter, _ = local_hours([{"start": a, "change": 1.0}, {"start": b, "change": 2.0}], TZ)
    assert meter == {"2026-10-25": {"03": 3.0}}, meter


def test_split():
    vrm = {
        # before the meter: VRM's own EV flows are kept
        date(2026, 10, 12): {"20": vals(Gc=8, Ge=7.5), "21": vals(Pc=1)},
        # after: the meter's energy split like the hour's consumption
        date(2026, 10, 13): {
            "02": vals(Pc=0.5, Bc=1.0, Gc=0.5, Pe=9, Be=9, Ge=9),  # VRM EV values ignored
            "05": vals(Gc=1.0),
        },
    }
    meter = {"2026-10-12": {"20": 99.0}, "2026-10-13": {"02": 1.0, "03": 0.4}}
    out = split(vrm.get, date(2026, 10, 12), date(2026, 10, 14), meter, "2026-10-12T22")
    h = out["hours"]
    assert h["2026-10-12"] == {"20": [0.0, 0.0, 7.5]}, h
    assert h["2026-10-13"]["02"] == [0.25, 0.5, 0.25], h
    # hour 03 is not synced from VRM yet: booked on the grid and reported as pending
    assert h["2026-10-13"]["03"] == [0.0, 0.0, 0.4] and out["pending"] == 0.4, out
    assert "05" not in h["2026-10-13"] and "2026-10-14" not in h
    assert out["first"] == "2026-10-12T22"

    # no statistics at all: only VRM
    out = split(vrm.get, date(2026, 10, 12), date(2026, 10, 13), {}, None)
    assert out["hours"]["2026-10-12"] == {"20": [0.0, 0.0, 7.5]}
    assert out["hours"]["2026-10-13"] == {"02": [9, 9, 9]}


if __name__ == "__main__":
    test_local_hours()
    test_split()
    print("ok")
