"""Coordinator that keeps the recent VRM history fresh."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import VrmAuthError, VrmError
from .const import DOMAIN, UPDATE_INTERVAL
from .forecast import VrmForecast
from .history import VrmHistory

_LOGGER = logging.getLogger(__name__)


class VrmCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Refreshes yesterday + today every 15 minutes, the forecasts every hour."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        history: VrmHistory,
        forecast: VrmForecast,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=UPDATE_INTERVAL,
        )
        self.history = history
        self.forecast = forecast

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            await self.history.async_refresh_recent()
        except VrmAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except VrmError as err:
            raise UpdateFailed(str(err)) from err
        try:
            await self.forecast.async_refresh()
        except VrmError as err:
            # the history is fine without forecasts; the next update tries again
            _LOGGER.warning("Cannot read the VRM forecast: %s", err)
        return {"synced": self.history.synced, "today": self.history.today()}

    async def async_run_backfill(self) -> None:
        """Background task: fill in every month that is not final yet."""
        try:
            await self.history.async_backfill()
        except VrmAuthError:
            self.config_entry.async_start_reauth(self.hass)
        except VrmError as err:
            _LOGGER.warning("VRM history backfill stopped, will retry on next start: %s", err)
        self.async_set_updated_data(
            {"synced": self.history.synced, "today": self.history.today()}
        )
