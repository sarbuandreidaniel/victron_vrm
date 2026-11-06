# victron_vrm — notes for coding agents

Home Assistant custom integration that downloads hourly energy flows of a Victron installation from the VRM API, keeps them in a local cache and ships one Lovelace card, `custom:victron-vrm-card`, with the views Zi / Săptămână / Lună / An / Mașina / Baterie / Amortizare / Setări. The card reads only the cache over websocket. Installed in production through HACS from this repository's GitHub releases.

The UI is Romanian. Keep every user-facing string in Romanian with diacritics; Python comments and docstrings are English, card comments Romanian.

Card internals (constants, methods, CSS, recipes) are in [docs/card.md](docs/card.md); read it before editing `victron-vrm-card.js`.

## Layout

| Path | Role |
|---|---|
| `custom_components/victron_vrm/api.py` | VRM client (`/installations/<id>/stats?type=custom&interval=hours`) |
| `history.py` | cache: fetch, bucket per local hour, totals per day / month / year |
| `coordinator.py`, `sensor.py` | 15-minute refresh of yesterday + today, last-sync sensor |
| `websocket.py` | card API: `victron_vrm/info`, `years`, `days`, `hours`, `finance` |
| `summary.py`, `__init__.py`, `services.yaml` | services `summary` (response only) and `resync` |
| `frontend.py` | registers the card as an inline `data:` Lovelace module and refreshes it on startup |
| `frontend/victron-vrm-card.js` | the card, one self-contained file; must start with `/* victron-vrm-card` |
| `const.py` | `CODES`, intervals, option keys |
| `scripts/test_*.py` | offline tests |
| `scripts/check_vrm.py` | live check against VRM (token from `VRM_TOKEN` or the parent repo's `.env`) |
| `scripts/harness/` | the card in a browser with a fake `hass` and generated data |
| `scripts/release.sh` | version bump, checks, commit, push, wait for the GitHub release |

## Data model

VRM flows, stored in this order (`const.CODES`; only ever append new codes):

| Code | Flow |
|---|---|
| `Pc` / `Pb` / `Pg` | solar → consumers / battery / grid |
| `Bc` / `Bg` | battery → consumers / grid |
| `Gc` / `Gb` | grid → consumers / battery |
| `Pe` / `Be` / `Ge` | solar / battery / grid → EV charger |

The EV charger sits on the AC output, so `Pe ≤ Pc`, `Be ≤ Bc`, `Ge ≤ Gc`; the EV flows are part of consumption, not extra. Derived values, identical in the card (`derive()`) and `summary.py`:

- production = Pc + Pb + Pg · consumption = Pc + Bc + Gc · ev = Pe + Be + Ge · house = consumption − ev
- import = Gc + Gb · injection = Pg + Bg · battery charge = Pb + Gb · discharge = Bc + Bg
- losses = charge − discharge: VRM books inverter idle use and conversion losses on the battery flows. Over a day or week it also contains energy still in the battery, so it is shown only for Lună and An.
- independence = (Pc + Bc) / consumption · self-consumption = (Pc + Pb) / production

Always build days from hourly points in local time (`bucket_hours`): VRM's own daily totals are shifted by a day after a DST change.

Cache file `.storage/victron_vrm.<entry_id>`:
```
{"years": {"2026": {"t": [...], "m": {"03": {"t": [...], "d": {"14": {"t": [...], "h": {"00": [...], …}}}}}}},
 "done": ["2025-10", …], "synced": "…", "codes": [...]}
```
Months are fetched once more 2 days after they end and then marked `done`. The backfill fetches one month per request with a 1 s pause. Adding a code pads old buckets with zeros and re-fetches everything (`_widen`).

## Websocket API

All commands take an optional `entry_id`.

| type | answer |
|---|---|
| `victron_vrm/info` | `codes, site, start, synced, backfilling, finance` |
| `victron_vrm/years` | `codes, years: {YYYY: {t, m: {MM: totals}, n: {MM: days with data}}}` |
| `victron_vrm/days` (`start`, `end`) | `codes, days: {YYYY-MM-DD: totals}` |
| `victron_vrm/hours` (`date`) | `codes, hours: {HH: values}` |
| `victron_vrm/ev` (`start`, `end`) | `codes: [Pe, Be, Ge], hours: {YYYY-MM-DD: {HH: [Pe, Be, Ge]}}`, only hours with EV energy; the Mașina view asks for the whole history once |
| `victron_vrm/flows` (`start`, `end`, `codes`) | `codes, hours: {YYYY-MM-DD: {HH: values in the order of codes}}`, only hours where one of `codes` is non-zero, at most 400 days; the Baterie view asks for the shown month with `[Pb, Gb, Bc, Bg]` |
| `victron_vrm/finance` (admin) | saves the finance options, answers `{finance}` |

`finance` lives in the config entry options: `investment` (lei), `prices: [{from: "YYYY-MM" | null, import, export}]` (lei/kWh), plus `price_import` / `price_export` mirroring the last price. The handler sorts by `from`, forces the first `from` to null and rejects two prices starting in the same month. Entries saved before price history have only the two plain fields; the card's `priceList()` turns them into one period.

## Money model (Amortizare)

Romanian prosumer billing, compensated per month: each imported kWh costs P − PI when an equal kWh was injected in the same month, the rest of the import costs P, and injection above import is paid at PI.

- comp = min(import, injection)
- bill with the system = comp·(P − PI) + (import − comp)·P − max(0, injection − import)·PI
- bill without = consumption·P
- gain = bill without − bill with = max(0, Pc + Bc − Gb)·P + injection·PI (shown as "economii din autoconsum" + "valoarea injecției")

Each month uses its own price (`priceAt(list, 'YYYY-MM')`); changing a price never rewrites past months. Forward figures (lei/day, time left, estimated month, yearly return) use the last 12 complete months recomputed at the current price (`gainAt`). With one price, a change elsewhere must leave all Amortizare figures unchanged; check that.

Worked example (P 1.11, PI 0.45): import 376 kWh, injection 43 kWh, consumption 764 kWh → bill without 848.16, bill with 43·0.66 + 333·1.11 = 397.84, gain 450.33 lei. A summer month with import 17, injection 623 → bill −261.30 (credit).

## Making a change

1. Read the code involved; for a "wrong number" report, check the data first (cache or websocket) before touching a formula.
2. Edit. When patching with scripts, assert each replaced pattern occurs exactly once.
3. Offline checks: `node --check` on the card and the three `scripts/test_*.py` (`../../.venv_ha/bin/python scripts/test_summary.py` from this folder). For websocket schema changes, call `ws_x._ws_schema({...})` directly and unwrap the handler through `__wrapped__` to call it with fakes.
4. Browser check with `scripts/harness/` (below) on desktop and at 375 px wide.
5. Release with `scripts/release.sh <version> "<commit message>"` (see the script header): it bumps `manifest.json` and the card `VERSION` together, runs the checks, commits, pushes `main` and waits for the `v<version>` release. Commit and push only with the maintainer's go-ahead. Semver: features → minor, fixes and visual changes → patch.
6. Installing in Home Assistant (HACS download, restart, checking the page) is in the parent repository's CLAUDE.md.

## Testing the card in a browser

`scripts/harness/index.html` loads the card from this repository and a fake `hass` whose `callWS` answers like `websocket.py`, from data generated in the page (a deterministic model of a 7 kW solar array, 20 kWh battery and an EV charger from 2025-10-22 to today). Nothing in it is real installation data; keep it that way, the repository is public.

```bash
python3 -m http.server 8765 -d integrations/victron_vrm   # from the parent repo
# open http://localhost:8765/scripts/harness/?view=amortizare   (zi | saptamana | luna | an | masina | baterie | amortizare | setari)
```
In the Claude desktop app, point `.claude/launch.json` at that command and use `preview_start`. The card is `window.el`, the fake hass `window.hassFake` (`hassFake.fin` is the saved finance, `hassFake.calls` every write). `_go()` navigates the HA URL, so to switch views reload with another `?view=`. The browser caches the card file: after editing it, run `await fetch('../../custom_components/victron_vrm/frontend/victron-vrm-card.js', {cache: 'reload'})` in the page and reload, or the old card keeps running. If you change the websocket API, change the harness the same way.

## Mașina view (EV charger)

`view: masina` with `charger: <prefix>` (Victron EVCS entities from the core `victron_gx` integration: `sensor.<prefix>_status`, `_power`, `_current`, `_total_energy`, `_last_session_energy`, `_last_session_time`, `select.<prefix>_mode`, `switch.<prefix>_ev_charging`, `switch.<prefix>_auto_start`, `number.<prefix>_charge_current_setpoint`) and optionally `car: <prefix>` (`sensor.<prefix>_state_of_charge`, `_target_state_of_charge`, `_charging_state`); `entities:` overrides any single id. The live box re-renders only when one of those states changes (`_syncLive`), and the current stepper sends one `number.set_value` 800 ms after the last press. History comes from `victron_vrm/ev`; sessions are runs of consecutive hours with ≥ 0.05 kWh to the car, so their times are whole hours. Cost = grid kWh × that month's import price; savings = (solar + battery) kWh × the same price, matching Amortizare.

## Baterie view (home battery)

`view: baterie`, optional `capacity:` (kWh, for full cycles and stored energy) and `battery:` overriding any entity of `BAT_DEF`: `soc`, `reserve` (active SoC limit), `mode` (ESS mode select), `minsoc`, `force` (force charge switch), `maxI`, `maxC`, `maxInv`, `maxFeed` (ESS limits, -1 = none), plus entities with no default: `power`, `voltage`, `current`, `temp`, `left`, `full` (the last two are text sensors; a value that does not start with a digit is a message, not a duration). The live box holds the controls: a mode change, force charge and the limits go through an inline confirmation (`.cf`), the min-SoC stepper sends one `number.set_value` 800 ms after the last press. `_syncBat()` skips re-rendering while a confirmation is open, the stepper has an unsent value or a limit field was edited. History: `victron_vrm/days` (daily rows), `victron_vrm/flows` (hour-of-day chart), `victron_vrm/years` (month and year tables) and the SoC from `recorder/statistics_during_period` (period `day`, min / max / mean; the chart is left out for months without statistics). Efficiency = discharge ÷ charge, losses = charge − discharge, cycles = discharge ÷ capacity.

## Design rules already settled

- Dark palette with measured contrast on the panel `#1f1f1f`: text `#fff`, soft `#c7c7c7`, muted `#a3a3a3` (6.5:1), control borders `#6b6b6b` (3.1:1), focus `#5aa0f0`, primary button `#2f72d0` with white text (4.7:1).
- One fixed colour per flow in every chart (`FLOW`); text never in series colours; legends always shown; validate any new chart colour for colour-vision deficiencies.
- Units are always visible where the number is: in tables under each column name (`th(long, short, unit, cls)`; cells hold bare numbers, percentages without `%`), in KPIs as the small unit beside the value, in chart legends right after each total, and on the chart's y axis (above the top label, `barChart` option `unit`). No separate "kWh · …" or "lei" notes.
- Font sizes are plain `font-size:Npx` in the CSS; the card rewrites them to follow the per-device size from Setări (`--fz`).
- Phones (≤ 700 px): one column, short table headers via `th(long, short)`, columns hidden with `.hn`, no horizontal scroll.
- Money and price inputs are `type=text inputmode=decimal` parsed by `parseNum` (accepts `81.246,17`, `81246,17`, `81246.17`); number inputs drop Romanian decimals.
- Keep the card an inline `data:` resource; file URLs stopped loading in the HA iOS app after pull-to-refresh.
- Bump `VERSION` in the card with `manifest.json`; Setări shows it, which is how a deploy is confirmed.

## Pitfalls already hit

- Re-rendering a whole card after a save erased its status message; update only the part that changed.
- The payback rate once included the current, partial month; use complete months only.
- An empty `<th>` short label shifted columns on phones; use `<th class="hn">` for columns hidden there.
- CSS `var()` inside SVG presentation attributes doesn't apply; SVG text inherits the font from CSS.
- Rewriting the translation JSON files with `json.dump` reformatted them; patch the text instead.
