"""Websocket API used by the dashboard card: history reads plus the financial settings."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .const import CODES, DOMAIN, EV_CODES, FINANCE_KEYS, OPT_FINANCE
from .history import VrmHistory

MAX_DAYS = 400
# EV hours are sparse, so the whole history fits in one answer.
MAX_EV_DAYS = 3700


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
    websocket_api.async_register_command(hass, ws_ev)
    websocket_api.async_register_command(hass, ws_flows)
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
        vol.Required("type"): f"{DOMAIN}/ev",
        vol.Required("start"): _parse,
        vol.Required("end"): _parse,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_ev(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Hours with energy to the EV charger between two dates (inclusive), for the charger view."""
    if (h := _history(hass, msg)) is None:
        return _not_loaded(connection, msg)
    start, end = msg["start"], msg["end"]
    if end < start or (end - start).days > MAX_EV_DAYS:
        connection.send_error(msg["id"], "invalid_range", f"Range must be 0–{MAX_EV_DAYS} days")
        return
    connection.send_result(msg["id"], {"codes": EV_CODES, "hours": h.ev_hours(start, end)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/flows",
        vol.Required("start"): _parse,
        vol.Required("end"): _parse,
        vol.Required("codes"): vol.All([vol.In(CODES)], vol.Length(min=1), vol.Unique()),
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_flows(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Hours where any of the requested flows is non-zero, between two dates (inclusive)."""
    if (h := _history(hass, msg)) is None:
        return _not_loaded(connection, msg)
    start, end = msg["start"], msg["end"]
    if end < start or (end - start).days > MAX_DAYS:
        connection.send_error(msg["id"], "invalid_range", f"Range must be 0–{MAX_DAYS} days")
        return
    codes = msg["codes"]
    connection.send_result(msg["id"], {"codes": codes, "hours": h.flow_hours(start, end, codes)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/finance",
        vol.Optional("entry_id"): str,
        **{vol.Required(k): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=0))) for k in FINANCE_KEYS},
        # price periods: each applies from month `from` (the first, with `from` null, from the start)
        vol.Optional("prices"): vol.All(
            [
                {
                    vol.Required("from"): vol.Any(None, vol.Match(r"^\d{4}-(0[1-9]|1[0-2])$")),
                    vol.Required("import"): vol.All(vol.Coerce(float), vol.Range(min=0)),
                    vol.Required("export"): vol.All(vol.Coerce(float), vol.Range(min=0)),
                }
            ],
            vol.Length(min=1),
        ),
    }
)
@websocket_api.require_admin
@callback
def ws_finance(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save the investment and energy prices used by the payback view."""
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    finance: dict[str, Any] = {k: msg[k] for k in FINANCE_KEYS if msg[k] is not None}
    if prices := msg.get("prices"):
        prices = sorted(prices, key=lambda p: p["from"] or "")
        froms = [p["from"] or "" for p in prices]
        if len(set(froms)) != len(froms):
            connection.send_error(msg["id"], "invalid_format", "Două prețuri încep în aceeași lună")
            return
        prices[0] = {**prices[0], "from": None}
        finance["prices"] = prices
        # the current price, for readers of the two plain fields
        finance["price_import"] = prices[-1]["import"]
        finance["price_export"] = prices[-1]["export"]
    hass.config_entries.async_update_entry(entry, options={**entry.options, OPT_FINANCE: finance})
    connection.send_result(msg["id"], {"finance": finance})
