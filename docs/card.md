# victron-vrm-card internals

File: `custom_components/victron_vrm/frontend/victron-vrm-card.js`. Data model, websocket API and money formulas are in [../CLAUDE.md](../CLAUDE.md). It must start with the comment `/* victron-vrm-card` (the integration finds its own Lovelace resource by that marker) and stays a single self-contained file with no imports.

## Contents
1. Top of file: constants and helpers
2. The element and its lifecycle
3. Period views (zi / saptamana / luna / an)
4. Amortizare
5. Setări
6. Charts
7. CSS conventions
8. Recipes

## 1. Constants and helpers

| Name | Role |
|---|---|
| `VERSION` | shown in Setări; bump with `manifest.json` |
| `C` | colour tokens (page, panel, border, fg, soft, muted, ctl, grid, axis, pop, sel, focus); contrast notes in the comment above it |
| `FONT` | HA's body font with fallbacks |
| `FLOW` | one colour per flow code, plus `hPc/hBc/hGc` (house without car) and `eco/injv` (Amortizare) |
| `BASE`, `ZILE`, `ZILE_S`, `LUNI`, `LUNI_L`, `VIEWS` | flow list and Romanian day/month names (short and long) |
| `ICON` | MDI paths for the chart buttons; `svgI(path)` renders one |
| `th(long, short)`, `HEAD(ev)` | table headers with a short label on phones |
| `WIDE_KEY`, `loadWide/saveWide` | widened charts, per browser (localStorage, wrapped in try/catch) |
| `FZ_KEY`, `FZ`, `loadFz/saveFz`, `FZ_EVENT` | font size per device (0.9 / 1 / 1.15 / 1.3) |
| `FIN_EVENT` | fired after finance settings are saved |
| `nf`, `F0/F1/F2`, `kwh`, `lei`, `pct` | `ro-RO` number formatting |
| `mk(k, vals, codes)`, `derive(r)`, `sum(rows)` | a row = raw flows `r.v` + derived `prod, cons, ev, house, imp, inj, chg, dis, loss, indep, autoc, any` |
| `money(r, P, PI)`, `gainAt(r, P, PI)` | monthly bill/gain (see the money model in CLAUDE.md); `money` also stores `r.P`, `r.PI` |
| `priceList(f)`, `priceAt(list, 'YYYY-MM')` | price history from `finance` |
| `parseNum(v)`, `numS(n)` | parse Romanian / plain decimals; format with ≥ 2 decimals |
| `CHARTS`, `PAY_CHARTS`, `EV_CHARTS` | chart definitions (below) |
| `EVCS_ST`, `CAR_ST`, `EV_MODES`, `EV_MODE_NOTE`, `dur` | charger / car states in Romanian, charger modes, minutes as text |
| `BAT_DEF`, `ESS_MODES`, `ESS_NOTE`, `BAT_LIMS`, `BAT_NAMES`, `BAT_CODES`, `BAT_CHARTS`, `isDur`, `MONTH_V` | Baterie view: default entities, ESS modes, limits, chart definitions; `MONTH_V` = views navigated by month |
| `rangeChart(W, H, rows, o)` | SVG min–max bars with a mean tick (SoC per day, 0–100 %), same `.hit` / `.hl` hover zones as `barChart` |
| `barChart(W, H, rows, o)` | SVG stacked bars, up and down, optional line, optional dashed forecast line (`dash`: row field) |
| `FC_CHARTS`, `FC_V`, `FC_AHEAD`, `withFc`, `sumK` | VRM forecast: charts (bars = actual, dashed `r.fsol` / `r.fcons`), views with forecast (zi, saptamana, luna), days ahead, rows ← `victron_vrm/forecast` |
| `RAW_CSS` → `CSS` | styles; font sizes rewritten to scale with `--fz` |

## 2. Element lifecycle

