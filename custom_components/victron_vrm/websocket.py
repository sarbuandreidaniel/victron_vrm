"""Websocket API used by the dashboard card: history reads plus the financial settings."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .const import CODES, DOMAIN, FINANCE_KEYS, OPT_FINANCE
from .history import VrmHistory

MAX_DAYS = 400


def _entry(hass: HomeAssistant, msg: dict[str, Any]) -> ConfigEntry | None:
    return next(
        (
            e for e in hass.config_entries.async_loaded_entries(DOMAIN)
            if "entry_id" not in msg or e.entry_id == msg["entry_id"]
        ),
        None,
    )


def _history(hass: HomeAssistant, msg: dict[str, Any]) -> VrmHistory | None:
    entry = _entry(hass, msg)
    return entry.runtime_data.history if entry else None


def _parse(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as err:
        raise vol.Invalid(f"Invalid date: {value}") from err


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_info)
    websocket_api.async_register_command(hass, ws_years)
    websocket_api.async_register_command(hass, ws_days)
    websocket_api.async_register_command(hass, ws_hours)
    websocket_api.async_register_command(hass, ws_finance)


def _not_loaded(connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_error(msg["id"], "not_loaded", "Victron VRM is not set up")


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/info", vol.Optional("entry_id"): str}
)
@callback
def ws_info(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Installation name, cache range and sync state."""
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    h: VrmHistory = entry.runtime_data.history
    connection.send_result(msg["id"], {
        "codes": CODES,
        "site": entry.title,
        "start": h.start.isoformat(),
        "synced": h.data.get("synced"),
        "backfilling": h.backfilling,
        "years": sorted(h.data["years"]),
        "finance": entry.options.get(OPT_FINANCE, {}),
    })


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/years", vol.Optional("entry_id"): str}
)
@callback
def ws_years(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Totals per year with the monthly totals of each year."""
    if (h := _history(hass, msg)) is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], {"codes": CODES, "years": h.years_summary()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/days",
        vol.Required("start"): _parse,
        vol.Required("end"): _parse,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_days(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Daily totals between two dates (inclusive)."""
    if (h := _history(hass, msg)) is None:
        return _not_loaded(connection, msg)
    start, end = msg["start"], msg["end"]
    if end < start or (end - start).days > MAX_DAYS:
        connection.send_error(msg["id"], "invalid_range", f"Range must be 0–{MAX_DAYS} days")
        return
    connection.send_result(msg["id"], {"codes": CODES, "days": h.days(start, end)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/hours",
        vol.Required("date"): _parse,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_hours(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Hourly values of one day."""
    if (h := _history(hass, msg)) is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], {"codes": CODES, "hours": h.hours(msg["date"])})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/finance",
        vol.Optional("entry_id"): str,
        **{vol.Required(k): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=0))) for k in FINANCE_KEYS},
    }
)
@websocket_api.require_admin
@callback
def ws_finance(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save the investment and energy prices used by the payback view."""
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    finance = {k: msg[k] for k in FINANCE_KEYS if msg[k] is not None}
    hass.config_entries.async_update_entry(entry, options={**entry.options, OPT_FINANCE: finance})
    connection.send_result(msg["id"], {"finance": finance})
