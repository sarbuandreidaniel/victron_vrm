"""The car's odometer, one value per local day, kept in the integration's own storage.

victron_gx reports the odometer of the car on the EV charger as a plain sensor with no
state class, so Home Assistant keeps no long-term statistics for it and the recorder's
state history is purged after a few days. The coordinator copies the latest reading of
each day here (`.storage/victron_vrm.<entry_id>.odometer`: `{"days": {YYYY-MM-DD: km},
"entity": ...}`); the Mașina view divides the km between two days by the energy the car
received in between. On the first run the recorder's state history seeds the past days.
"""

from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

# victron_gx unique ids end like "<gx>_ev_40_ev_odometer"
ODOMETER_UNIQUE_SUFFIX = "_ev_odometer"
SEED_DAYS = 30


def add_reading(days: dict[str, float], day: date, km: float) -> bool:
    """Keep the highest reading of the day (an odometer only goes up). True when it changed."""
    key = day.isoformat()
    if km <= 0 or days.get(key, 0) >= km:
        return False
    days[key] = round(km, 1)
    return True


class Odometer:
    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self.hass = hass
        self.data: dict[str, Any] = {"days": {}, "entity": None}
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}.odometer")

    async def async_load(self) -> None:
        if stored := await self._store.async_load():
            self.data = stored

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def entity(self) -> str | None:
        found = sorted(
            e.entity_id
            for e in er.async_get(self.hass).entities.values()
            if e.platform == "victron_gx" and e.domain == "sensor"
            and str(e.unique_id).endswith(ODOMETER_UNIQUE_SUFFIX)
        )
        return found[0] if found else self.data.get("entity")

    def days(self, start: date, end: date) -> dict[str, float]:
        lo, hi = start.isoformat(), end.isoformat()
        return {k: v for k, v in sorted(self.data["days"].items()) if lo <= k <= hi}

    async def _seed(self, entity: str) -> int:
        """Past days from the recorder's state history (only what it still keeps)."""
        if "recorder" not in self.hass.config.components:
            return 0
        from homeassistant.components.recorder import get_instance
        from homeassistant.components.recorder.history import state_changes_during_period

        now = dt_util.now()
        states = await get_instance(self.hass).async_add_executor_job(
            state_changes_during_period, self.hass, now - timedelta(days=SEED_DAYS), now, entity
        )
        n = 0
        for st in states.get(entity, []):
            try:
                km = float(st.state)
            except (TypeError, ValueError):
                continue
            n += add_reading(self.data["days"], dt_util.as_local(st.last_updated).date(), km)
        return n

    async def async_sync(self) -> None:
        if not (entity := self.entity()):
            return
        changed = False
        if not self.data["days"] or self.data.get("entity") != entity:
            changed = bool(await self._seed(entity))
            self.data["entity"] = entity
        st = self.hass.states.get(entity)
        try:
            km = float(st.state) if st else 0.0
        except (TypeError, ValueError):
            km = 0.0
        changed |= add_reading(self.data["days"], dt_util.now().date(), km)
        if changed:
            _LOGGER.debug("Odometer %s: %s km", entity, km)
            self._store.async_delay_save(lambda: self.data, 5)
