"""EV charger energy from the charger's own meter, split by source with VRM's hourly flows.

The charger's energy counter (`sensor.<charger>_total_energy` from the `victron_gx`
integration, `state_class: total_increasing`) has long-term statistics in Home
Assistant. Each hour's `change` is the energy delivered to the car in that hour.
The charger sits on the AC output, so that energy is part of the house
consumption VRM reports as Pc + Bc + Gc; it is split between solar, battery and
grid in the same proportions as the whole consumption of that hour.

Hours before the first statistics row keep VRM's own EV flows (Pe, Be, Ge) from
the cache, so the history from before the meter was recorded is not lost. An
hour VRM has not synced yet (no consumption in the cache) is booked on the grid
until the next sync and counted in `pending`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, tzinfo
from typing import Any, Iterable

from .const import CODES

# Below this an hour's change is meter noise.
MIN_KWH = 0.001

_PC, _BC, _GC = (CODES.index(c) for c in ("Pc", "Bc", "Gc"))
_EV = [CODES.index(c) for c in ("Pe", "Be", "Ge")]


def _start(row: dict[str, Any], tz: tzinfo) -> datetime:
    s = row["start"]
    if isinstance(s, datetime):
        return s.astimezone(tz)
    # recorder rows carry the start as a UTC timestamp (seconds; milliseconds over websocket)
    s = float(s)
    if s > 1e11:
        s /= 1000
    return datetime.fromtimestamp(s, tz)


def local_hours(rows: Iterable[dict[str, Any]], tz: tzinfo) -> tuple[dict[str, dict[str, float]], str | None]:
    """Statistics rows → kWh per local day and hour, plus the first row's local hour ("YYYY-MM-DDTHH").

    The two hours of a DST fall-back day that share a local hour are added together,
    as `history.bucket_hours` does for VRM.
    """
    out: dict[str, dict[str, float]] = {}
    first: str | None = None
    for row in rows:
        t = _start(row, tz)
        key = f"{t.date().isoformat()}T{t.hour:02d}"
        if first is None or key < first:
            first = key
        kwh = max(0.0, float(row.get("change") or 0.0))
        if kwh < MIN_KWH:
            continue
        day = out.setdefault(t.date().isoformat(), {})
        day[f"{t.hour:02d}"] = day.get(f"{t.hour:02d}", 0.0) + kwh
    return out, first


def split(
    day_hours: Any,
    start: date,
    end: date,
    meter: dict[str, dict[str, float]],
    first: str | None,
) -> dict[str, Any]:
    """[Pe, Be, Ge] per day and hour between two dates (inclusive), like `VrmHistory.ev_hours`.

    `day_hours(day)` returns the cached VRM hours of a day ({"HH": values in CODES order})
    or None. Hours before `first` come from VRM; from `first` on, from `meter`.
    """
    hours: dict[str, dict[str, list[float]]] = {}
    pending = 0.0
    day = start
    while day <= end:
        ds = day.isoformat()
        vrm = day_hours(day) or {}
        out: dict[str, list[float]] = {}
        for hh in sorted(set(vrm) | set(meter.get(ds, {}))):
            v = vrm.get(hh)
            if first is None or f"{ds}T{hh}" < first:
                if v and any(v[i] > 0 for i in _EV):
                    out[hh] = [round(v[i], 3) for i in _EV]
                continue
            e = meter.get(ds, {}).get(hh, 0.0)
            if e < MIN_KWH:
                continue
            c = (v[_PC] + v[_BC] + v[_GC]) if v else 0.0
            if c > 0:
                out[hh] = [round(e * v[_PC] / c, 3), round(e * v[_BC] / c, 3), round(e * v[_GC] / c, 3)]
            else:
                out[hh] = [0.0, 0.0, round(e, 3)]
                pending += e
        if out:
            hours[ds] = out
        day += timedelta(days=1)
    return {"hours": hours, "first": first, "pending": round(pending, 3)}
