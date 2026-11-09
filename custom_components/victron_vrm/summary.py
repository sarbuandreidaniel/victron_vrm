"""Period summaries (day / month / year) returned by the summary service.

The figures match the dashboard card: EV flows are a part of Pc / Bc / Gc, the
house is consumption without the EV, and losses (charge − discharge) are only
meaningful over a month or longer.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .const import CODES

PERIODS = ("day", "month", "year")

WEEKDAYS = ("luni", "marți", "miercuri", "joi", "vineri", "sâmbătă", "duminică")
MONTHS = (
    "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
    "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
)


def default_day(period: str, today: date) -> date:
    """A day inside the last complete period: yesterday, last month or last year."""
    if period == "day":
        return today - timedelta(days=1)
    if period == "month":
        return today.replace(day=1) - timedelta(days=1)
    return date(today.year - 1, 12, 31)


def bounds(period: str, day: date) -> tuple[date, date]:
    """First and last day of the period that contains `day`."""
    if period == "day":
        return day, day
    if period == "month":
        nxt = date(day.year + 1, 1, 1) if day.month == 12 else date(day.year, day.month + 1, 1)
        return day.replace(day=1), nxt - timedelta(days=1)
    return date(day.year, 1, 1), date(day.year, 12, 31)


def label(period: str, day: date) -> str:
    if period == "day":
        return f"{WEEKDAYS[day.weekday()]}, {day.day} {MONTHS[day.month - 1]} {day.year}"
    if period == "month":
        return f"{MONTHS[day.month - 1]} {day.year}"
    return str(day.year)


def _num(v: float, decimals: int) -> str:
    """Romanian number format: 1.234,5"""
    s = f"{v:,.{decimals}f}"
    return s.replace(",", " ").replace(".", ",").replace(" ", ".")


def kwh(v: float) -> str:
    return _num(v, 0 if abs(v) >= 100 else 1)


def pct(part: float, whole: float) -> str:
    return f"{round(part / whole * 100)}%" if whole > 0 else "—"


def forecast_line(fc: dict[str, Any]) -> str:
    """One notification line with today's VRM forecast: solar, consumption, of which the car."""
    solar, cons, ev = fc["t"]
    car = f", din care mașina ~{kwh(ev)}" if ev >= 0.1 else ""
    return f"🔮 Azi, după prognoza VRM: soare ~{kwh(solar)} kWh · consum ~{kwh(cons)} kWh{car}"


def summarize(
    period: str,
    day: date,
    vals: list[float] | None,
    days: int,
    forecast: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the service response for one period from its CODES-ordered totals.

    `forecast` ({"date", "t": [solar, consumption, ev]}) adds today's VRM
    forecast to the response and a line to the message.
    """
    start, end = bounds(period, day)
    v = {c: max(0.0, float(vals[i])) if vals and i < len(vals) else 0.0 for i, c in enumerate(CODES)}
    house_solar = max(0.0, v["Pc"] - v["Pe"])
    house_bat = max(0.0, v["Bc"] - v["Be"])
    house_grid = max(0.0, v["Gc"] - v["Ge"])
    prod = v["Pc"] + v["Pb"] + v["Pg"]
    cons = v["Pc"] + v["Bc"] + v["Gc"]
    house = house_solar + house_bat + house_grid
    ev = v["Pe"] + v["Be"] + v["Ge"]
    imp = v["Gc"] + v["Gb"]
    inj = v["Pg"] + v["Bg"]
    chg = v["Pb"] + v["Gb"]
    dis = v["Bc"] + v["Bg"]
    loss = max(0.0, chg - dis)
    loss_w = loss / (days * 24) * 1000 if days else 0.0

    r2 = lambda x: round(x, 2)  # noqa: E731
    out: dict[str, Any] = {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "label": label(period, day),
        "days": days,
        "has_data": any(x > 0 for x in v.values()),
        "kwh": {
            "production": r2(prod),
            "consumption": r2(cons),
            "house": r2(house),
            "ev": r2(ev),
            "import": r2(imp),
            "export": r2(inj),
            "battery_charge": r2(chg),
            "battery_discharge": r2(dis),
            "losses": r2(loss),
        },
        "flows": {c: r2(x) for c, x in v.items()},
        "independence": round((v["Pc"] + v["Bc"]) / cons * 100, 1) if cons > 0 else None,
        "self_consumption": round((v["Pc"] + v["Pb"]) / prod * 100, 1) if prod > 0 else None,
    }

    out["title"] = f"Energie · {out['label']}"
    if forecast:
        f_solar, f_cons, f_ev = forecast["t"]
        out["forecast"] = {
            "date": forecast["date"].isoformat(),
            "production": r2(f_solar),
            "consumption": r2(f_cons),
            "ev": r2(f_ev),
        }
    if not out["has_data"]:
        out["message"] = "Nu există date VRM pentru această perioadă."
        if forecast:
            out["message"] += "\n" + forecast_line(forecast)
        return out

    per_day = f" ({kwh(prod / days)} kWh/zi)" if period != "day" and days else ""
    lines = [
        f"☀️ Producție {kwh(prod)} kWh{per_day}",
        f"🏠 Casa {kwh(house)} kWh: {pct(house_solar, house)} solar, "
        f"{pct(house_bat, house)} baterie, {pct(house_grid, house)} rețea",
    ]
    if ev > 0:
        lines.append(f"🚗 Mașina {kwh(ev)} kWh, {pct(v['Pe'] + v['Be'], ev)} din solar + baterie")
    lines += [
        f"⚡ Rețea: import {kwh(imp)} · injecție {kwh(inj)} kWh",
        f"🔋 Baterie: încărcat {kwh(chg)} · descărcat {kwh(dis)} kWh",
    ]
    if period != "day":
        lines.append(f"📉 Pierderi sistem {kwh(loss)} kWh (≈ {_num(loss_w, 0)} W în medie)")
    lines.append(
        f"Independență {pct(v['Pc'] + v['Bc'], cons)} · Autoconsum {pct(v['Pc'] + v['Pb'], prod)}"
    )
    if forecast:
        lines.append(forecast_line(forecast))
    out["message"] = "\n".join(lines)
    return out
