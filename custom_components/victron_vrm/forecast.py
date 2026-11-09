"""VRM's own forecasts (solar yield, consumption, EV charger), cached per local day and hour.

Stored in `.storage/victron_vrm.<entry_id>.forecast`:

    {"days": {"2026-11-10": {"t": [solar, consumption, ev],
                             "h": {"00": [...], ..., "23": [...]}}},
     "fetched": "2026-11-09T20:00:00+00:00"}

Values are kWh. VRM keeps the forecasts of past days, so the cache also holds
the last KEEP_DAYS days for comparing forecast and actual production.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, tzinfo
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .api import VrmApi
from .const import (
    CODES,
    DOMAIN,
    FORECAST_AHEAD_DAYS,
    FORECAST_INTERVAL,
    FORECAST_KEEP_DAYS,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

# VRM series → position in every stored list
FC_SERIES = ("solar_yield_forecast", "vrm_consumption_fc", "vrm_consum_evcs_fc")
FC_KEYS = ("solar", "consumption", "ev")
M = len(FC_KEYS)
# Days that need at least this much forecast solar to count in the accuracy ratio
MIN_ACCURACY_KWH = 0.5


def _zero() -> list[float]:
    return [0.0] * M


def bucket_forecast(
    records: dict[str, list[list[float]]], tz: tzinfo
) -> dict[date, dict[int, list[float]]]:
    """Group VRM [timestamp_ms, Wh] forecast points by local day and hour, in kWh."""
    out: dict[date, dict[int, list[float]]] = defaultdict(lambda: defaultdict(_zero))
    for idx, series in enumerate(FC_SERIES):
        for point in records.get(series) or []:
            if not isinstance(point, (list, tuple)) or len(point) < 2 or point[1] is None:
                continue
            local = datetime.fromtimestamp(point[0] / 1000, tz)
            out[local.date()][local.hour][idx] += max(0.0, float(point[1])) / 1000
    return out


def apply_forecast(days: dict[str, Any], buckets: dict[date, dict[int, list[float]]]) -> None:
    """Replace every day VRM returned with its new hours."""
    for day, hours in buckets.items():
        total = _zero()
        for vals in hours.values():
            for i, v in enumerate(vals):
                total[i] += v
        days[day.isoformat()] = {
            "t": [round(v, 3) for v in total],
            "h": {f"{h:02d}": [round(v, 3) for v in vals] for h, vals in sorted(hours.items())},
        }


def remaining(day: dict[str, Any] | None, now: datetime, idx: int = 0) -> float | None:
    """Forecast still to come from `now` to the end of that day (the current hour pro rata)."""
    if not day:
        return None
    left = 0.0
    for hh, vals in day["h"].items():
        h = int(hh)
        if h > now.hour:
            left += vals[idx]
        elif h == now.hour:
            left += vals[idx] * (1 - now.minute / 60)
    return left


def accuracy(
    forecast_days: dict[str, Any], actual: dict[str, list[float]]
) -> tuple[float | None, int]:
    """Actual production ÷ forecast solar over the days that have both.

    `actual` maps ISO dates to CODES-ordered totals (history `days()`).
    Returns the ratio and the number of days used.
    """
    i_pc, i_pb, i_pg = CODES.index("Pc"), CODES.index("Pb"), CODES.index("Pg")
    fc = act = 0.0
    n = 0
    for key, vals in actual.items():
        f = forecast_days.get(key)
        if not f or f["t"][0] < MIN_ACCURACY_KWH:
            continue
        fc += f["t"][0]
        act += vals[i_pc] + vals[i_pb] + vals[i_pg]
        n += 1
    return (act / fc if fc > 0 else None), n


class VrmForecast:
    """Owns the cached forecasts for one VRM installation."""

    def __init__(self, hass: HomeAssistant, entry_id: str, api: VrmApi, site_id: int) -> None:
        self.hass = hass
        self.api = api
        self.site_id = site_id
        self.data: dict[str, Any] = {"days": {}, "fetched": None}
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}.forecast"
        )

    async def async_load(self) -> None:
        if stored := await self._store.async_load():
            self.data = stored

    async def async_remove(self) -> None:
        await self._store.async_remove()

    @property
    def fetched(self) -> datetime | None:
        return dt_util.parse_datetime(self.data["fetched"]) if self.data.get("fetched") else None

    async def async_refresh(self, force: bool = False) -> bool:
        """Fetch the forecasts at most once per FORECAST_INTERVAL; True when fetched.

        The first fetch (empty cache) also takes the past KEEP_DAYS days; later
        ones re-read yesterday and today and the days ahead.
        """
        now = dt_util.now()
        if not force and (f := self.fetched) and now - f < FORECAST_INTERVAL:
            return False
        today = now.date()
        oldest = today - timedelta(days=FORECAST_KEEP_DAYS)
        have_old = any(k < (today - timedelta(days=2)).isoformat() for k in self.data["days"])
        start = today - timedelta(days=1) if have_old else oldest
        end = today + timedelta(days=FORECAST_AHEAD_DAYS)
        tz = dt_util.get_default_time_zone()
        records = await self.api.async_get_forecast_hours(
            self.site_id,
            int(datetime.combine(start, time(), tz).timestamp()),
            int(datetime.combine(end, time(), tz).timestamp()),
        )
        apply_forecast(self.data["days"], bucket_forecast(records, tz))
        cut = oldest.isoformat()
        self.data["days"] = {k: v for k, v in sorted(self.data["days"].items()) if k >= cut}
        self.data["fetched"] = dt_util.utcnow().isoformat()
        self._store.async_delay_save(lambda: self.data, 5)
        return True

    # ── queries ──────────────────────────────────────────────────────────

    def day(self, day: date) -> dict[str, Any] | None:
        return self.data["days"].get(day.isoformat())

    def total(self, day: date, key: str) -> float | None:
        d = self.day(day)
        return d["t"][FC_KEYS.index(key)] if d else None

    def hours(self, day: date, key: str) -> dict[str, float]:
        d = self.day(day)
        i = FC_KEYS.index(key)
        return {hh: round(v[i], 3) for hh, v in d["h"].items()} if d else {}

    def days(self, start: date, end: date) -> dict[str, Any]:
        lo, hi = start.isoformat(), end.isoformat()
        return {k: v for k, v in self.data["days"].items() if lo <= k <= hi}
