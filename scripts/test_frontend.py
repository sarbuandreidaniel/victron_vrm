"""Offline tests for the card's inline Lovelace resource.

    .venv_ha/bin/python integrations/victron_vrm/scripts/test_frontend.py
"""

import asyncio
import base64
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE  # noqa: E402

from victron_vrm.frontend import DATA_PREFIX, _is_ours, async_register_card, async_unregister_card  # noqa: E402

CARD = (Path(__file__).resolve().parents[1] / "custom_components/victron_vrm/frontend/victron-vrm-card.js").read_bytes()


def inline(src: bytes) -> str:
    return DATA_PREFIX + base64.b64encode(src).decode()


class FakeResources:
    loaded = True

    def __init__(self, items):
        self.items = {i["id"]: dict(i) for i in items}
        self.n = 0

    def async_items(self):
        return list(self.items.values())

    async def async_create_item(self, data):
        self.n += 1
        item = {"id": f"new{self.n}", "type": data["res_type"], "url": data["url"]}
        self.items[item["id"]] = item

    async def async_update_item(self, item_id, data):
        self.items[item_id].update({"type": data["res_type"], "url": data["url"]})

    async def async_delete_item(self, item_id):
        del self.items[item_id]


def hass_with(resources):
    async def executor(fn, *args):
        return fn(*args)

    return SimpleNamespace(
        data={LOVELACE_DATA: SimpleNamespace(resource_mode=MODE_STORAGE, resources=resources)},
        async_add_executor_job=executor,
    )


OTHER = {"id": "flux", "type": "module", "url": inline(b"/* energie-flux shared module */")}
HACS = {"id": "btn", "type": "module", "url": "/hacsfiles/button-card/button-card.js?hacstag=1"}


def test_is_ours():
    assert _is_ours(inline(CARD))
    assert _is_ours("/victron_vrm/victron-vrm-card.js?v=0.3.2")
    assert not _is_ours(OTHER["url"]) and not _is_ours(HACS["url"])
    assert not _is_ours(DATA_PREFIX + "!!notbase64!!")


def test_register_fresh_install():
    res = FakeResources([OTHER, HACS])
    asyncio.run(async_register_card(hass_with(res)))
    ours = [i for i in res.async_items() if _is_ours(i["url"])]
    assert len(ours) == 1 and ours[0]["url"] == inline(CARD) and ours[0]["type"] == "module"
    assert res.items["flux"] == OTHER and res.items["btn"] == HACS


def test_register_replaces_old_and_duplicates():
    old_inline = {"id": "test", "type": "module", "url": inline(b"/* victron-vrm-card old version */")}
    legacy = {"id": "legacy", "type": "module", "url": "/victron_vrm/victron-vrm-card.js?v=0.3.2"}
    res = FakeResources([OTHER, old_inline, legacy, HACS])
    asyncio.run(async_register_card(hass_with(res)))
    ours = [i for i in res.async_items() if _is_ours(i["url"])]
    assert [i["id"] for i in ours] == ["test"] and ours[0]["url"] == inline(CARD)
    assert set(res.items) == {"flux", "test", "btn"}


def test_register_is_idempotent_and_unregister():
    res = FakeResources([OTHER])
    hass = hass_with(res)
    asyncio.run(async_register_card(hass))
    snapshot = {k: dict(v) for k, v in res.items.items()}
    asyncio.run(async_register_card(hass))
    assert res.items == snapshot
    asyncio.run(async_unregister_card(hass))
    assert list(res.items) == ["flux"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
