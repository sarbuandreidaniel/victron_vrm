"""Websocket API used by the dashboard card: history reads plus the financial settings."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from . import ev_gx
from .const import CODES, DOMAIN, EV_CODES, FINANCE_KEYS, OPT_FINANCE, OPT_PANEL, PANEL_COLORS
from .forecast import FC_KEYS
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
    websocket_api.async_register_command(hass, ws_ev_gx)
    websocket_api.async_register_command(hass, ws_flows)
    websocket_api.async_register_command(hass, ws_forecast)
    websocket_api.async_register_command(hass, ws_finance)
    websocket_api.async_register_command(hass, ws_panel)


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
        "panel": entry.options.get(OPT_PANEL),
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
        vol.Required("type"): f"{DOMAIN}/ev_gx",
        vol.Required("start"): _parse,
        vol.Required("end"): _parse,
        vol.Optional("entity"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_ev_gx(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Like `ev`, but the energy comes from the charger's own meter (victron_gx).

    The meter's hourly energy is read from the integration's copy (`EvMeter`, kept
    even if the sensor goes away) plus the hour in progress, and split by source
    with VRM's flows of that hour; hours before the meter's first hour keep VRM's
    EV flows (see ev_gx.py).
    """
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    start, end = msg["start"], msg["end"]
    if end < start or (end - start).days > MAX_EV_DAYS:
        connection.send_error(msg["id"], "invalid_range", f"Range must be 0–{MAX_EV_DAYS} days")
        return
    h: VrmHistory = entry.runtime_data.history
    meter: ev_gx.EvMeter = entry.runtime_data.ev_meter
    if msg.get("entity") and not meter.entity():
        # no victron_gx charger found: use the meter the card names
        meter.remember(msg["entity"])
        await meter.async_sync()
    hours = await meter.async_live()
    out = ev_gx.split(lambda d: (h._day(d) or {}).get("h"), start, end, hours, meter.data.get("first"))
    connection.send_result(msg["id"], {
        "codes": EV_CODES,
        "entity": meter.entity(),
        "synced": meter.data.get("synced"),
        **out,
    })


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
        vol.Required("type"): f"{DOMAIN}/forecast",
        vol.Required("start"): _parse,
        vol.Required("end"): _parse,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_forecast(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """VRM's forecasts per day between two dates (inclusive): totals and hours, in kWh."""
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    start, end = msg["start"], msg["end"]
    if end < start or (end - start).days > MAX_DAYS:
        connection.send_error(msg["id"], "invalid_range", f"Range must be 0–{MAX_DAYS} days")
        return
    fc = entry.runtime_data.forecast
    connection.send_result(msg["id"], {
        "codes": FC_KEYS,
        "days": fc.days(start, end),
        "fetched": fc.data.get("fetched"),
    })


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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/panel",
        vol.Optional("entry_id"): str,
        vol.Required("panel"): vol.Any(None, vol.In(PANEL_COLORS)),
    }
)
@websocket_api.require_admin
@callback
def ws_panel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save the background colour of the card's boxes (None = the card's default)."""
    if (entry := _entry(hass, msg)) is None:
        return _not_loaded(connection, msg)
    options = {k: v for k, v in entry.options.items() if k != OPT_PANEL}
    if msg["panel"] is not None:
        options[OPT_PANEL] = msg["panel"]
    hass.config_entries.async_update_entry(entry, options=options)
    connection.send_result(msg["id"], {"panel": msg["panel"]})
