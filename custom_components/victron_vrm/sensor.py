"""Diagnostic sensor showing when the VRM history was last synced."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import VrmConfigEntry
from .const import CONF_SITE_ID, DOMAIN
from .coordinator import VrmCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: VrmConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([VrmLastSyncSensor(entry.runtime_data, entry)])


class VrmLastSyncSensor(CoordinatorEntity[VrmCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "last_sync"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: VrmCoordinator, entry: VrmConfigEntry) -> None:
        super().__init__(coordinator)
        site = entry.data[CONF_SITE_ID]
        self._attr_unique_id = f"{site}_last_sync"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, str(site))},
            name=entry.title,
            manufacturer="Victron Energy",
            model="VRM",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=f"https://vrm.victronenergy.com/installation/{site}/dashboard",
        )

    @property
    def native_value(self) -> datetime | None:
        return self.coordinator.history.synced

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        h = self.coordinator.history
        return {"history_start": h.start.isoformat(), "backfilling": h.backfilling, "years": sorted(h.data["years"])}
