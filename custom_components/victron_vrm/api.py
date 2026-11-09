"""Minimal client for the Victron VRM API v2."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from .const import API_BASE, CODES

_LOGGER = logging.getLogger(__name__)

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=60)


class VrmError(Exception):
    """Generic VRM API failure."""


class VrmAuthError(VrmError):
    """The access token was rejected."""


class VrmApi:
    """Talks to vrmapi.victronenergy.com with a personal access token."""

    def __init__(self, session: aiohttp.ClientSession, token: str) -> None:
        self._session = session
        self._headers = {"X-Authorization": f"Token {token}"}

    async def _get(
        self, path: str, params: dict[str, Any] | list[tuple[str, Any]] | None = None
    ) -> dict[str, Any]:
        url = f"{API_BASE}{path}"
        for attempt in range(3):
            try:
                async with self._session.get(
                    url, headers=self._headers, params=params, timeout=REQUEST_TIMEOUT
                ) as resp:
                    if resp.status in (401, 403):
                        raise VrmAuthError(f"VRM rejected the token ({resp.status})")
                    if resp.status == 429:
                        # Rate limited: honour Retry-After, then try again.
                        wait = float(resp.headers.get("Retry-After", 30))
                        _LOGGER.debug("VRM rate limit hit, waiting %ss", wait)
                        await asyncio.sleep(min(wait, 120))
                        continue
                    data = await resp.json(content_type=None)
                    if resp.status != 200 or not data.get("success", False):
                        raise VrmError(f"VRM {path} failed ({resp.status}): {data.get('errors')}")
                    return data
            except (aiohttp.ClientError, asyncio.TimeoutError) as err:
                if attempt == 2:
                    raise VrmError(f"Cannot reach VRM: {err}") from err
                await asyncio.sleep(2 * (attempt + 1))
        raise VrmError("VRM kept rate limiting the request")

    async def async_get_user_id(self) -> int:
        """Return the id of the token's owner."""
        data = await self._get("/users/me")
        return int(data["user"]["id"])

    async def async_get_installations(self, user_id: int) -> list[dict[str, Any]]:
        """Return the installations visible to the user."""
        data = await self._get(f"/users/{user_id}/installations")
        return list(data.get("records") or [])

    async def async_get_energy_hours(
        self, site_id: int, start: int, end: int
    ) -> dict[str, list[list[float]]]:
        """Return hourly kWh per flow code between two unix timestamps.

        Each value is a list of [timestamp_ms, kwh] pairs. A code VRM has no
        data for (e.g. the EV flows before a charger was installed) comes back
        as `false`; it is returned as an empty list.
        """
        data = await self._get(
            f"/installations/{site_id}/stats",
            [("type", "custom"), ("interval", "hours"), ("start", start), ("end", end)]
            + [("attributeCodes[]", code) for code in CODES],
        )
        records = data.get("records") or {}
        if not isinstance(records, dict):
            return {code: [] for code in CODES}
        return {
            code: records[code] if isinstance(records.get(code), list) else []
            for code in CODES
        }

    async def async_get_forecast_hours(
        self, site_id: int, start: int, end: int
    ) -> dict[str, list[list[float]]]:
        """Return VRM's hourly forecasts between two unix timestamps.

        Each value is a list of [timestamp_ms, Wh] pairs (Wh, unlike the kWh of
        the custom stats), the timestamp being the start of the hour. Series
        VRM has nothing for come back as `false` and are left out.
        """
        data = await self._get(
            f"/installations/{site_id}/stats",
            {"type": "forecast", "interval": "hours", "start": start, "end": end},
        )
        records = data.get("records") or {}
        if not isinstance(records, dict):
            return {}
        return {k: v for k, v in records.items() if isinstance(v, list)}
