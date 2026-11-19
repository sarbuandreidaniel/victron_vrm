"""Offline tests for money.py (today's gain sensor), checked against the card's formulas.

Run with the repo's HA virtualenv:
    .venv_ha/bin/python integrations/victron_vrm/scripts/test_money.py
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.money import day_cash, price_at  # noqa: E402


def vals(**kw):
    return [kw.get(c, 0.0) for c in CODES]


def test_price_at():
    f = {"prices": [{"from": "2026-12", "import": 1.3, "export": 0.5}, {"from": None, "import": 1.11, "export": 0.45}]}
    assert price_at(f, "2026-11") == (1.11, 0.45)
    assert price_at(f, "2026-12") == (1.3, 0.5)
    assert price_at(f, "2027-03") == (1.3, 0.5)
    assert price_at({"price_import": 1.11, "price_export": 0.45}, "2026-11") == (1.11, 0.45)
    assert price_at({}, "2026-11") is None
    assert price_at({"prices": [{"from": None, "import": 0, "export": 0.45}]}, "2026-11") is None


def test_day_cash_matches_card():
    # Zi, 19 Nov 2026 on staging: Pc 3.1, Pb 11.3, Bc 3.6, Gc 0.4 → gain 7.44 lei in the card
    c = day_cash(vals(Pc=3.1, Pb=11.3, Bc=3.6, Gc=0.4), 1.11, 0.45)
    assert round(c["gain"], 2) == round((3.1 + 3.6) * 1.11, 2) == 7.44
    assert round(c["bill_without"] - c["bill_with"], 6) == round(c["gain"], 6)
    # grid into the battery lowers the day's gain; injection is valued at the export price
    c = day_cash(vals(Pc=1.0, Gb=2.0, Pg=3.0, Bg=1.0, Gc=0.5), 1.11, 0.45)
    assert round(c["savings"], 6) == round((1.0 - 2.0) * 1.11, 6)
    assert round(c["injection_value"], 6) == round(4.0 * 0.45, 6)
    assert round(c["import_cost"], 6) == round(2.5 * 1.11, 6)
    assert round(c["bill_without"] - c["bill_with"], 6) == round(c["gain"], 6)
    # negative or missing values count as zero, like mk() in the card
    assert day_cash([-1.0, None], 1.0, 0.5)["gain"] == 0.0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
