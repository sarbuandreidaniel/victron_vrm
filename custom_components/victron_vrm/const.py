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

UPDATE_INTERVAL = timedelta(minutes=15)
# A month is re-fetched once this long after it ends, then never again.
FINALIZE_DELAY = timedelta(days=2)
# Pause between history requests so the backfill stays gentle on the VRM API.
BACKFILL_PAUSE = 1.0

STORAGE_VERSION = 1

CARD_FILE = "frontend/victron-vrm-card.js"
# First characters of the card source; identifies the card's Lovelace resource.
CARD_MARKER = "/* victron-vrm-card"

SERVICE_RESYNC = "resync"
