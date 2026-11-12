"""Victron VRM: caches the installation's energy history and serves it to a dashboard card."""

from __future__ import annotations

from datetime import date, timedelta
import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ACCESS_TOKEN, Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from . import websocket
from .api import VrmApi
from .const import (
    CONF_HISTORY_START,
    CONF_SITE_ID,
    DOMAIN,
    SERVICE_RESYNC,
    SERVICE_SUMMARY,
    STORAGE_VERSION,
)
from .coordinator import VrmCoordinator
from .ev_gx import EvMeter
from .forecast import VrmForecast
from .frontend import async_register_card, async_unregister_card
from .history import VrmHistory
from .summary import PERIODS, default_day, summarize

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type VrmConfigEntry = ConfigEntry[VrmCoordinator]

RESYNC_SCHEMA = vol.Schema(
    {
        vol.Required("start_date"): cv.date,
        vol.Optional("end_date"): cv.date,
    }
)

SUMMARY_SCHEMA = vol.Schema(
    {
        vol.Required("period"): vol.In(PERIODS),
        vol.Optional("date"): cv.date,
        vol.Optional("config_entry_id"): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the websocket API, the card and the services once."""
    websocket.async_register(hass)
    await async_register_card(hass)

    async def resync(call: ServiceCall) -> None:
        start: date = call.data["start_date"]
        end: date = call.data.get("end_date") or dt_util.now().date()
        for entry in hass.config_entries.async_loaded_entries(DOMAIN):
            coordinator: VrmCoordinator = entry.runtime_data
            coordinator.history.forget(start, end)
            entry.async_create_background_task(
                hass, coordinator.async_run_backfill(), f"{DOMAIN}_resync"
            )

    hass.services.async_register(DOMAIN, SERVICE_RESYNC, resync, schema=RESYNC_SCHEMA)

    async def summary(call: ServiceCall) -> ServiceResponse:
        """Totals for a day, month or year; by default the last complete one."""
        entry_id = call.data.get("config_entry_id")
        entry = next(
            (
                e for e in hass.config_entries.async_loaded_entries(DOMAIN)
                if entry_id is None or e.entry_id == entry_id
            ),
            None,
        )
        if entry is None:
            raise ServiceValidationError("Victron VRM is not set up")
        period: str = call.data["period"]
        day: date = call.data.get("date") or default_day(period, dt_util.now().date())
        coordinator: VrmCoordinator = entry.runtime_data
        vals, days = coordinator.history.period(period, day)
        # yesterday's summary is sent in the morning: add today's forecast
        today = dt_util.now().date()
        fc = coordinator.forecast.day(today) if period == "day" and day == today - timedelta(days=1) else None
        return summarize(period, day, vals, days, forecast=fc and {"date": today, "t": fc["t"]})

    hass.services.async_register(
        DOMAIN,
        SERVICE_SUMMARY,
        summary,
        schema=SUMMARY_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: VrmConfigEntry) -> bool:
    """Load the cache, refresh today, then backfill missing months in the background."""
    api = VrmApi(async_get_clientsession(hass), entry.data[CONF_ACCESS_TOKEN])
    history = VrmHistory(
        hass,
        entry.entry_id,
        api,
        int(entry.data[CONF_SITE_ID]),
        date.fromisoformat(entry.data[CONF_HISTORY_START]),
    )
    await history.async_load()
    forecast = VrmForecast(hass, entry.entry_id, api, int(entry.data[CONF_SITE_ID]))
    await forecast.async_load()
    ev_meter = EvMeter(hass, entry.entry_id, history.start)
    await ev_meter.async_load()

    coordinator = VrmCoordinator(hass, entry, history, forecast, ev_meter)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_create_background_task(
        hass, coordinator.async_run_backfill(), f"{DOMAIN}_backfill"
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: VrmConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: VrmConfigEntry) -> None:
    """Delete the cached history, forecasts and EV meter copy together with the entry."""
    for suffix in ("", ".forecast", ".ev_meter"):
        await Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}{suffix}").async_remove()
    if not hass.config_entries.async_entries(DOMAIN):
        await async_unregister_card(hass)
