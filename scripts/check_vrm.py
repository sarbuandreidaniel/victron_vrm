"""Live check against the VRM API, using the integration's own client and aggregation.

Reads VRM_TOKEN from the environment or the repo's .env, fetches one month of hourly
data, aggregates it per local day and compares it with VRM's own daily totals.

    .venv_ha/bin/python integrations/victron_vrm/scripts/check_vrm.py 2025-11
"""

import asyncio
from datetime import date, datetime, time
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

import aiohttp

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from victron_vrm.api import VrmApi  # noqa: E402
from victron_vrm.const import CODES  # noqa: E402
from victron_vrm.history import apply_window, bucket_hours, month_bounds  # noqa: E402

TZ = ZoneInfo("Europe/Bucharest")


def token() -> str:
    if os.environ.get("VRM_TOKEN"):
        return os.environ["VRM_TOKEN"]
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("VRM_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("VRM_TOKEN missing from the environment and from .env")


async def main(month: str) -> None:
    y, m = map(int, month.split("-"))
    first, nxt = month_bounds(y, m)
    t0 = int(datetime.combine(first, time(), TZ).timestamp())
    t1 = int(datetime.combine(nxt, time(), TZ).timestamp())
    async with aiohttp.ClientSession() as session:
        api = VrmApi(session, token())
        uid = await api.async_get_user_id()
        sites = await api.async_get_installations(uid)
        for s in sites:
            created = datetime.fromtimestamp(s["syscreated"], TZ).date() if s.get("syscreated") else None
            print(f"site {s['idSite']} {s.get('name')!r} syscreated={created}")
        site = int(sites[0]["idSite"])
        hours = await api.async_get_energy_hours(site, t0, t1)
        print("hourly points per code:", {c: len(v) for c, v in hours.items()})
        years: dict = {}
        apply_window(years, first, nxt, bucket_hours(hours, TZ))
        # VRM's own daily totals for the same window, for comparison
        daily = await api._get(f"/installations/{site}/stats", {"type": "kwh", "interval": "days", "start": t0, "end": t1})
    mine = years.get(str(y), {}).get("m", {}).get(f"{m:02d}", {})
    print("month total (ours):", dict(zip(CODES, mine.get("t", []))))
    print("month total (VRM): ", {c: round(daily["totals"].get(c, 0), 4) for c in CODES})
    print("days:", len(mine.get("d", {})), "| first day hours:", next(iter(mine.get("d", {}).values()), {}).get("h", {}).keys())


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else date.today().strftime("%Y-%m")))
