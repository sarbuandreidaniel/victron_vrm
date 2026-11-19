"""Sensors: when the VRM history was last synced, VRM's forecasts for today and tomorrow, today's gain in lei."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
)
from homeassistant.const import EntityCategory, UnitOfEnergy
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from . import VrmConfigEntry
from .const import ACCURACY_DAYS, CONF_SITE_ID, DOMAIN, OPT_FINANCE
from .coordinator import VrmCoordinator
from .forecast import VrmForecast, accuracy, remaining
from .money import day_cash, price_at


async def async_setup_entry(
    hass: HomeAssistant, entry: VrmConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [VrmLastSyncSensor(coordinator, entry), VrmGainTodaySensor(coordinator, entry)]
        + [VrmForecastSensor(coordinator, entry, d) for d in FORECASTS]
    )


def _device(entry: VrmConfigEntry) -> DeviceInfo:
    site = entry.data[CONF_SITE_ID]
    return DeviceInfo(
        identifiers={(DOMAIN, str(site))},
        name=entry.title,
        manufacturer="Victron Energy",
        model="VRM",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=f"https://vrm.victronenergy.com/installation/{site}/dashboard",
    )


class VrmLastSyncSensor(CoordinatorEntity[VrmCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "last_sync"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: VrmCoordinator, entry: VrmConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.data[CONF_SITE_ID]}_last_sync"
        self._attr_device_info = _device(entry)

    @property
    def native_value(self) -> datetime | None:
        return self.coordinator.history.synced

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        h = self.coordinator.history
        return {
            "history_start": h.start.isoformat(),
            "backfilling": h.backfilling,
            "years": sorted(h.data["years"]),
            "forecast_fetched": self.coordinator.forecast.data.get("fetched"),
        }


@dataclass(frozen=True, kw_only=True)
class ForecastDescription(SensorEntityDescription):
    """A forecast sensor: which series (solar / consumption) and which day."""

    series: str
    offset: int  # 0 today, 1 tomorrow
    value: Callable[[VrmForecast, date, datetime], float | None] | None = None


FORECASTS = (
    ForecastDescription(key="forecast_solar_today", series="solar", offset=0),
    ForecastDescription(
        key="forecast_solar_remaining", series="solar", offset=0,
        value=lambda fc, day, now: remaining(fc.day(day), now),
    ),
    ForecastDescription(key="forecast_solar_tomorrow", series="solar", offset=1),
    ForecastDescription(key="forecast_consumption_today", series="consumption", offset=0),
    ForecastDescription(key="forecast_consumption_tomorrow", series="consumption", offset=1),
)


class VrmForecastSensor(CoordinatorEntity[VrmCoordinator], SensorEntity):
    """VRM's forecast for one day, in kWh, with the hourly values as an attribute.

    No state class: a forecast is not a meter, so it stays out of the long-term statistics.
    """

    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_suggested_display_precision = 1
    entity_description: ForecastDescription

    def __init__(
        self, coordinator: VrmCoordinator, entry: VrmConfigEntry, description: ForecastDescription
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_translation_key = description.key
        self._attr_unique_id = f"{entry.data[CONF_SITE_ID]}_{description.key}"
        self._attr_device_info = _device(entry)

    def _day(self) -> date:
        return dt_util.now().date() + timedelta(days=self.entity_description.offset)

    @property
    def native_value(self) -> float | None:
        d = self.entity_description
        fc = self.coordinator.forecast
        v = d.value(fc, self._day(), dt_util.now()) if d.value else fc.total(self._day(), d.series)
        return None if v is None else round(v, 2)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        d = self.entity_description
        fc = self.coordinator.forecast
        day = self._day()
        attrs: dict[str, Any] = {"date": day.isoformat(), "hours": fc.hours(day, d.series)}
        if d.series == "consumption":
            ev = fc.total(day, "ev")
            attrs["ev"] = None if ev is None else round(ev, 2)
        elif d.offset == 0 and not d.value:
            # how far VRM's solar forecast was from reality in the last days
            today = dt_util.now().date()
            ratio, n = accuracy(
                fc.data["days"],
                self.coordinator.history.days(today - timedelta(days=ACCURACY_DAYS), today - timedelta(days=1)),
            )
            attrs["accuracy"] = None if ratio is None else round(ratio * 100)
            attrs["accuracy_days"] = n
        return attrs


class VrmGainTodaySensor(CoordinatorEntity[VrmCoordinator], SensorEntity):
    """Today's gain against having no system, in lei, at this month's prices from Setări.

    From VRM's hourly history, so it trails reality by up to a refresh (15 minutes) plus
    VRM's own delay. Unknown until prices are saved in Setări. No state class:
    the value restarts every day and is not a meter.
    """

    _attr_has_entity_name = True
    _attr_translation_key = "gain_today"
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_native_unit_of_measurement = "RON"
    _attr_suggested_display_precision = 2

    def __init__(self, coordinator: VrmCoordinator, entry: VrmConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_SITE_ID]}_gain_today"
        self._attr_device_info = _device(entry)

    def _cash(self) -> tuple[dict[str, float], tuple[float, float]] | None:
        now = dt_util.now()
        prices = price_at(self._entry.options.get(OPT_FINANCE, {}), now.strftime("%Y-%m"))
        if prices is None:
            return None
        return day_cash(self.coordinator.history.today(), *prices), prices

    @property
    def native_value(self) -> float | None:
        c = self._cash()
        return None if c is None else round(c[0]["gain"], 2)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        c = self._cash()
        if c is None:
            return {}
        cash, (p_imp, p_exp) = c
        return {k: round(x, 2) for k, x in cash.items() if k != "gain"} | {
            "price_import": p_imp,
            "price_export": p_exp,
        }
