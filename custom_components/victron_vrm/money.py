"""Money for one day, the same formulas as the card's cash() (see the money model in CLAUDE.md)."""

from __future__ import annotations

from typing import Any

from .const import CODES


def price_at(finance: dict[str, Any], month: str) -> tuple[float, float] | None:
    """Import and export price (lei/kWh) for a 'YYYY-MM' month, or None when not set.

    Each price period applies from its `from` month (the first one, `from` null, from the start)
    until the next; entries saved before price history have only price_import / price_export.
    """
    prices = finance.get("prices") or []
    if prices:
        best = None
        for p in sorted(prices, key=lambda p: p.get("from") or ""):
            if (p.get("from") or "") <= month:
                best = p
        best = best or prices[0]
        imp, exp = best.get("import"), best.get("export")
    else:
        imp, exp = finance.get("price_import"), finance.get("price_export")
    if imp is None or exp is None or imp <= 0 or exp < 0:
        return None
    return float(imp), float(exp)


def day_cash(vals: list[float], p_imp: float, p_exp: float) -> dict[str, float]:
    """Gain, import cost and the bills for a period's CODES-ordered totals.

    Linear in the flows, like the card: savings = (Pc + Bc − Gb)·P, injection value = (Pg + Bg)·PI,
    so a day whose grid import went into the battery can show a lower (even negative) gain.
    """
    v = {c: max(0.0, float(vals[i] or 0)) if i < len(vals) else 0.0 for i, c in enumerate(CODES)}
    cons = v["Pc"] + v["Bc"] + v["Gc"]
    imp = v["Gc"] + v["Gb"]
    inj = v["Pg"] + v["Bg"]
    savings = (v["Pc"] + v["Bc"] - v["Gb"]) * p_imp
    inj_value = inj * p_exp
    return {
        "gain": savings + inj_value,
        "savings": savings,
        "injection_value": inj_value,
        "import_cost": imp * p_imp,
        "bill_without": cons * p_imp,
        "bill_with": imp * p_imp - inj_value,
    }
