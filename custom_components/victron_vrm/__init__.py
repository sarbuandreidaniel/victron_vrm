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
    SERVICE_SOLAR_WINDOW,
    SERVICE_SUMMARY,
    SOLAR_WINDOW_USEFUL,
    STORAGE_VERSION,
)
from .coordinator import VrmCoordinator
from .ev_gx import EvMeter
from .forecast import VrmForecast
from .frontend import async_register_card, async_unregister_card
from .history import VrmHistory
from .odometer import Odometer
from .summary import MONTHS, PERIODS, WEEKDAYS, _num, default_day, summarize

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

SOLAR_WINDOW_SCHEMA = vol.Schema(
    {
        vol.Optional("date"): cv.date,
        vol.Optional("config_entry_id"): cv.string,
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

    def loaded_entry(call: ServiceCall) -> VrmConfigEntry:
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
        return entry

    async def summary(call: ServiceCall) -> ServiceResponse:
        """Totals for a day, week, month or year; by default the last complete one."""
        entry = loaded_entry(call)
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

    async def solar_window(call: ServiceCall) -> ServiceResponse:
        """The sunniest run of hours of a day (default tomorrow): forecast solar above the house's use."""
        coordinator: VrmCoordinator = loaded_entry(call).runtime_data
        today = dt_util.now().date()
        day: date = call.data.get("date") or today + timedelta(days=1)
        win = coordinator.forecast.solar_window(day)
        when = "Mâine" if day == today + timedelta(days=1) else "Azi" if day == today else f"{WEEKDAYS[day.weekday()].capitalize()}, {day.day} {MONTHS[day.month - 1]}"
        out: dict = {"date": day.isoformat(), "window": win, "useful": bool(win and win["surplus_kwh"] >= SOLAR_WINDOW_USEFUL)}
        out["title"] = "Soare pentru mașină"
        out["message"] = (
            f"☀️ {when} între {win['start']:02d}:00 și {win['end']:02d}:00: ~{_num(win['surplus_kwh'], 0)} kWh soare "
            "peste consumul casei, după prognoza VRM. Un moment bun pentru încărcarea mașinii (bateria ia și ea din surplus)."
            if win else f"☀️ {when}: prognoza VRM nu are ore cu soare peste consumul casei."
        )
        return out

    hass.services.async_register(
        DOMAIN,
        SERVICE_SOLAR_WINDOW,
        solar_window,
        schema=SOLAR_WINDOW_SCHEMA,
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
    odometer = Odometer(hass, entry.entry_id)
    await odometer.async_load()

    coordinator = VrmCoordinator(hass, entry, history, forecast, ev_meter, odometer)
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
    """Delete the cached history, forecasts, EV meter and odometer copies together with the entry."""
    for suffix in ("", ".forecast", ".ev_meter", ".odometer"):
        await Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}{suffix}").async_remove()
    if not hass.config_entries.async_entries(DOMAIN):
        await async_unregister_card(hass)
