"""Victron VRM: caches the installation's energy history and serves it to a dashboard card."""

from __future__ import annotations

from datetime import date
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ACCESS_TOKEN, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from . import websocket
from .api import VrmApi
from .const import (
    CARD_FILE,
    CARD_URL,
    CONF_HISTORY_START,
    CONF_SITE_ID,
    DOMAIN,
    SERVICE_RESYNC,
    STORAGE_VERSION,
)
from .coordinator import VrmCoordinator
from .history import VrmHistory

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


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the websocket API, the card and the resync service once."""
    websocket.async_register(hass)

    if hass.http is not None:
        integration = await async_get_integration(hass, DOMAIN)
        await hass.http.async_register_static_paths(
            [StaticPathConfig(CARD_URL, str(Path(__file__).parent / CARD_FILE), True)]
        )
        add_extra_js_url(hass, f"{CARD_URL}?v={integration.version}")

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

    coordinator = VrmCoordinator(hass, entry, history)
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
    """Delete the cached history together with the entry."""
    await Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}").async_remove()
