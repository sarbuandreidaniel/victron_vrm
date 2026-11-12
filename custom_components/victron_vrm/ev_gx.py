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

`EvMeter` copies the meter's hourly energy into the integration's own storage,
`.storage/victron_vrm.<entry_id>.ev_meter`, so the history survives the sensor,
its statistics or the victron_gx integration going away:

    {"hours": {"2026-11-10": {"08": 6.4, "09": 7.2, ...}},   kWh, only hours with energy
     "first": "2026-10-12T22",          first local hour the meter had statistics
     "upto": "2026-11-12T19:00:00+00:00",  end of the last hourly row copied
     "entity": "sensor.evcs_..._total_energy", "entities": [...], "synced": "..."}

Each sync re-reads the statistics from two days before `upto`. An hour is only
written when the recorder has a row for it, so hours whose statistics are gone
keep the stored value.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, tzinfo
import logging
from typing import Any, Iterable

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CODES, DOMAIN, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

# victron_gx: unique id suffix of an EV charger's energy counter
METER_UNIQUE_SUFFIX = "evcharger_total_energy"
# each sync re-reads this much before the last copied hour (late or corrected rows)
RESYNC_OVERLAP = timedelta(days=2)

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


def merge(data: dict[str, Any], rows: Iterable[dict[str, Any]], tz: tzinfo, entity: str) -> int:
    """Copy hourly statistics rows into the stored data; return how many hours changed.

    A row sets its hour (or removes it when the change is below MIN_KWH); hours
    without a row are left as they are.
    """
    hours: dict[str, dict[str, float]] = data.setdefault("hours", {})
    changed = 0
    for row in rows:
        t = _start(row, tz)
        ds, hh = t.date().isoformat(), f"{t.hour:02d}"
        key = f"{ds}T{hh}"
        if not data.get("first") or key < data["first"]:
            data["first"] = key
        end = (t + timedelta(hours=1)).astimezone(dt_util.UTC).isoformat()
        if not data.get("upto") or end > data["upto"]:
            data["upto"] = end
        kwh = round(max(0.0, float(row.get("change") or 0.0)), 3)
        day = hours.get(ds, {})
        if kwh >= MIN_KWH:
            if day.get(hh) != kwh:
                hours.setdefault(ds, day)[hh] = kwh
                changed += 1
        elif hh in day:
            del day[hh]
            changed += 1
            if not day:
                del hours[ds]
    if entity not in data.setdefault("entities", []):
        data["entities"].append(entity)
    data["entity"] = entity
    return changed


class EvMeter:
    """The EV charger meter's hourly energy, kept in the integration's own storage."""

    def __init__(self, hass: HomeAssistant, entry_id: str, start: date) -> None:
        self.hass = hass
        self.start = start
        self.data: dict[str, Any] = {"hours": {}, "first": None, "upto": None, "entity": None, "entities": []}
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}.ev_meter")

    async def async_load(self) -> None:
        if stored := await self._store.async_load():
            self.data = stored

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def entity(self) -> str | None:
        """The charger meter: found by its victron_gx unique id, else the last one used."""
        found = sorted(
            e.entity_id
            for e in er.async_get(self.hass).entities.values()
            if e.platform == "victron_gx" and e.domain == "sensor"
            and str(e.unique_id).endswith(METER_UNIQUE_SUFFIX)
        )
        return found[0] if found else self.data.get("entity")

    def remember(self, entity: str) -> None:
        """Meter named by the card, used when no victron_gx charger is found."""
        if not self.data.get("entity"):
            self.data["entity"] = entity

    def meter_hours(self) -> dict[str, dict[str, float]]:
        return self.data.get("hours", {})

    async def _stats(self, entity: str, since: datetime, until: datetime, period: str) -> list[dict[str, Any]]:
        if "recorder" not in self.hass.config.components or since >= until:
            return []
        from homeassistant.components.recorder import get_instance
        from homeassistant.components.recorder.statistics import statistics_during_period

        rows = await get_instance(self.hass).async_add_executor_job(
            statistics_during_period, self.hass, since, until, {entity}, period, None, {"change"}
        )
        return rows.get(entity, [])

    async def async_sync(self) -> None:
        """Copy the hourly rows since two days before the last copied hour."""
        if not (entity := self.entity()):
            return
        now = dt_util.now()
        upto = dt_util.parse_datetime(self.data["upto"]) if self.data.get("upto") else None
        since = upto - RESYNC_OVERLAP if upto else dt_util.start_of_local_day(self.start)
        rows = await self._stats(entity, since, now, "hour")
        changed = merge(self.data, rows, dt_util.get_default_time_zone(), entity) if rows else 0
        self.data["synced"] = now.isoformat()
        if changed or rows:
            _LOGGER.debug("EV meter %s: %d rows, %d hours changed", entity, len(rows), changed)
        self._store.async_delay_save(lambda: self.data, 5)

    async def async_live(self) -> dict[str, dict[str, float]]:
        """The stored hours plus the hour in progress from the 5-minute statistics."""
        hours = {d: dict(h) for d, h in self.meter_hours().items()}
        entity = self.entity()
        if not entity:
            return hours
        now = dt_util.now()
        since = dt_util.parse_datetime(self.data["upto"]) if self.data.get("upto") else now - timedelta(hours=2)
        since = max(since, now - timedelta(hours=3))
        live, _ = local_hours(await self._stats(entity, since, now, "5minute"), dt_util.get_default_time_zone())
        for ds, day in live.items():
            for hh, kwh in day.items():
                hours.setdefault(ds, {})[hh] = hours.get(ds, {}).get(hh, 0.0) + kwh
        return hours