- `setConfig`: validates `view`, merges `paths` (defaults: zi, saptamana, luna, an, amortizare, setari), resets the websocket cache.
- `_adopt()`: on a slow refresh HA may set `hass` before the element is defined; the own property is moved back through the setter.
- `connectedCallback`: builds the shadow root once, `ResizeObserver` → `_charts()`, reads `?d=` from the URL, applies font size, subscribes to `FZ_EVENT`, `storage` and `FIN_EVENT`, refreshes every 5 minutes (`_load(true)` only refetches when the shown period includes today).
- `set hass`: first time → `_load()`; afterwards only the settings card reacts (`_syncAuto`, to follow the automation's on/off and last run without re-rendering the form).
- `_ws(msg, live)`: cached websocket calls; live data expires after 5 minutes.
- `_seq` guards against out-of-order responses when the user clicks quickly.

## 3. Period views

- `_range()` gives `{from, to}` for the view and `this._d`; `_shift(±1)` moves by one period; `_sync()` writes `?d=` with `history.replaceState`; `_go(view, d)` pushes a new HA URL and fires `location-changed` (works only inside HA).
- Data: zi → `hours` (24 rows), saptamana/luna → `days`, an → `years` (12 month rows + a "Pe ani" table from `_yearsTable()`).
- `_render()` builds: nav box (title, ‹ Azi/Acum ›) with a summary of rows (`.take > .sum`, one `sumRow(label, value, segs, txt)` each: Producție, Casa, Mașina when there is EV energy, each with a thin stacked bar in `FLOW` colours and its shares), KPI grid with only what the summary does not show (import, injection, battery charge/discharge, losses on Lună/An, independence; production, house, car and self-consumption are left to the summary rows), chart boxes, the detail table (rows drill down: an → luna → zi), and `_foot()` (site, last sync, history start).
- Empty periods show a message instead (or "istoricul se descarcă" during backfill); an empty period with forecast (a future day or week) shows `_renderFc()`: three KPIs, the forecast charts with only the dashed line, a forecast table.
- Forecast: `_load` adds `r.fsol / fcons / fev` through `withFc` (an older integration without the command just gives no forecast). `FC_CHARTS` come first when the period reaches today, last otherwise; `_fcTake()` adds two `fcRow` rows to the summary, Prognoză producție and Prognoză consum: value = forecast for the shown period, progress bar (solid = actual so far ÷ forecast, grey = forecast still to come today or in the days ahead), legend "N% realizat" and the kWh still to come; `_atEnd()` lets › go up to `FC_AHEAD` days ahead on Zi and Săptămână.

## 4. Amortizare (`_renderPay`)

Needs `info` (for `finance` and `start`) and `years`. Without an investment or a valid price list it shows a message with a button to Setări. Otherwise: summary paragraph, progress box, six KPIs (câștig mediu, timp rămas, amortizare estimată, randament anual, fără sistem, cu sistem), the `PAY_CHARTS` chart (gain per month, unit lei), a month table (newest first, rows drill to the month, tooltip with the prices used) and a year table. `this._chartList = PAY_CHARTS` makes `_charts()` draw the right list.

## 4b. Mașina (`_renderEv`)

Month navigation like Lună (`_range`/`_shift` treat `masina` as a month). Order on the page: nav + summary, the live box (`_liveHtml`, wired by `_wireLive`), four KPIs, `EV_CHARTS` (per day of the month; per hour of the day via `rows: 'hod'` from `this._extra.hod`), the month's sessions (`_sessions()`, memoised per websocket answer) a table of every month with charging and one per year with a total row (a click selects that month, or the year's last month). Live entities come from `_evEnt()`; `set hass` calls `_syncLive()`, which swaps only the `.live` box when `_liveKey()` changes and never while the current stepper has an unsent value (`this._evA`). Service calls: `switch.turn_on/off` (charging, auto start), `select.select_option` (mode), `number.set_value` (current); errors show in `.ev-st`.

## 4c. Baterie (`_renderBat`)

Month navigation like Mașina. Order: nav + summary, the live box (`_batLiveHtml`, wired by `_wireBat`, refreshed by `_syncBat`), four KPIs (charge, discharge, share of consumption from the battery, full cycles or efficiency), `BAT_CHARTS` (per day, per hour of day from `this._extra.hod`, SoC per day from `this._extra.soc` drawn by `rangeChart` when a chart has `kind: 'soc'`), a day table (newest first, click → Zi) and month / year tables from `victron_vrm/years`. `_socStats()` calls `recorder/statistics_during_period` directly (not through `_ws`, which adds `entry_id`) and caches by entity and range; failures give `null` and hide the SoC chart. Min SoC: `.bat-ms` range (step 10) + `.bat-mi` text field, both through `send()` in `_wireBat`. Confirmations use the `.cf` bar inside the live box (`ask(text, fn)` in `_wireBat`); status messages go to the current `.live .bat-st`, since the box may be replaced while a command runs.

