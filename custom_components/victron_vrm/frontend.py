"""Keeps the dashboard card registered as an inline Lovelace resource.

The card is served as a `data:` module rather than a file URL: the iOS
companion app does not run a file-backed module again after a pull-to-refresh,
while inline resources always load. One resource is kept per installation,
recognised by the comment the card source starts with, and rewritten whenever
the bundled card changes.
"""

from __future__ import annotations

import base64
import binascii
import logging
from pathlib import Path
from typing import Any

from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.core import HomeAssistant

from .const import CARD_FILE, CARD_MARKER

_LOGGER = logging.getLogger(__name__)

DATA_PREFIX = "data:text/javascript;base64,"
# Earlier versions loaded the card from this path; such resources are replaced.
LEGACY_URL = "/victron_vrm/victron-vrm-card.js"


def _is_ours(url: str) -> bool:
    if url.startswith(LEGACY_URL):
        return True
    if not url.startswith(DATA_PREFIX):
        return False
    try:
        head = base64.b64decode(url[len(DATA_PREFIX):len(DATA_PREFIX) + 64])
    except (binascii.Error, ValueError):
        return False
    return head.decode("utf-8", "ignore").startswith(CARD_MARKER)


async def _async_resources(hass: HomeAssistant) -> Any | None:
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None or lovelace.resource_mode != MODE_STORAGE:
        _LOGGER.warning(
            "Lovelace resources are in YAML mode; add the Victron VRM card as a module resource by hand"
        )
        return None
    resources = lovelace.resources
    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True
    return resources


async def async_register_card(hass: HomeAssistant) -> None:
    """Create or refresh the card's inline resource, removing duplicates."""
    if (resources := await _async_resources(hass)) is None:
        return
    source = await hass.async_add_executor_job(
        (Path(__file__).parent / CARD_FILE).read_bytes
    )
    url = DATA_PREFIX + base64.b64encode(source).decode()
    ours = [item for item in resources.async_items() if _is_ours(item["url"])]
    if not ours:
        await resources.async_create_item({"res_type": "module", "url": url})
        _LOGGER.debug("Registered the Victron VRM card resource")
        return
    first, *extra = ours
    if first["url"] != url or first.get("type") != "module":
        await resources.async_update_item(first["id"], {"res_type": "module", "url": url})
        _LOGGER.debug("Updated the Victron VRM card resource")
    for item in extra:
        await resources.async_delete_item(item["id"])


async def async_unregister_card(hass: HomeAssistant) -> None:
    """Remove the card's resource (used when the last entry is deleted)."""
    if (resources := await _async_resources(hass)) is None:
        return
    for item in [i for i in resources.async_items() if _is_ours(i["url"])]:
        await resources.async_delete_item(item["id"])
