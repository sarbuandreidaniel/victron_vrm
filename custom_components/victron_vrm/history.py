"""Local cache of VRM energy history: years → months → days → hours.

Layout of the stored data (all values are kWh lists in CODES order):

    {"years": {"2026": {"t": [...], "m": {"03": {"t": [...], "d": {"14": {
        "t": [...], "h": {"00": [...], ..., "23": [...]}}}}}}},
     "done": ["2025-10", ...],   # months fetched after they ended, never re-fetched
     "synced": "2026-11-02T10:15:00+00:00"}
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Iterator
from datetime import date, datetime, time, timedelta, tzinfo
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .api import VrmApi
from .const import BACKFILL_PAUSE, CODES, DOMAIN, FINALIZE_DELAY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

N = len(CODES)


def _zero() -> list[float]:
    return [0.0] * N


def _add(acc: list[float], vals: list[float]) -> None:
    for i, v in enumerate(vals):
        acc[i] += v


def _round(vals: list[float]) -> list[float]:
    return [round(v, 4) for v in vals]


def bucket_hours(
    records: dict[str, list[list[float]]], tz: tzinfo
) -> dict[date, dict[int, list[float]]]:
    """Group VRM [timestamp_ms, kwh] points by local day and hour."""
    out: dict[date, dict[int, list[float]]] = defaultdict(lambda: defaultdict(_zero))
    for idx, code in enumerate(CODES):
        for point in records.get(code) or []:
            if not isinstance(point, (list, tuple)) or len(point) < 2 or point[1] is None:
                continue
            local = datetime.fromtimestamp(point[0] / 1000, tz)
            # On the autumn DST change the repeated hour lands in the same bucket.
            out[local.date()][local.hour][idx] += float(point[1])
    return out


def month_keys(first: date, last: date) -> Iterator[tuple[int, int]]:
    """Yield (year, month) from the month of `first` to the month of `last`."""
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """First day of the month and first day of the next month."""
    nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return date(year, month, 1), nxt


def apply_window(
    years: dict[str, Any], start: date, end: date, buckets: dict[date, dict[int, list[float]]]
) -> None:
    """Replace every day in [start, end) with the fetched hours, then re-total."""
    touched: set[tuple[str, str]] = set()
    day = start
    while day < end:
        ys, ms, ds = str(day.year), f"{day.month:02d}", f"{day.day:02d}"
        hours = buckets.get(day) or {}
        total = _zero()
        for vals in hours.values():
            _add(total, vals)
        months = years.setdefault(ys, {"t": _zero(), "m": {}})["m"]
        days = months.setdefault(ms, {"t": _zero(), "d": {}})["d"]
        if any(v > 0 for v in total):
            days[ds] = {
                "t": _round(total),
                "h": {f"{h:02d}": _round(v) for h, v in sorted(hours.items())},
            }
        else:
            days.pop(ds, None)
        touched.add((ys, ms))
        day += timedelta(days=1)
    for ys, ms in touched:
        _retotal(years, ys, ms)


def _retotal(years: dict[str, Any], ys: str, ms: str) -> None:
    year = years[ys]
    month = year["m"][ms]
    if month["d"]:
        t = _zero()
        for d in month["d"].values():
            _add(t, d["t"])
        month["t"] = _round(t)
    else:
        del year["m"][ms]
    if year["m"]:
        t = _zero()
        for m in year["m"].values():
            _add(t, m["t"])
        year["t"] = _round(t)
    else:
        del years[ys]


class VrmHistory:
    """Owns the cached history for one VRM installation."""

    def __init__(
        self, hass: HomeAssistant, entry_id: str, api: VrmApi, site_id: int, start: date
    ) -> None:
        self.hass = hass
        self.api = api
        self.site_id = site_id
        self.start = start
        self.lock = asyncio.Lock()
        self.data: dict[str, Any] = {"years": {}, "done": [], "synced": None, "codes": list(CODES)}
        self.backfilling = False
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored:
            self.data = stored
            if self.data.get("codes", list(CODES[:7])) != list(CODES):
                self._widen()

    def _widen(self) -> None:
        """Pad every stored bucket to the current CODES and re-fetch all months.

        Caches written before new flow codes were added keep their values; the
        new codes start at zero until the backfill fetches them.
        """
        def pad(vals: list[float]) -> list[float]:
            return vals + [0.0] * (N - len(vals))

        for year in self.data["years"].values():
            year["t"] = pad(year["t"])
            for month in year["m"].values():
                month["t"] = pad(month["t"])
                for day in month["d"].values():
                    day["t"] = pad(day["t"])
                    day["h"] = {h: pad(v) for h, v in day["h"].items()}
        self.data["codes"] = list(CODES)
        self.data["done"] = []
        self._save()

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 5)

    async def async_remove(self) -> None:
        await self._store.async_remove()

    @property
    def synced(self) -> datetime | None:
        return dt_util.parse_datetime(self.data["synced"]) if self.data.get("synced") else None

    async def async_fetch(self, start: date, end: date) -> None:
        """Fetch [start, end) from VRM and replace those days in the cache."""
        tz = dt_util.get_default_time_zone()
        t0 = datetime.combine(start, time(), tz)
        t1 = datetime.combine(end, time(), tz)
        records = await self.api.async_get_energy_hours(
            self.site_id, int(t0.timestamp()), int(t1.timestamp())
        )
        buckets = bucket_hours(records, tz)
        async with self.lock:
            apply_window(self.data["years"], start, end, buckets)
            self.data["synced"] = dt_util.utcnow().isoformat()
            self._save()

    def _ended(self, year: int, month: int) -> bool:
        _, nxt = month_bounds(year, month)
        tz = dt_util.get_default_time_zone()
        return datetime.combine(nxt, time(), tz) + FINALIZE_DELAY < dt_util.now()

    async def _async_fetch_month(self, year: int, month: int) -> None:
        first, nxt = month_bounds(year, month)
        await self.async_fetch(max(first, self.start), nxt)
        key = f"{year}-{month:02d}"
        if self._ended(year, month) and key not in self.data["done"]:
            self.data["done"].append(key)
            self._save()

    async def async_refresh_recent(self) -> None:
        """Yesterday and today, plus any month that just became final."""
        today = dt_util.now().date()
        await self.async_fetch(today - timedelta(days=1), today + timedelta(days=1))
        if self.backfilling:
            return
        for y, m in month_keys(self.start, today):
            if f"{y}-{m:02d}" not in self.data["done"] and self._ended(y, m):
                await self._async_fetch_month(y, m)

    async def async_backfill(self, current_too: bool = True) -> None:
        """Fetch every month not yet final, oldest first, one request per month."""
        if self.backfilling:
            return
        self.backfilling = True
        try:
            today = dt_util.now().date()
            for y, m in month_keys(self.start, today):
                key = f"{y}-{m:02d}"
                if key in self.data["done"]:
                    continue
                if not current_too and not self._ended(y, m):
                    continue
                _LOGGER.debug("VRM backfill %s", key)
                await self._async_fetch_month(y, m)
                await asyncio.sleep(BACKFILL_PAUSE)
        finally:
            self.backfilling = False

    def forget(self, start: date, end: date) -> None:
        """Mark months overlapping [start, end] as not final so they are re-fetched."""
        keep = {f"{y}-{m:02d}" for y, m in month_keys(start, end)}
        self.data["done"] = [k for k in self.data["done"] if k not in keep]
        self._save()

    # ── queries used by the websocket API ────────────────────────────────

    def years_summary(self) -> dict[str, Any]:
        return {
            ys: {
                "t": y["t"],
                "m": {ms: m["t"] for ms, m in sorted(y["m"].items())},
                # days with data per month, for per-day / average-power figures
                "n": {ms: len(m["d"]) for ms, m in sorted(y["m"].items())},
            }
            for ys, y in sorted(self.data["years"].items())
        }

    def _day(self, day: date) -> dict[str, Any] | None:
        return (
            self.data["years"].get(str(day.year), {}).get("m", {})
            .get(f"{day.month:02d}", {}).get("d", {}).get(f"{day.day:02d}")
        )

    def days(self, start: date, end: date) -> dict[str, list[float]]:
        out: dict[str, list[float]] = {}
        day = start
        while day <= end:
            if (d := self._day(day)) is not None:
                out[day.isoformat()] = d["t"]
            day += timedelta(days=1)
        return out

    def hours(self, day: date) -> dict[str, list[float]]:
        d = self._day(day)
        return dict(d["h"]) if d else {}

    def period(self, period: str, day: date) -> tuple[list[float] | None, int]:
        """Totals and number of days with data for the day / month / year of `day`."""
        if period == "day":
            d = self._day(day)
            return (d["t"], 1) if d else (None, 0)
        year = self.data["years"].get(str(day.year))
        if not year:
            return None, 0
        if period == "month":
            month = year["m"].get(f"{day.month:02d}")
            return (month["t"], len(month["d"])) if month else (None, 0)
        return year["t"], sum(len(m["d"]) for m in year["m"].values())

    def today(self) -> list[float]:
        d = self._day(dt_util.now().date())
        return d["t"] if d else _zero()