## 5. Setări (`_renderSettings`)

Two columns (`.set > .col`): left = Mărime text + Notificări, right = Investiție și prețuri (`_finBox`) + Sincronizare VRM. Pieces:
- Font size: segmented buttons → `saveFz` + `FZ_EVENT` (every card on the page rescales).
- Notifications: needs `automation:` in the card config; switch → `automation.turn_on/off`; "Trimite acum" → `automation.trigger` with `skip_condition: true`; last run from `last_triggered`.
- Finance: investment field; price table from `_priceRows(rows, admin)` with a header row `.pr.ph`, first row "de la început", later rows `type=month` + two decimal fields + delete; "+ Adaugă un preț" adds a row from the current month (or the first free month after the last) copying the last prices; "Salvează" validates (month format, unique months, numbers ≥ 0), calls `victron_vrm/finance`, redraws the list and the investment field from the response, writes the status line, dispatches `FIN_EVENT`. Non-admins see disabled fields and a note.
- Sync info from `victron_vrm/info`, plus the card `VERSION`.

## 6. Charts

A chart definition:
```js
{ id: 'cg', ttl: 'Rețea', note: 'În sus import, în jos injecție',
  up: ['Gc', 'Gb'], down: ['Pg', 'Bg'], line: 'prod',   // stacks above / below zero, optional line field
  names: { Gc: 'Import pentru consum', ... },          // legend + tooltip labels
  unit: 'lei', num: lei,                               // optional, default kWh / kwh()
  ev: true,                                            // only when the period has EV energy
  rows: 'hod', drill: null }                           // optional: another row set (this._extra[rows]) and click target
```
`_box(c)` renders title, note, ⇔ / ⛶ buttons, legend with totals (`_legend`) and the `.ch` container; `_charts()` redraws only containers whose width changed; `_draw()` calls `barChart` with per-view bar widths and wires hover tooltips and click-to-drill. Fullscreen (`_openFs/_closeFs`) clones the chart into an overlay on `document.body` with its own shadow root and the same CSS; Esc or ✕ closes it.

Chart conventions: thin bars with rounded top, 1px surface gap between stacked segments, recessive grid, axis labels in `C.muted`, hover highlight + tooltip on every bar, legends always shown, colours from `FLOW` only.

## 7. CSS conventions

- Boxes: `.box` (panel, 1px border, radius 6, padding 16). Titles `.ttl` 16px/500, notes `.note` 13px muted. KPI grid `.kpis` with `--k` columns.
- Controls: `.btn` (outlined, min-height 36), `.btn.pri` (filled `#2f72d0`), `.tb` (32px icon button), `.seg` (segmented), `.sw` (switch with `role=switch` + `aria-checked`), `.fld` (label + input), `.pr` (price row grid).
- Focus: 2px `C.focus` outline on buttons and inputs (`:focus-visible`).
- Phones: `@media (max-width:700px)` shrinks padding and headings, hides `.hn`, shows `.hm`; `@media (max-width:480px)` tightens the price table.
- Write font sizes as plain `font-size:Npx`; the `CSS` constant rewrites them to follow `--fz`. Sizes inside SVG are computed from `fz` in `barChart`.

## 8. Recipes

**New KPI on the period views:** compute it in `derive()` if it is a flow formula (keep `summary.py` in sync if the notification should show it), add a `kpi(...)` call in `_render()`, adjust `nk` so the grid keeps even rows, check 375px.

**New chart:** add an entry to `CHARTS` (or `PAY_CHARTS`), pick colours already in `FLOW` or validate new ones, make sure every key in `up/down` exists on `r.v`.

**New page:** a new `view` value (allow it in `setConfig` and in default `paths`), a `_renderX()` branch in `_load()`, then a dashboard view holding `{type: custom:victron-vrm-card, view: <name>, grid_options: {columns: full, rows: auto}}` (append it; don't rewrite the other views).

**New setting stored in HA:** add the key to the config entry options through a websocket command in `websocket.py` (admin only, voluptuous schema, return the stored value), expose it in `ws_info`, read it in the card from `this._info`, and fire an event if other cards must react.
