"""Constants for the Victron VRM integration."""

from datetime import timedelta

DOMAIN = "victron_vrm"

CONF_SITE_ID = "site_id"
CONF_SITE_NAME = "site_name"
CONF_HISTORY_START = "history_start"

API_BASE = "https://vrmapi.victronenergy.com/v2"

# Energy flows requested from /stats?type=custom. Every stored bucket is a list
# of kWh values in this exact order; new codes are only ever appended.
#   Pc solar → consumers   Pb solar → battery   Pg solar → grid
#   Bc battery → consumers Bg battery → grid
#   Gc grid → consumers    Gb grid → battery
#   Pe solar → EV          Be battery → EV      Ge grid → EV
# The EV flows are a part of Pc / Bc / Gc (the charger is a consumer on the
# AC output), not extra energy on top of them.
CODES = ("Pc", "Pb", "Pg", "Bc", "Bg", "Gc", "Gb", "Pe", "Be", "Ge")
# The EV charger flows, in the order the `ev` websocket command returns them.
EV_CODES = ("Pe", "Be", "Ge")

UPDATE_INTERVAL = timedelta(minutes=15)
# VRM forecasts: fetched at most this often, kept this many days back, read this many days ahead
FORECAST_INTERVAL = timedelta(hours=1)
FORECAST_KEEP_DAYS = 62
FORECAST_AHEAD_DAYS = 8
# Days compared for the forecast accuracy ratio
ACCURACY_DAYS = 14
# A month is re-fetched once this long after it ends, then never again.
FINALIZE_DELAY = timedelta(days=2)
# Pause between history requests so the backfill stays gentle on the VRM API.
BACKFILL_PAUSE = 1.0

STORAGE_VERSION = 1

CARD_FILE = "frontend/victron-vrm-card.js"
# First characters of the card source; identifies the card's Lovelace resource.
CARD_MARKER = "/* victron-vrm-card"

SERVICE_RESYNC = "resync"
SERVICE_SUMMARY = "summary"

# Financial settings, kept in the config entry options and edited from the card.
#   investment    lei paid for the system
#   price_import  lei per kWh taken from the grid
#   price_export  lei per kWh injected (compensated monthly against import)
OPT_FINANCE = "finance"
FINANCE_KEYS = ("investment", "price_import", "price_export")

# Background of the card's boxes, the same on every device; chosen by an admin in Setări.
# The card holds the names and the default (#3c3c3c); keep the two lists in step.
OPT_PANEL = "panel"
PANEL_COLORS = ("transparent", "#1f1f1f", "#2e2e2e", "#3c3c3c", "#464646")
