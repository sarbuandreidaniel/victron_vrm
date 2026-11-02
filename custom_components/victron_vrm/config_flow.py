"""Config flow: access token → installation."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_ACCESS_TOKEN
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    DateSelector,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)
from homeassistant.util import dt as dt_util

from .api import VrmApi, VrmAuthError, VrmError
from .const import CONF_HISTORY_START, CONF_SITE_ID, CONF_SITE_NAME, DOMAIN

_LOGGER = logging.getLogger(__name__)

TOKEN_SCHEMA = vol.Schema(
    {vol.Required(CONF_ACCESS_TOKEN): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))}
)


def _created(site: dict[str, Any]) -> date:
    """Day the installation was registered in VRM, or 1 January of last year."""
    ts = site.get("syscreated")
    if isinstance(ts, (int, float)) and ts > 0:
        return datetime.fromtimestamp(ts, dt_util.get_default_time_zone()).date()
    return date(dt_util.now().year - 1, 1, 1)


class VrmConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for a VRM access token, then pick an installation."""

    VERSION = 1

    def __init__(self) -> None:
        self._token: str | None = None
        self._sites: dict[str, dict[str, Any]] = {}

    async def _async_check(self, token: str) -> str | None:
        """Validate the token and load the installations; return an error key."""
        api = VrmApi(async_get_clientsession(self.hass), token)
        try:
            user_id = await api.async_get_user_id()
            sites = await api.async_get_installations(user_id)
        except VrmAuthError:
            return "invalid_auth"
        except VrmError:
            _LOGGER.exception("Cannot reach VRM")
            return "cannot_connect"
        if not sites:
            return "no_sites"
        self._token = token
        self._sites = {str(s["idSite"]): s for s in sites}
        return None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            if (err := await self._async_check(user_input[CONF_ACCESS_TOKEN].strip())) is None:
                if len(self._sites) == 1:
                    return await self.async_step_site({CONF_SITE_ID: next(iter(self._sites))})
                return await self.async_step_site()
            errors["base"] = err
        return self.async_show_form(step_id="user", data_schema=TOKEN_SCHEMA, errors=errors)

    async def async_step_site(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            site = self._sites[str(user_input[CONF_SITE_ID])]
            await self.async_set_unique_id(str(site["idSite"]))
            self._abort_if_unique_id_configured()
            start = user_input.get(CONF_HISTORY_START) or _created(site).isoformat()
            return self.async_create_entry(
                title=site.get("name") or f"VRM {site['idSite']}",
                data={
                    CONF_ACCESS_TOKEN: self._token,
                    CONF_SITE_ID: int(site["idSite"]),
                    CONF_SITE_NAME: site.get("name"),
                    CONF_HISTORY_START: start,
                },
            )
        options = [
            SelectOptionDict(value=k, label=s.get("name") or k) for k, s in self._sites.items()
        ]
        return self.async_show_form(
            step_id="site",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SITE_ID): SelectSelector(SelectSelectorConfig(options=options)),
                    vol.Optional(CONF_HISTORY_START): DateSelector(),
                }
            ),
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            token = user_input[CONF_ACCESS_TOKEN].strip()
            if (err := await self._async_check(token)) is None:
                if str(entry.data[CONF_SITE_ID]) not in self._sites:
                    return self.async_abort(reason="wrong_account")
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_ACCESS_TOKEN: token}
                )
            errors["base"] = err
        return self.async_show_form(step_id="reauth_confirm", data_schema=TOKEN_SCHEMA, errors=errors)
