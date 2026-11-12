/* victron-vrm-card — Zi / Săptămână / Lună / An din istoricul VRM salvat de integrarea victron_vrm */
(() => {
const VERSION = '0.15.0';
// casetele (C.panel = cea implicită din PANELS) stau pe fundalul temei; contrast față de cea mai deschisă (#464646): fg 9,3:1 · soft 5,8:1 · muted 4,5:1 (AA) · ctl 3,0:1 (marginea controalelor)
const C = { page: '#0b0b0b', panel: '#3c3c3c', border: '#333333', fg: '#ffffff', soft: '#c7c7c7', muted: '#b5b5b5',
  ctl: '#939393', grid: '#2a2a2a', axis: '#4a4a4a', pop: '#262626', sel: '#3987e5', focus: '#5aa0f0' };
// fontul interfeței Home Assistant, cu cifre de lățime egală pentru valori
const FONT = "var(--ha-font-family-body, Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif)";
// fiecare flux are aceeași culoare în toate graficele
const FLOW = { Pc: '#199e70', Pb: '#c98500', Pg: '#9085e9', Bc: '#3987e5', Bg: '#d55181', Gc: '#d03b3b', Gb: '#3fae3f',
  Pe: '#199e70', Be: '#3987e5', Ge: '#d03b3b' };
// consumul casei fără mașină (hPc = solar direct în casă etc.) păstrează culoarea sursei
FLOW.hPc = FLOW.Pc; FLOW.hBc = FLOW.Bc; FLOW.hGc = FLOW.Gc;
// amortizare: economia din autoconsum ia culoarea solarului consumat direct, injecția pe a injecției
FLOW.eco = FLOW.Pc; FLOW.injv = FLOW.Pg;
const BASE = ['Pc', 'Pb', 'Pg', 'Bc', 'Bg', 'Gc', 'Gb', 'Pe', 'Be', 'Ge'];
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const ZILE_S = ['dum.', 'lun.', 'mar.', 'mie.', 'joi', 'vin.', 'sâm.'];
const LUNI = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const LUNI_L = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const VIEWS = ['zi', 'saptamana', 'luna', 'an'];
// pictograme MDI: arrow-expand-horizontal, arrow-collapse-horizontal, fullscreen, close
const ICON = { wide: 'M9,11H15V8L19,12L15,16V13H9V16L5,12L9,8V11M2,20V4H4V20H2M20,20V4H22V20H20Z',
  narrow: 'M13,20V4H15.03V20H13M10,20V4H12.03V20H10M5,8L9.03,12L5,16V13H2V11H5V8M20,16L16,12L20,8V11H23V13H20V16Z',
  full: 'M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z' };
// pe telefon antetele tabelelor sunt prescurtate, ca toate coloanele să încapă pe lățime
const th = (full, short, unit = '', cls = '') => `<th${cls ? ` class="${cls}"` : ''}><span class="hn">${full}</span><span class="hm">${short}</span>${unit ? `<small>${unit}</small>` : ''}</th>`;
const HEAD = (ev) => `${th('Producție', 'Prod.', 'kWh')}${th('Casă', 'Casă', 'kWh')}${ev ? th('Mașină', 'Maș.', 'kWh') : ''}${th('Import', 'Imp.', 'kWh')}${th('Injecție', 'Inj.', 'kWh')}${th('Încărcare', '', 'kWh', 'hn')}${th('Descărcare', '', 'kWh', 'hn')}${th('Independență', 'Indep.', '%')}${th('Autoconsum', '', '%', 'hn')}`;
const svgI = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
// graficele lățite se țin minte în browser (preferință per vizitator)
const WIDE_KEY = 'victron-vrm-wide';
const loadWide = () => { try { return new Set(JSON.parse(localStorage.getItem(WIDE_KEY) || '[]')); } catch (e) { return new Set(); } };
const saveWide = (set) => { try { localStorage.setItem(WIDE_KEY, JSON.stringify([...set])); } catch (e) { /* stocare indisponibilă */ } };
// mărimea textului, tot per dispozitiv (pe telefon poate fi alta decât pe desktop)
const FZ_KEY = 'victron-vrm-fz';
const FZ = [['Mică', 0.9], ['Normală', 1], ['Mare', 1.15], ['Foarte mare', 1.3]];
const loadFz = () => { try { const v = +localStorage.getItem(FZ_KEY); return FZ.some((f) => f[1] === v) ? v : 1; } catch (e) { return 1; } };
const saveFz = (v) => { try { localStorage.setItem(FZ_KEY, String(v)); } catch (e) { /* stocare indisponibilă */ } };
const FZ_EVENT = 'victron-vrm-fz';
const FIN_EVENT = 'victron-vrm-finance';
// culoarea casetelor: aceeași pe toate dispozitivele (opțiunile integrării, victron_vrm/panel),
// ținută și în localStorage ca pagina să nu clipească la încărcare; lista e și în const.py
const PANELS = [['Negru', '#1f1f1f'], ['Grafit', '#2e2e2e'], ['Gri', '#3c3c3c'], ['Gri deschis', '#464646']];
const PANEL_DEF = '#3c3c3c', PANEL_KEY = 'victron-vrm-panel', PANEL_EVENT = 'victron-vrm-panel';
const okPanel = (v) => (PANELS.some((p) => p[1] === v) ? v : PANEL_DEF);
let PANEL = null;
const loadPanel = () => { if (!PANEL) { try { PANEL = okPanel(localStorage.getItem(PANEL_KEY)); } catch (e) { PANEL = PANEL_DEF; } } return PANEL; };
const savePanel = (v) => { PANEL = v; try { localStorage.setItem(PANEL_KEY, v); } catch (e) { /* stocare indisponibilă */ } };
const nf = (d) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const F0 = nf(0).format, F1 = nf(1).format, F2 = nf(2).format;
const lei = (v) => (Math.abs(v) >= 1000 ? F0(v) : F2(v));
const kwh = (v) => (v >= 100 ? F0(v) : F1(v));
const pct = (v) => (isFinite(v) ? F0(v * 100) + '%' : '—');
const pctN = (v) => (isFinite(v) ? F0(v * 100) : '—');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// valoare cu unitatea mică alături, pentru rezumat
const kwU = (x) => `${kwh(x)}<small>kWh</small>`;
// un rând din rezumatul perioadei: etichetă, valoare, bară pe surse (segs: [valoare, culoare, nume]) și procentele
const sumRow = (k, n, segs = [], txt = []) => {
  const tot = segs.reduce((a, g) => a + Math.max(0, g[0]), 0);
  const bar = segs.length && tot > 0 ? `<div class="bar">${segs.map(([x, c]) => (x > 0 ? `<span style="flex:${(x / tot).toFixed(4)} 0 0;background:${c}"></span>` : '')).join('')}</div>` : '';
  const p = [...segs.map(([x, c, w]) => `<span><i style="background:${c}"></i><b>${tot > 0 ? pct(Math.max(0, x) / tot) : '—'}</b> ${w}</span>`), ...txt.map((x) => `<span>${x}</span>`)];
  return `<div class="k">${k}</div><div class="n">${n}</div><div class="r">${bar}<div class="p">${p.join('')}</div></div>`;
};
// un rând de prognoză: valoarea prognozată, bara de progres (plin = real, punctat = ce mai urmează după prognoză)
const fcRow = (k, f, done, left, pc, pw, lw) => {
  const a = f > 0 ? Math.min(1, Math.max(0, done) / f) : 0, b = f > 0 && lw ? Math.min(1 - a, left / f) : 0;
  const bar = `<div class="bar"><span style="flex:${a.toFixed(4)} 0 0;background:${C.soft}"></span>${b > 0 ? `<span class="fl" style="flex:${b.toFixed(4)} 0 0"></span>` : ''}<span style="flex:${Math.max(0, 1 - a - b).toFixed(4)} 0 0"></span></div>`;
  const p = (pc ? `<span><i style="background:${C.soft}"></i><b>${pc}</b> ${pw}</span>` : '') + (lw ? `<span><i class="fl"></i><b>${kwh(left)} kWh</b> ${lw}</span>` : '');
  return `<div class="k">${k}</div><div class="n">${kwU(f)}</div><div class="r">${bar}<div class="p">${p}</div></div>`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const stamp = (t) => { if (!t) return 'niciodată'; const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}, ${d.getDate()} ${LUNI[d.getMonth()]} ${d.getFullYear()}`; };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

// un rând = valorile brute VRM + mărimile derivate
function mk(k, vals, codes) {
  const v = Object.fromEntries(BASE.map((c) => [c, 0]));
  codes.forEach((c, i) => { v[c] = Math.max(0, Number(vals ? vals[i] : 0) || 0); });
  return derive({ k, v });
}
// Pe/Be/Ge (spre mașină) fac parte din Pc/Bc/Gc: stația e un consumator pe ieșirea AC
function derive(r) {
  const v = r.v;
  v.hPc = Math.max(0, v.Pc - v.Pe); v.hBc = Math.max(0, v.Bc - v.Be); v.hGc = Math.max(0, v.Gc - v.Ge);
  r.prod = v.Pc + v.Pb + v.Pg; r.cons = v.Pc + v.Bc + v.Gc;
  r.ev = v.Pe + v.Be + v.Ge; r.house = v.hPc + v.hBc + v.hGc;
  r.imp = v.Gc + v.Gb; r.inj = v.Pg + v.Bg;
  r.chg = v.Pb + v.Gb; r.dis = v.Bc + v.Bg;
  // tot ce intră (producție + import) minus tot ce iese (consum + injecție): VRM pune pierderile
  // invertoarelor și ale bateriei pe fluxurile bateriei; are sens doar pe o lună sau mai mult
  r.loss = r.chg - r.dis;
  r.indep = r.cons > 0 ? (v.Pc + v.Bc) / r.cons : NaN;
  r.autoc = r.prod > 0 ? (v.Pc + v.Pb) / r.prod : NaN;
  r.any = BASE.some((c) => v[c] > 0);
  return r;
}
function sum(rows, k = 'p') {
  const v = Object.fromEntries(BASE.map((c) => [c, 0]));
  for (const r of rows) for (const c of BASE) v[c] += r.v[c];
  return derive({ k, v });
}

// Câștigul unei perioade față de situația fără sistem, cu compensarea lunară import / injecție:
//   economii = energia consumată fără s-o cumperi (Pc + Bc − Gb = consum − import) × preț consum
//   injecție = energia injectată × preț injecție
// Suma lor e exact factura fără sistem minus factura cu sistem, oricare ar fi raportul import / injecție.
const gainAt = (r, P, PI) => Math.max(0, r.v.Pc + r.v.Bc - r.v.Gb) * P + r.inj * PI;
function money(r, P, PI) {
  const comp = Math.min(r.imp, r.inj);
  r.P = P; r.PI = PI;
  r.v.eco = Math.max(0, r.v.Pc + r.v.Bc - r.v.Gb) * P;
  r.v.injv = r.inj * PI;
  r.gain = r.v.eco + r.v.injv;
  r.billNo = r.cons * P;
  // negativ când injecția compensată depășește costul importului
  r.bill = comp * (P - PI) + (r.imp - comp) * P - Math.max(0, r.inj - r.imp) * PI;
  return r;
}
// prețurile pe perioade, crescător după luna de început; prima se aplică de la început
function priceList(f) {
  const l = Array.isArray(f.prices) && f.prices.length ? f.prices
    : f.price_import != null || f.price_export != null ? [{ from: null, import: f.price_import, export: f.price_export }] : [];
  return l.slice().sort((a, b) => (a.from || '').localeCompare(b.from || ''));
}
// acceptă 81.246,17 / 81246,17 / 81246.17; null pentru câmp gol, NaN pentru text greșit
function parseNum(v) {
  let raw = String(v).replace(/\s/g, '');
  if (raw === '') return null;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  return Number(raw);
}
// 89.229,83 / 1,11 / 0,4512: cel puțin două zecimale, fără să piardă din cele introduse
const numS = (n) => (n == null ? '' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n));
const priceAt = (list, k) => { let p = list[0]; for (const q of list) if (!q.from || q.from <= k) p = q; return p; };
// stația de încărcare (Victron EVCS) și mașina: stările din HA, în română
const EVCS_ST = { disconnected: 'Mașina nu e conectată', connected: 'Conectată, nu încarcă', charging: 'Încarcă', charged: 'Încărcare terminată',
  waiting_for_sun: 'Așteaptă surplus solar', waiting_for_rfid: 'Așteaptă cardul RFID', waiting_for_start: 'Așteaptă pornirea',
  low_soc: 'Bateria casei e prea descărcată', ground_test_error: 'Eroare la testul de împământare', welded_contacts_test_error: 'Eroare: contacte sudate',
  cp_input_test_error: 'Eroare la semnalul CP', residual_current_detected: 'Curent rezidual detectat', undervoltage_detected: 'Tensiune prea mică',
  overvoltage_detected: 'Tensiune prea mare', overheating_detected: 'Supraîncălzire', charging_limit: 'Limita de încărcare atinsă',
  start_charging: 'Pornește încărcarea', switching_to_3_phase: 'Trece pe trei faze', switching_to_1_phase: 'Trece pe o fază' };
const CAR_ST = { not_charging: 'nu se încarcă', low_power_mode: 'consum redus', charging: 'se încarcă', sustain: 'menține nivelul', wake_up: 'se trezește',
  blocked: 'încărcare blocată', unavailable: 'indisponibilă', discharging: 'se descarcă', scheduled_charging: 'încărcare programată' };
const EV_MODES = [['manual', 'Manual'], ['auto', 'Automat'], ['scheduled_charge', 'Programat']];
const EV_MODE_NOTE = { manual: 'Mod manual: pornești și oprești tu, cu curentul ales', auto: 'Mod automat: încarcă din surplusul solar',
  scheduled_charge: 'Mod programat: încarcă în intervalul setat în stație' };
const EV_NAMES = { Pe: 'Din solar', Be: 'Din baterie', Ge: 'Din rețea' };
const EV_CHARTS = [
  { id: 'ed', ttl: 'Pe zile', note: 'Energia primită de mașină, după sursă', up: ['Pe', 'Be', 'Ge'], names: EV_NAMES, drill: 'zi' },
  { id: 'eh', ttl: 'Pe ore din zi', note: 'Când s-a încărcat mașina în această lună, adunat pe ore', up: ['Pe', 'Be', 'Ge'], names: EV_NAMES, rows: 'hod', drill: null },
];
const dur = (m) => (!isFinite(m) ? '—' : m < 60 ? `${F0(m)} min` : `${Math.floor(m / 60)} h ${p2(Math.round(m % 60))} min`);
// bateria casei: entitățile victron_gx (implicit cele ale dispozitivului GX; `battery:` din configurație le poate înlocui)
const BAT_DEF = { soc: 'sensor.gx_device_dc_battery_charge', reserve: 'sensor.gx_device_active_soc_limit', mode: 'select.gx_device_ess_mode',
  minsoc: 'number.gx_device_ess_min_soc_limit', force: 'switch.ess_force_charge', maxI: 'number.gx_device_ess_max_charge_current',
  maxC: 'number.gx_device_ess_max_charge_power_limit', maxInv: 'number.gx_device_ess_max_inverter_power_limit', maxFeed: 'number.gx_device_ess_max_feed_in_power' };
const ESS_MODES = [['optimized_battery_life', 'Cu BatteryLife'], ['optimized_no_battery_life', 'Optimizat'], ['keep_batteries_charged', 'Menține încărcată']];
const ESS_NOTE = { optimized_battery_life: 'Optimizat cu BatteryLife: rezerva urcă și coboară singură, ca bateria să ajungă des la 100%',
  optimized_no_battery_life: 'Optimizat: bateria alimentează casa până la SoC-ul minim', keep_batteries_charged: 'Menține încărcată: bateria e folosită doar când pică rețeaua',
  external_control: 'Control extern: ESS e comandat din afara GX-ului' };
// limitele ESS: -1 înseamnă fără limită; al patrulea câmp e o explicație sub câmp
const BAT_LIMS = [['maxI', 'Curent maxim de încărcare', 'A', ''], ['maxC', 'Putere maximă de încărcare', 'W', ''],
  ['maxInv', 'Putere maximă de descărcare', 'W', 'Limita invertorului din ESS: cât scoate din baterie spre consum (include și solarul de pe DC)'], ['maxFeed', 'Injecție maximă în rețea', 'W', '']];
const BAT_NAMES = { Pb: 'Încărcare din solar', Gb: 'Încărcare din rețea', Bc: 'Descărcare spre consum', Bg: 'Descărcare în rețea' };
const BAT_CODES = ['Pb', 'Gb', 'Bc', 'Bg'];
const BAT_CHARTS = [
  { id: 'bd', ttl: 'Pe zile', note: 'În sus încărcare, în jos descărcare', up: ['Pb', 'Gb'], down: ['Bc', 'Bg'], names: BAT_NAMES, drill: 'zi' },
  { id: 'bh', ttl: 'Pe ore din zi', note: 'Când se încarcă și când se descarcă bateria în această lună, adunat pe ore', up: ['Pb', 'Gb'], down: ['Bc', 'Bg'], names: BAT_NAMES, rows: 'hod', drill: null },
  { id: 'bs', kind: 'soc', ttl: 'Stare de încărcare', note: 'Pe fiecare zi, de la minim la maxim; linia albă e media zilei', rows: 'soc', drill: 'zi' },
];
// o durată reală începe cu o cifră („5h 47min”); orice altceva e un mesaj al senzorului
const isDur = (s) => /^\d/.test(String(s || ''));
const MONTH_V = ['luna', 'masina', 'baterie'];

// starea de încărcare pe zile: bară de la minim la maxim, linie la medie; aceleași zone de hover ca barChart
function rangeChart(W, H, rows, o) {
  const fz = o.fz || 1, fs = Math.round(12 * fz);
  const ml = Math.round(44 * fz), mr = 8, mt = Math.round(24 * fz), mb = Math.round(26 * fz), iw = W - ml - mr, ih = H - mt - mb;
  const y = (v) => mt + ih * (100 - Math.max(0, Math.min(100, v))) / 100;
  const step = iw / Math.max(1, rows.length), bw = Math.max(2, Math.min(o.maxBar || 16, step * 0.72)), rr = Math.min(3, bw / 2);
  let g = '';
  for (const v of [0, 25, 50, 75, 100]) {
    g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? C.grid : C.axis}" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y(v) + fs * 0.36}" text-anchor="end" fill="${C.muted}" font-size="${fs}">${v}</text>`;
  }
  g += `<text x="${ml - 6}" y="${fs}" text-anchor="end" fill="${C.muted}" font-size="${fs}">%</text>`;
  if (isFinite(o.ref)) g += `<line x1="${ml}" x2="${W - mr}" y1="${y(o.ref)}" y2="${y(o.ref)}" stroke="${C.soft}" stroke-width="1" stroke-dasharray="4 4"/>`;
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(iw / ((o.labelW || 34) * fz)))));
  rows.forEach((r, i) => {
    const x = ml + i * step + (step - bw) / 2;
    if (isFinite(r.smin) && isFinite(r.smax)) {
      const top = y(r.smax), h = Math.max(3, y(r.smin) - top);
      g += `<rect x="${x}" y="${top}" width="${bw}" height="${h}" rx="${rr}" fill="${FLOW.Bc}"/>`;
      if (isFinite(r.smean)) g += `<line x1="${x - 1}" x2="${x + bw + 1}" y1="${y(r.smean)}" y2="${y(r.smean)}" stroke="${C.fg}" stroke-width="2" stroke-linecap="round"/>`;
    }
    if (i % every === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" fill="${C.muted}" font-size="${fs}">${o.label(r)}</text>`;
  });
  rows.forEach((r, i) => { g += `<rect class="hit" data-i="${i}" x="${ml + i * step}" y="${mt}" width="${step}" height="${ih}" fill="transparent"${o.click ? ' style="cursor:pointer"' : ''}/>`; });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect class="hl" x="0" y="${mt}" width="${step}" height="${ih}" fill="#ffffff" opacity="0" pointer-events="none"/>${g}</svg>`;
}
const PAY_CHARTS = [
  { id: 'cm', ttl: 'Câștig pe luni', note: 'Energia consumată fără s-o cumperi, plus valoarea energiei injectate', up: ['eco', 'injv'], unit: 'lei', num: lei,
    names: { eco: 'Economii din autoconsum', injv: 'Valoarea injecției' } },
];

// bare stivuite în sus / în jos, cu linie opțională; întoarce SVG
function barChart(W, H, rows, o) {
  const up = o.up || [], down = o.down || [], line = o.line, fz = o.fz || 1, fs = Math.round(12 * fz);
  const ml = Math.round(44 * fz), mr = 8, mt = o.unit ? Math.round(24 * fz) : 10, mb = Math.round(26 * fz), iw = W - ml - mr, ih = H - mt - mb;
  const val = (r, c) => r.v[c];
  const dash = o.dash;
  const maxUp = Math.max(0.1, ...rows.map((r) => Math.max(up.reduce((a, c) => a + val(r, c), 0), line ? r[line] : 0, dash && isFinite(r[dash]) ? r[dash] : 0)));
  const maxDn = down.length ? Math.max(0.1, ...rows.map((r) => down.reduce((a, c) => a + val(r, c), 0))) : 0;
  const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; };
  const top = nice(maxUp), bot = down.length ? nice(maxDn) : 0;
  const y = (v) => mt + ih * (top - v) / (top + bot);
  const step = iw / Math.max(1, rows.length), bw = Math.max(2, Math.min(o.maxBar || 24, step * 0.72));
  const tick = nice((top + bot) / 5), tf = tick < 1 ? F1 : F0, vals = [];
  for (let v = 0; v <= top + 1e-9; v += tick) vals.push(v);
  for (let v = -tick; v >= -bot - 1e-9; v -= tick) vals.push(v);
  let g = '';
  for (const v of vals) {
    g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y(v) + fs * 0.36}" text-anchor="end" fill="${C.muted}" font-size="${fs}">${tf(Math.abs(v))}</text>`;
  }
  if (o.unit) g += `<text x="${ml - 6}" y="${fs}" text-anchor="end" fill="${C.muted}" font-size="${fs}">${o.unit}</text>`;
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(iw / ((o.labelW || 46) * fz)))));
  const rr = Math.min(3, bw / 2);
  rows.forEach((r, i) => {
    const x = ml + i * step + (step - bw) / 2;
    let acc = 0;
    const ups = up.filter((c) => val(r, c) > 0);
    // 1px de suprafață între segmente
    ups.forEach((c, j) => { const v = val(r, c), h = y(acc) - y(acc + v); g += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${Math.max(0, h - (j ? 1 : 0))}" fill="${FLOW[c]}"${j === ups.length - 1 ? ` rx="${rr}"` : ''}/>`; acc += v; });
    acc = 0;
    const dns = down.filter((c) => val(r, c) > 0);
    dns.forEach((c, j) => { const v = val(r, c), h = y(-acc - v) - y(-acc); g += `<rect x="${x}" y="${y(-acc) + (j ? 1 : 0)}" width="${bw}" height="${Math.max(0, h - (j ? 1 : 0))}" fill="${FLOW[c]}"${j === dns.length - 1 ? ` rx="${rr}"` : ''}/>`; acc += v; });
    if (i % every === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" fill="${C.muted}" font-size="${fs}">${o.label(r)}</text>`;
  });
  if (line && rows.length) {
    // linia trece doar prin rândurile cu date (lunile fără istoric rămân goale)
    const pts = rows.map((r, i) => (r.any ? `${ml + i * step + step / 2},${y(r[line])}` : null)).filter(Boolean);
    g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.fg}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (rows.length <= 14) rows.forEach((r, i) => { if (r.any) g += `<circle cx="${ml + i * step + step / 2}" cy="${y(r[line])}" r="4" fill="${C.fg}" stroke="${C.panel}" stroke-width="2"/>`; });
  }
  if (dash) {
    // prognoza, punctată: trece prin toate rândurile care au prognoză, și prin cele fără date reale
    const pts = rows.map((r, i) => (isFinite(r[dash]) ? `${ml + i * step + step / 2},${y(r[dash])}` : null)).filter(Boolean);
    if (pts.length) g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.fg}" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  g += `<line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" stroke="${C.axis}" stroke-width="1"/>`;
  rows.forEach((r, i) => { g += `<rect class="hit" data-i="${i}" x="${ml + i * step}" y="${mt}" width="${step}" height="${ih}" fill="transparent"${o.click ? ' style="cursor:pointer"' : ''}/>`; });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect class="hl" x="0" y="${mt}" width="${step}" height="${ih}" fill="#ffffff" opacity="0" pointer-events="none"/>${g}</svg>`;
}

const CHARTS = [
  { id: 'cs', ttl: 'Consum casă după sursă', note: 'De unde a venit energia folosită în casă, fără mașină; linia arată producția', up: ['hPc', 'hBc', 'hGc'], line: 'prod',
    names: { hPc: 'Solar direct', hBc: 'Din baterie', hGc: 'Din rețea' } },
  { id: 'cg', ttl: 'Rețea', note: 'În sus import, în jos injecție', up: ['Gc', 'Gb'], down: ['Pg', 'Bg'],
    names: { Gc: 'Import pentru consum', Gb: 'Import pentru baterie', Pg: 'Injecție din solar', Bg: 'Injecție din baterie' } },
  { id: 'cp', ttl: 'Unde a mers producția', note: 'Energia produsă de panouri, după destinație', up: ['Pc', 'Pb', 'Pg'],
    names: { Pc: 'Consumată direct', Pb: 'În baterie', Pg: 'În rețea' } },
  { id: 'cb', ttl: 'Baterie', note: 'În sus încărcare, în jos descărcare; diferența include pierderile invertoarelor și ale conversiilor, nu doar ale bateriei', up: ['Pb', 'Gb'], down: ['Bc', 'Bg'],
    names: { Pb: 'Încărcare din solar', Gb: 'Încărcare din rețea', Bc: 'Descărcare spre consum', Bg: 'Descărcare în rețea' } },
  { id: 'ce', ttl: 'Stația de încărcare', note: 'Energia primită de mașină, după sursă', up: ['Pe', 'Be', 'Ge'], ev: true,
    names: { Pe: 'Din solar', Be: 'Din baterie', Ge: 'Din rețea' } },
];
// prognoza VRM: barele arată realul, linia punctată prognoza (r.fsol / r.fcons, kWh)
const FC_CHARTS = [
  { id: 'fp', ttl: 'Producție față de prognoză', note: 'Barele arată producția reală, linia punctată prognoza VRM', up: ['Pc', 'Pb', 'Pg'], dash: 'fsol', dashName: 'Prognoză producție',
    names: { Pc: 'Consumată direct', Pb: 'În baterie', Pg: 'În rețea' } },
  { id: 'fk', ttl: 'Consum față de prognoză', note: 'Barele arată consumul real, cu mașina; linia punctată prognoza VRM', up: ['Pc', 'Bc', 'Gc'], dash: 'fcons', dashName: 'Prognoză consum',
    names: { Pc: 'Din solar', Bc: 'Din baterie', Gc: 'Din rețea' } },
];
// vederile cu prognoză și câte zile după azi are prognoză (integrarea citește azi + 7 zile)
const FC_V = ['zi', 'saptamana', 'luna'];
const FC_AHEAD = 7;
// pune prognoza pe rânduri: pe Zi orele zilei, altfel totalul fiecărei zile
function withFc(rows, fc, v, day) {
  if (!fc || !fc.days) return;
  const at = (vals, r) => { if (!vals) return; r.fsol = +vals[0] || 0; r.fcons = +vals[1] || 0; r.fev = +vals[2] || 0; };
  if (v === 'zi') { const d = fc.days[day]; if (d) rows.forEach((r) => at(d.h[r.k] || [0, 0, 0], r)); return; }
  rows.forEach((r) => at(fc.days[r.k] && fc.days[r.k].t, r));
}
const sumK = (rows, k) => rows.reduce((a, r) => a + (isFinite(r[k]) ? r[k] : 0), 0);

const RAW_CSS = `
:host{display:block}
.w{max-width:1404px;margin:0 auto;font-family:${FONT};-webkit-font-smoothing:antialiased;color:${C.fg};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.box{background:var(--vrm-panel,${C.panel});border:1px solid ${C.border};border-radius:6px;padding:16px;position:relative}
.nav{display:flex;align-items:center;gap:8px}
.nav .t{font-size:24px;font-weight:500;letter-spacing:-.01em;flex:1;min-width:0}
.nav .bt{display:flex;gap:8px;flex-shrink:0}
.nav button{background:transparent;color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;height:36px;min-width:36px;padding:0 12px;font:inherit;font-size:15px;cursor:pointer}
.nav button:hover:not(:disabled){background:rgba(255,255,255,.08)}
.nav button:disabled{opacity:.35;cursor:default}
.take{font-size:15px;line-height:1.6;color:${C.soft};margin-top:8px}
.take b{color:${C.fg};font-weight:500}
.sum{display:grid;grid-template-columns:auto auto 1fr;gap:12px 16px;align-items:center;margin-top:12px;max-width:880px;line-height:1.3}
.sum .k{color:${C.muted};font-size:14px}
.sum .n{color:${C.fg};font-size:17px;font-weight:500;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sum .n small{color:${C.muted};font-size:13px;font-weight:400;margin-left:3px}
.sum .r{min-width:0}
.sum .bar{display:flex;gap:1px;height:6px;border-radius:3px;overflow:hidden;background:${C.grid};margin-bottom:5px}
.sum .bar span{display:block;height:100%}
.sum .p{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:14px;color:${C.soft};line-height:1.4}
.sum .p b{color:${C.fg};font-weight:500;font-variant-numeric:tabular-nums}
.sum .p i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:0}
.sum .fl{background:#5c5c5c}
h2{font-size:18px;font-weight:500;margin:10px 0 0;color:${C.fg}}
h2 small{font-weight:400;color:${C.muted};font-size:14px;margin-left:8px}
.ttl{color:${C.fg};font-size:16px;font-weight:500;margin:0 0 4px}
.note{color:${C.muted};font-size:13px;line-height:1.45;margin:0 0 10px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(calc(132px * var(--fz,1)),calc((100% - (var(--k,8) - 1) * 12px) / var(--k,8))),1fr));gap:12px}
.kpi .l{color:${C.muted};font-size:13px}
.kpi .v{font-size:28px;font-weight:500;letter-spacing:-.01em;margin-top:6px;font-variant-numeric:tabular-nums}
.kpi .u{color:${C.muted};font-size:13px;font-weight:400;letter-spacing:0;margin-left:4px}
.kpi .s{color:${C.muted};font-size:13px;line-height:1.4;margin-top:4px}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:${C.muted};margin-bottom:8px}
.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.leg i.ln{height:2px;vertical-align:3px}
.leg i.dash,.tip i.dash{width:14px;height:2px;vertical-align:3px;border-radius:0;background:repeating-linear-gradient(90deg,${C.fg} 0 5px,transparent 5px 8px)}
.leg b{color:${C.fg};font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}
.ch{position:relative;min-height:220px}
.ch svg{display:block}
.tip{position:absolute;pointer-events:none;background:${C.pop};border:1px solid ${C.ctl};border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.45);padding:6px 10px;font-size:13px;line-height:1.45;white-space:nowrap;z-index:2;color:${C.fg}}
.tip .d{color:${C.muted};margin-bottom:2px}
.tip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums;color:${C.fg}}
th{color:${C.muted};font-weight:500;font-size:13px;text-align:right;padding:6px 8px;border-bottom:1px solid ${C.border};vertical-align:bottom}
th small{display:block;font-weight:400;font-size:12px;margin-top:1px}
td{text-align:right;padding:7px 8px;border-bottom:1px solid ${C.border}}
th:first-child,td:first-child{text-align:left}
tfoot td{font-weight:500;border-bottom:none;border-top:1px solid ${C.axis}}
tr.go{cursor:pointer}
tr.go:hover td{background:rgba(255,255,255,.04)}
tr.sel td{background:rgba(57,135,229,.14)}
tr.sel td:first-child{box-shadow:inset 3px 0 0 ${C.sel}}
tr.nil td{color:${C.muted}}
.box.wide{grid-column:1/-1}
.hd{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
.tools{display:flex;gap:6px;flex-shrink:0}
.tb{background:transparent;border:1px solid ${C.ctl};border-radius:6px;width:32px;height:32px;padding:0;color:${C.muted};cursor:pointer;display:grid;place-items:center}
.tb:hover{color:${C.fg};background:rgba(255,255,255,.08)}
.tb svg{width:18px;height:18px;fill:currentColor}
.fs{position:fixed;inset:0;z-index:2147483000;background:var(--primary-background-color,${C.page});color:${C.fg};font-family:${FONT};display:flex;flex-direction:column;box-sizing:border-box;
  padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))}
.fs .ttl{font-size:18px}
.fs .ch{flex:1 1 auto;min-height:0}
.hm{display:none}
.msg{color:${C.muted};font-size:15px;padding:30px;text-align:center}
.foot{color:${C.muted};font-size:13px;text-align:right}
.set{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:12px;align-items:start}
.set>.col{display:grid;gap:12px;align-content:start;min-width:0}
.seg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.seg button{background:transparent;color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;min-height:36px;padding:0 14px;font:inherit;font-size:15px;cursor:pointer}
.seg button:hover{background:rgba(255,255,255,.08)}
.seg button[aria-pressed="true"]{border-color:${C.sel};background:rgba(57,135,229,.18)}
.seg button[data-panel]:disabled{cursor:default;opacity:.6}
.swc{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.55);vertical-align:-3px;margin-right:8px;box-sizing:border-box}
.pst:empty{display:none}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}
.row .l{font-size:15px}
.sw{position:relative;width:46px;height:26px;border-radius:13px;border:1px solid ${C.ctl};background:#262626;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
.sw::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#bbb;transition:transform .15s}
.sw[aria-checked="true"]{background:${C.sel};border-color:${C.sel}}
.sw[aria-checked="true"]::after{transform:translateX(20px);background:#fff}
.sw:disabled{opacity:.4;cursor:default}
.btn{background:transparent;color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;min-height:36px;padding:0 14px;font:inherit;font-size:15px;cursor:pointer;white-space:nowrap;flex-shrink:0}
.btn:hover:not(:disabled){background:rgba(255,255,255,.08)}
.btn:disabled{opacity:.4;cursor:default}
ul.sch{margin:8px 0 0;padding-left:18px;color:${C.muted};font-size:14px;line-height:1.6}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:10px 0 0;font-size:15px}
dl.kv dt{color:${C.muted}}
dl.kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.pct{font-size:28px;font-weight:500;font-variant-numeric:tabular-nums}
.bar{height:14px;border-radius:7px;background:#262626;overflow:hidden;margin:12px 0 10px}
.bar i{display:block;height:100%;background:${FLOW.Pc};border-radius:7px 0 0 7px}
.bl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;font-size:15px;color:${C.muted}}
.bl b{color:${C.fg};font-weight:500;font-variant-numeric:tabular-nums}
.live .kpi{min-width:0}
.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid ${C.ctl};border-radius:999px;padding:4px 12px;font-size:14px;white-space:nowrap;flex-shrink:0}
.pill i{width:8px;height:8px;border-radius:50%;background:${C.muted}}
.pill.on{border-color:${FLOW.Pc}}.pill.on i{background:${FLOW.Pc}}
.pill.bad{border-color:#e09a1a}.pill.bad i{background:#e09a1a}
.socb{position:relative;height:10px;border-radius:5px;background:#262626;margin-top:10px}
.socb i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:${C.sel}}
.socb b{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:${C.fg}}
.ctl{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid ${C.grid}}
.cg .l{color:${C.muted};font-size:13px;margin-bottom:6px}
.cg .seg{margin-top:0}
.step{display:flex;align-items:center;gap:8px}
.step .tb{width:36px;height:36px;font:inherit;font-size:20px;color:${C.fg}}
.step .tb:disabled{opacity:.35;cursor:default}
.step span{min-width:52px;text-align:center;font-size:16px;font-variant-numeric:tabular-nums}
.ev-st{margin:8px 0 0}.ev-st:empty{display:none}
.fld{display:grid;gap:6px;margin-top:12px}
.fld label{font-size:14px;color:${C.muted}}
.fld .in{display:flex;align-items:center;gap:8px}
.fld input{flex:1;min-width:0;background:${C.page};color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;height:38px;padding:0 10px;font:inherit;font-size:16px;font-variant-numeric:tabular-nums}
.fld input:focus-visible{outline:2px solid ${C.focus};outline-offset:1px}
.fld input:disabled{opacity:.6}
.fld span{font-size:14px;color:${C.muted};min-width:56px}
.l2{font-size:15px;font-weight:500;margin:0 0 4px}
.sub{border-top:1px solid ${C.grid};margin-top:16px;padding-top:14px}
.fld .inv{max-width:280px}
.pr{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 32px;gap:8px;align-items:center;max-width:520px;margin-top:8px}
.pr.ph{margin-top:4px;font-size:14px;color:${C.muted}}
.pr input{min-width:0;background:${C.page};color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;height:38px;padding:0 10px;font:inherit;font-size:16px;font-variant-numeric:tabular-nums;box-sizing:border-box;width:100%}
.pr input:focus-visible{outline:2px solid ${C.focus};outline-offset:1px}
.pr input:disabled{opacity:.6}
.pr input[type=month]{color-scheme:dark;padding-right:4px}
.p0{font-size:15px;color:${C.soft};padding-left:2px}
.acts{justify-content:space-between;margin-top:16px}
.btn.pri{background:#2f72d0;border-color:#2f72d0;color:#fff;font-weight:500;padding:0 20px}
.btn.pri:hover:not(:disabled){background:#3a7fe0}
.fst{margin:8px 0 0}.fst:empty{display:none}
@media (max-width:480px){.kpis.odd>:last-child{grid-column:1/-1}.pr{grid-template-columns:minmax(0,1.8fr) minmax(0,1fr) minmax(0,1fr) 32px;gap:6px}.pr input{padding:0 6px}}
.ok{color:#4cc04c}.warn{color:#e09a1a}
.pill.dis{border-color:${FLOW.Bc}}.pill.dis i{background:${FLOW.Bc}}
.lims{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:0 16px}
.cf{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:14px;padding:10px 12px;border:1px solid #e09a1a;border-radius:6px;background:rgba(224,154,26,.08)}
.cf[hidden]{display:none}
.cf .t{flex:1 1 240px;font-size:15px;line-height:1.45}
.bat-st{margin:8px 0 0}.bat-st:empty{display:none}
.sl{display:flex;align-items:flex-start;gap:10px}
.sl .rg{display:grid;gap:2px;padding-top:6px}
.sl input[type=range]{width:220px;max-width:50vw;margin:0;accent-color:${C.sel};cursor:pointer}
.sl .sc{display:flex;justify-content:space-between;font-size:12px;color:${C.muted};font-variant-numeric:tabular-nums}
.sl input[type=text]{width:60px;background:${C.page};color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;height:36px;padding:0 8px;font:inherit;font-size:16px;text-align:right;font-variant-numeric:tabular-nums;box-sizing:border-box}
.sl input:focus-visible{outline:2px solid ${C.focus};outline-offset:1px}
.sl .u{color:${C.muted};font-size:14px;line-height:36px}
.fld .h{font-size:13px;color:${C.muted};line-height:1.4}
.lims .fld{align-content:start}
button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}
@media (max-width:700px){
.sum{grid-template-columns:1fr auto;gap:0 12px}
.sum .r{grid-column:1/-1;margin:2px 0 16px}.sum .r:last-child{margin-bottom:0}
.w{padding:8px}.hm{display:inline}.hn{display:none}.kpi .v{font-size:24px}.nav .t{font-size:20px}table{font-size:14px}th{font-size:12px}th,td{padding:7px 3px}}
`;
// toate mărimile de text urmează --fz (setat pe gazda cardului din Setări)
const CSS = RAW_CSS.replace(/font-size:(\d+)px/g, 'font-size:calc($1px * var(--fz,1))');

class VictronVrmCard extends HTMLElement {
  constructor() {
    super();
    this._adopt();
  }
  // La un refresh lent, HA creează elementul și îi dă `hass` înainte ca modulul să definească
  // cardul; valoarea rămâne atunci proprietate proprie a elementului și ascunde setter-ul.
  // O preluăm la upgrade, ca să ajungă prin setter.
  _adopt() {
    if (Object.prototype.hasOwnProperty.call(this, 'hass')) {
      const h = this.hass;
      delete this.hass;
      this.hass = h;
    }
  }
  setConfig(config) {
    const view = VIEWS.includes(config.view) || ['setari', 'amortizare', 'masina', 'baterie'].includes(config.view) ? config.view : 'zi';
    this._cfg = { ...config, view, paths: { zi: 'zi', saptamana: 'saptamana', luna: 'luna', an: 'an', masina: 'masina', baterie: 'baterie', amortizare: 'amortizare', setari: 'setari', ...(config.paths || {}) } };
    this._cache = new Map();
    // la upgrade, setConfig vine după connectedCallback și după hass
    if (this._hass && this._d) this._load();
  }
  getCardSize() { return 20; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
  static getStubConfig() { return { view: 'zi' }; }

  connectedCallback() {
    this._adopt();
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style><div class="w"><div class="box msg">Se încarcă istoricul VRM…</div></div>`;
      this._ro = new ResizeObserver(() => this._charts());
      this._ro.observe(this);
    }
    const d = parse(new URLSearchParams(location.search).get('d'));
    if (d) this._d = d; else if (!this._d) this._d = today();
    this._fz = null; this._applyFz();
    this._onFz = () => this._applyFz();
    window.addEventListener(FZ_EVENT, this._onFz);
    window.addEventListener('storage', this._onFz);
    // pagina Setări a salvat deja valorile noi; celelalte pagini le recitesc
    this._onFin = () => { this._cache.clear(); if (!this._settings()) this._load(); };
    window.addEventListener(FIN_EVENT, this._onFin);
    this._applyPanel();
    this._onPanel = () => this._applyPanel();
    window.addEventListener(PANEL_EVENT, this._onPanel);
    this._timer = setInterval(() => this._load(true), 5 * 60 * 1000);
    this._load();
  }
  disconnectedCallback() {
    clearInterval(this._timer); this._closeFs();
    window.removeEventListener(FZ_EVENT, this._onFz);
    window.removeEventListener('storage', this._onFz);
    window.removeEventListener(FIN_EVENT, this._onFin);
    window.removeEventListener(PANEL_EVENT, this._onPanel);
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (first && this._d) this._load();
    else if (this._settings()) this._syncAuto();
    else if (this._cfg && this._cfg.view === 'masina') this._syncLive();
    else if (this._cfg && this._cfg.view === 'baterie') this._syncBat();
  }
  get hass() { return this._hass; }
  _settings() { return this._cfg && this._cfg.view === 'setari'; }
  _applyPanel() { this.style.setProperty('--vrm-panel', loadPanel()); }
  // culoarea venită de la integrare; anunță celelalte carduri doar când s-a schimbat
  _setPanel(v) {
    v = okPanel(v);
    if (v === loadPanel()) return this._applyPanel();
    savePanel(v);
    window.dispatchEvent(new Event(PANEL_EVENT));
  }
  _applyFz() {
    const fz = loadFz();
    if (fz === this._fz) return;
    this._fz = fz;
    this.style.setProperty('--fz', fz);
    this._cws = {}; this._charts();
    if (this._settings()) this._renderSettings();
  }

  // ── perioada afișată ───────────────────────────────────────────────
  _range() {
    const d = this._d, v = this._cfg.view;
    if (v === 'zi') return { from: d, to: d };
    if (v === 'saptamana') { const m = monday(d); return { from: m, to: addDays(m, 6) }; }
    if (MONTH_V.includes(v)) return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
    return { from: new Date(d.getFullYear(), 0, 1), to: new Date(d.getFullYear(), 11, 31) };
  }
  _shift(n) {
    const d = this._d, v = this._cfg.view;
    this._d = v === 'zi' ? addDays(d, n) : v === 'saptamana' ? addDays(d, 7 * n)
      : MONTH_V.includes(v) ? new Date(d.getFullYear(), d.getMonth() + n, 1) : new Date(d.getFullYear() + n, 0, 1);
    this._sync(); this._load();
  }
  _sync() {
    const u = new URL(location.href);
    if (+this._d === +today()) u.searchParams.delete('d'); else u.searchParams.set('d', iso(this._d));
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  }
  _go(view, d) {
    this._closeFs();
    const parts = location.pathname.split('/').filter(Boolean);
    const base = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/' + (parts[0] || 'lovelace');
    history.pushState(null, '', `${base}/${this._cfg.paths[view]}${d ? `?d=${iso(d)}` : ''}`);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }
  // ultima perioadă la care duce ›: azi, sau ultima zi cu prognoză pe Zi și Săptămână
  _atEnd() {
    const { to } = this._range(), t = today(), v = this._cfg.view;
    if (this._fcOn && (v === 'zi' || v === 'saptamana')) return addDays(to, 1) > addDays(t, FC_AHEAD);
    return to >= t;
  }
  _title() {
    const { from, to } = this._range(), v = this._cfg.view;
    if (v === 'amortizare') return 'Amortizare';
    if (v === 'zi') return cap(`${ZILE[from.getDay()]}, ${from.getDate()} ${LUNI_L[from.getMonth()]} ${from.getFullYear()}`);
    if (v === 'saptamana') {
      const y = from.getFullYear() === to.getFullYear() ? '' : ' ' + from.getFullYear();
      return `${from.getDate()} ${LUNI[from.getMonth()]}${y} – ${to.getDate()} ${LUNI[to.getMonth()]} ${to.getFullYear()}`;
    }
    if (MONTH_V.includes(v)) return cap(`${LUNI_L[from.getMonth()]} ${from.getFullYear()}`);
    return String(from.getFullYear());
  }

  // ── date ────────────────────────────────────────────────────────────
  async _ws(msg, live) {
    const key = JSON.stringify(msg), hit = this._cache.get(key);
    if (hit && (!live || Date.now() - hit.at < 5 * 60 * 1000)) return hit.data;
    const data = await this._hass.callWS(this._cfg.entry_id ? { ...msg, entry_id: this._cfg.entry_id } : msg);
    this._cache.set(key, { at: Date.now(), data });
    if (msg.type === 'victron_vrm/info') this._setPanel(data.panel);
    return data;
  }
  async _load(refresh = false) {
    const h = this._hass; if (!h || !this._d || !this._cfg) return;
    if (this._settings()) {
      if (refresh) return;
      try { this._info = await this._ws({ type: 'victron_vrm/info' }, true); this._err = null; } catch (e) { this._err = e && e.message ? e.message : String(e); }
      return this._renderSettings();
    }
    if (this._cfg.view === 'masina') {
      const seq = (this._seq = (this._seq || 0) + 1), { from, to } = this._range(), t = today();
      if (refresh && !(from <= t && t <= to)) return;
      try {
        const info = await this._ws({ type: 'victron_vrm/info' }, true);
        const ev = await this._ws({ type: 'victron_vrm/ev', start: info.start, end: iso(t) }, true);
        if (seq !== this._seq) return;
        this._info = info; this._ev = ev; this._err = null;
      } catch (e) {
        if (seq !== this._seq) return;
        this._err = e && e.message ? e.message : String(e);
      }
      return this._renderEv();
    }
    if (this._cfg.view === 'baterie') {
      const seq = (this._seq = (this._seq || 0) + 1), { from, to } = this._range(), t = today(), live = from <= t && t <= to;
      if (refresh && !live) return;
      try {
        const info = await this._ws({ type: 'victron_vrm/info' }, true);
        const [years, days, flows, soc] = await Promise.all([
          this._ws({ type: 'victron_vrm/years' }, true),
          this._ws({ type: 'victron_vrm/days', start: iso(from), end: iso(to) }, live),
          this._ws({ type: 'victron_vrm/flows', start: iso(from), end: iso(to), codes: BAT_CODES }, live),
          this._socStats(from, to, live)]);
        if (seq !== this._seq) return;
        this._info = info; this._bat = { years, days, flows, soc }; this._err = null;
      } catch (e) {
        if (seq !== this._seq) return;
        this._err = e && e.message ? e.message : String(e);
      }
      return this._renderBat();
    }
    if (this._cfg.view === 'amortizare') {
      const seq = (this._seq = (this._seq || 0) + 1);
      try {
        const [info, yrs] = await Promise.all([this._ws({ type: 'victron_vrm/info' }, true), this._ws({ type: 'victron_vrm/years' }, true)]);
        if (seq !== this._seq) return;
        this._info = info; this._yrs = yrs; this._err = null;
      } catch (e) {
        if (seq !== this._seq) return;
        this._err = e && e.message ? e.message : String(e);
      }
      return this._renderPay();
    }
    const seq = (this._seq = (this._seq || 0) + 1);
    const { from, to } = this._range(), v = this._cfg.view, t = today();
    const live = from <= t && t <= to;
    if (refresh && !live) return;
    try {
      const info = await this._ws({ type: 'victron_vrm/info' }, true);
      let rows, years = null;
      if (v === 'zi') {
        const r = await this._ws({ type: 'victron_vrm/hours', date: iso(from) }, live);
        rows = Array.from({ length: 24 }, (_, i) => Object.assign(mk(p2(i), r.hours[p2(i)], r.codes), { label: p2(i), tip: `${p2(i)}:00 – ${p2(i + 1)}:00` }));
      } else if (v === 'an') {
        const r = await this._ws({ type: 'victron_vrm/years' }, true);
        const y = r.years[String(from.getFullYear())];
        rows = Array.from({ length: 12 }, (_, i) => Object.assign(mk(p2(i + 1), y && y.m[p2(i + 1)], r.codes),
          { label: LUNI[i], tip: cap(`${LUNI_L[i]} ${from.getFullYear()}`), d: new Date(from.getFullYear(), i, 1),
            days: (y && y.n && y.n[p2(i + 1)]) || 0 }));
        years = Object.keys(r.years).sort().map((k) => Object.assign(mk(k, r.years[k].t, r.codes), { label: k }));
      } else {
        const r = await this._ws({ type: 'victron_vrm/days', start: iso(from), end: iso(to) }, live);
        rows = [];
        for (let d = from; d <= to; d = addDays(d, 1)) {
          rows.push(Object.assign(mk(iso(d), r.days[iso(d)], r.codes), {
            label: v === 'saptamana' ? ZILE_S[d.getDay()] : String(d.getDate()),
            tip: cap(`${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI_L[d.getMonth()]}`), d, future: d > t }));
        }
      }
      // prognoza VRM; o integrare mai veche nu are comanda, atunci pagina rămâne fără prognoză
      let fc = null;
      if (FC_V.includes(v)) {
        try { fc = await this._ws({ type: 'victron_vrm/forecast', start: iso(from), end: iso(to) }, true); } catch (e) { fc = null; }
        withFc(rows, fc, v, iso(from));
      }
      if (seq !== this._seq) return;
      this._info = info; this._rows = rows; this._years = years; this._err = null; this._fcOn = !!(fc && fc.fetched);
    } catch (e) {
      if (seq !== this._seq) return;
      this._err = e && e.message ? e.message : String(e);
    }
    this._render();
  }

  // ── desen ───────────────────────────────────────────────────────────
  _render() {
    const root = this.shadowRoot; if (!root) return;
    const w = root.querySelector('.w');
    const v = this._cfg.view, t = today(), { from, to } = this._range();
    const nav = `<div class="box"><div class="nav"><div class="t">${esc(this._title())}</div>
      <div class="bt"><button class="prev" aria-label="Înapoi">‹</button><button class="now">${v === 'zi' ? 'Azi' : 'Acum'}</button>
      <button class="next" aria-label="Înainte"${this._atEnd() ? ' disabled' : ''}>›</button></div></div>${this._err ? '' : '<div class="take"></div>'}</div>`;
    if (this._err) {
      w.innerHTML = nav + `<div class="box msg">Nu am putut citi istoricul VRM: ${esc(this._err)}</div>`;
      return this._wire(w);
    }
    const rows = this._rows, tot = sum(rows), info = this._info;
    const n = rows.filter((r) => r.any).length;
    if (!n && rows.some((r) => isFinite(r.fsol))) return this._renderFc(w, nav);
    if (!n) {
      const wait = info.backfilling ? 'Istoricul se descarcă din VRM; revino în câteva minute.' : `Nu există date VRM pentru această perioadă (istoricul începe pe ${esc(info.start)}).`;
      w.innerHTML = nav + `<div class="box msg">${wait}</div>${this._yearsTable()}${this._foot()}`;
      w.querySelector('.take')?.remove();
      return this._wire(w);
    }
    const unit = v === 'zi' ? 'oră' : v === 'an' ? 'lună' : 'zi';
    const avg = (x) => (v === 'zi' ? '' : `Ø ${kwh(x / n)} kWh/${unit}`);
    const kpi = (l, val, u, s = '') => `<div class="box kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const share = (x, of) => (of > 0 ? pct(x / of) : '—');
    const hasEv = tot.ev > 0;
    // pierderile apar doar pe lună / an: pe zi sau săptămână ar include energia rămasă în baterie
    const showLoss = v === 'luna' || v === 'an';
    const hours = 24 * (v === 'an' ? rows.reduce((a, r) => a + (r.days || 0), 0) : n);
    const lossW = hours > 0 ? tot.loss / hours * 1000 : NaN;
    const take = `<div class="sum">${sumRow('Producție', kwU(tot.prod), [[tot.v.Pc, FLOW.Pc, 'consum direct'], [tot.v.Pb, FLOW.Pb, 'în baterie'], [tot.v.Pg, FLOW.Pg, 'în rețea']])}`
      + sumRow(hasEv ? 'Casa' : 'Consum', kwU(tot.house), [[tot.v.hPc, FLOW.Pc, 'solar'], [tot.v.hBc, FLOW.Bc, 'baterie'], [tot.v.hGc, FLOW.Gc, 'rețea']])
      + (hasEv ? sumRow('Mașina', kwU(tot.ev), [[tot.v.Pe, FLOW.Pc, 'solar'], [tot.v.Be, FLOW.Bc, 'baterie'], [tot.v.Ge, FLOW.Gc, 'rețea']]) : '')
      + this._fcTake(rows, tot) + '</div>';

    const first = { zi: 'Ora', saptamana: 'Ziua', luna: 'Ziua', an: 'Luna' }[v];
    const cols = (r) => `<td>${kwh(r.prod)}</td><td>${kwh(r.house)}</td>${hasEv ? `<td>${kwh(r.ev)}</td>` : ''}<td>${kwh(r.imp)}</td><td>${kwh(r.inj)}</td><td class="hn">${kwh(r.chg)}</td><td class="hn">${kwh(r.dis)}</td><td>${pctN(r.indep)}</td><td class="hn">${pctN(r.autoc)}</td>`;
    const head = (f) => `<thead><tr><th>${f}</th>${HEAD(hasEv)}</tr></thead>`;
    const drill = v === 'an' ? 'luna' : v === 'zi' ? null : 'zi';
    const body = rows.filter((r) => r.any || (v !== 'an' && !r.future)).map((r) => {
      const lbl = v === 'zi' ? `${r.label}:00` : v === 'an' ? `<span class="hn">${cap(LUNI_L[+r.k - 1])}</span><span class="hm">${cap(LUNI[+r.k - 1])}</span>` : `<span class="hn">${esc(r.tip)}</span><span class="hm">${esc(r.label)}</span>`;
      const go = drill && r.any ? ` class="go" data-i="${rows.indexOf(r)}"` : r.any ? '' : ' class="nil"';
      return `<tr${go}><td>${lbl}</td>${cols(r)}</tr>`;
    }).join('');
    this._tot = tot; this._wide = this._wide || loadWide();
    const box = (c) => this._box(c);

    // prognoza apare doar în rezumat (fcRow); graficele „față de prognoză” au fost scoase în 0.14.4
    const charts = CHARTS.filter((c) => !c.ev || hasEv);
    this._chartList = charts;
    this._fcTot = { fsol: sumK(rows, 'fsol'), fcons: sumK(rows, 'fcons') };
    // totalurile de producție, casă și mașină sunt deja în rezumatul de sus
    const nk = 6 + (showLoss ? 1 : 0);
    w.innerHTML = nav + `
<div class="kpis${nk % 2 ? ' odd' : ''}" style="--k:${nk}">${kpi('Import rețea', kwh(tot.imp), 'kWh', `${kwh(tot.v.Gb)} kWh în baterie`)}${kpi('Injecție', kwh(tot.inj), 'kWh', `${kwh(tot.v.Bg)} kWh din baterie`)}${kpi('Încărcare baterie', kwh(tot.chg), 'kWh', `${kwh(tot.v.Gb)} kWh din rețea`)}${kpi('Descărcare baterie', kwh(tot.dis), 'kWh', avg(tot.dis))}${showLoss ? kpi('Pierderi sistem', kwh(Math.max(0, tot.loss)), 'kWh', `≈ ${isFinite(lossW) ? F0(Math.max(0, lossW)) : '—'} W în medie · ${share(Math.max(0, tot.loss), tot.prod + tot.imp)} din energia intrată`) : ''}${kpi('Independență', pctN(tot.indep), isFinite(tot.indep) ? '%' : '', 'consum acoperit de solar + baterie')}${kpi('Autoconsum', pctN(tot.autoc), isFinite(tot.autoc) ? '%' : '', 'producție folosită în casă sau baterie')}</div>
<div class="charts">${charts.map(box).join('')}</div>
<div class="box"><div class="ttl">${{ zi: 'Pe ore', saptamana: 'Pe zile', luna: 'Pe zile', an: 'Pe luni' }[v]}</div>${drill ? '<div class="note">Apasă pe un rând pentru detalii</div>' : ''}
 <div class="tw"><table>${head(first)}<tbody>${body}</tbody><tfoot><tr><td>Total</td>${cols(tot)}</tr></tfoot></table></div></div>
${this._yearsTable()}${this._foot()}`;
    w.querySelector('.take').innerHTML = take;
    w.querySelectorAll('tbody tr.go').forEach((tr) => tr.addEventListener('click', () => this._go(drill, rows[+tr.dataset.i].d || parse(rows[+tr.dataset.i].k))));
    this._wire(w);
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(charts.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }
  // rânduri despre prognoza VRM, după rezumatul perioadei
  _fcTake(rows, tot) {
    const v = this._cfg.view, t = today(), fr = rows.filter((r) => isFinite(r.fsol));
    if (!fr.length) return '';
    const fs = sumK(fr, 'fsol'), fk = sumK(fr, 'fcons');
    if (v === 'zi') {
      const isToday = +this._range().from === +t;
      const now = new Date(), h = now.getHours(), fr0 = 1 - now.getMinutes() / 60;
      // ce mai urmează azi după prognoză; după apus producția zilei e deja cea finală
      const rest = (k) => (isToday ? fr.reduce((a, r) => a + (+r.k > h ? r[k] : +r.k === h ? r[k] * fr0 : 0), 0) : 0);
      const ls = rest('fsol'), lk = rest('fcons');
      return fcRow('Prognoză producție', fs, tot.prod, ls, pct(tot.prod / fs), 'realizat', ls >= 0.05 ? 'mai urmează' : '')
        + fcRow('Prognoză consum', fk, tot.cons, lk, pct(tot.cons / fk), 'realizat', lk >= 0.05 ? 'mai urmează' : '');
    }
    // ca pe Zi: realul de până acum ÷ prognoza zilelor afișate, plus prognoza zilelor care urmează
    const next = fr.filter((r) => r.d > t), done = sum(fr.filter((r) => r.d <= t && r.any));
    const nw = next.length === 1 ? 'mâine' : `în următoarele ${next.length} zile`;
    return fcRow('Prognoză producție', fs, done.prod, sumK(next, 'fsol'), pct(done.prod / fs), 'realizat', next.length ? nw : '')
      + fcRow('Prognoză consum', fk, done.cons, sumK(next, 'fcons'), pct(done.cons / fk), 'realizat', next.length ? nw : '');
  }
  // o zi sau o săptămână fără date reale încă: doar prognoza VRM
  _renderFc(w, nav) {
    const rows = this._rows, v = this._cfg.view, fr = rows.filter((r) => isFinite(r.fsol));
    const fs = sumK(fr, 'fsol'), fk = sumK(fr, 'fcons'), fev = sumK(fr, 'fev'), bal = fs - fk;
    const kpi = (l, val, u, s = '') => `<div class="box kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const charts = FC_CHARTS.map((c) => ({ ...c, ttl: c.dashName, up: [], note: `Prognoza VRM pe ${v === 'zi' ? 'ore' : 'zile'}` }));
    this._chartList = charts; this._tot = sum(rows); this._wide = this._wide || loadWide();
    this._fcTot = { fsol: fs, fcons: fk };
    const take = 'Încă nu există date reale: cifrele sunt prognoza VRM, actualizată în fiecare oră.';
    const body = fr.map((r) => `<tr><td>${v === 'zi' ? `${r.label}:00` : `<span class="hn">${esc(r.tip)}</span><span class="hm">${esc(r.label)}</span>`}</td><td>${kwh(r.fsol)}</td><td>${kwh(r.fcons)}</td><td>${kwh(r.fev)}</td></tr>`).join('');
    w.innerHTML = nav + `
<div class="kpis" style="--k:3">${kpi('Producție prognozată', kwh(fs), 'kWh')}${kpi('Consum prognozat', kwh(fk), 'kWh', fev >= 0.1 ? `din care mașina ${kwh(fev)} kWh` : '')}${kpi('Bilanț', (bal < 0 ? '−' : '+') + kwh(Math.abs(bal)), 'kWh', bal < 0 ? 'lipsă acoperită din baterie sau rețea' : 'surplus pentru baterie sau rețea')}</div>
<div class="charts">${charts.map((c) => this._box(c)).join('')}</div>
<div class="box"><div class="ttl">Prognoză ${v === 'zi' ? 'pe ore' : 'pe zile'}</div>
 <div class="tw"><table><thead><tr><th>${v === 'zi' ? 'Ora' : 'Ziua'}</th>${th('Producție', 'Prod.', 'kWh')}${th('Consum', 'Cons.', 'kWh')}${th('din care mașina', 'Maș.', 'kWh')}</tr></thead><tbody>${body}</tbody>
 <tfoot><tr><td>Total</td><td>${kwh(fs)}</td><td>${kwh(fk)}</td><td>${kwh(fev)}</td></tr></tfoot></table></div></div>
${this._foot()}`;
    w.querySelector('.take').innerHTML = take;
    this._wire(w);
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(charts.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }
  _yearsTable() {
    if (this._cfg.view !== 'an' || !this._years || !this._years.length) return '';
    const y = String(this._d.getFullYear()), hasEv = this._years.some((r) => r.ev > 0);
    const rows = this._years.map((r) => `<tr class="go${r.k === y ? ' sel' : ''}" data-y="${r.k}"><td>${r.k}${r.k === String(today().getFullYear()) ? ' <span class="hn" style="color:' + C.muted + '">(în curs)</span>' : ''}</td><td>${kwh(r.prod)}</td><td>${kwh(r.house)}</td>${hasEv ? `<td>${kwh(r.ev)}</td>` : ''}<td>${kwh(r.imp)}</td><td>${kwh(r.inj)}</td><td class="hn">${kwh(r.chg)}</td><td class="hn">${kwh(r.dis)}</td><td>${pctN(r.indep)}</td><td class="hn">${pctN(r.autoc)}</td></tr>`).join('');
    return `<h2>Pe ani<small>apasă pe un an pentru lunile lui</small></h2><div class="box"><div class="tw"><table><thead><tr><th>An</th>${HEAD(hasEv)}</tr></thead><tbody class="yrs">${rows}</tbody></table></div></div>`;
  }
  _foot() {
    const i = this._info; if (!i) return '';
    const s = i.synced ? new Date(i.synced) : null;
    const ago = s ? Math.round((Date.now() - s) / 60000) : null;
    const when = s ? (ago < 1 ? 'acum' : ago < 60 ? `acum ${ago} min` : `${p2(s.getHours())}:${p2(s.getMinutes())}, ${s.getDate()} ${LUNI[s.getMonth()]}`) : 'niciodată';
    const st = parse(i.start);
    return `<div class="foot">${esc(i.site)} · VRM sincronizat ${when}${i.backfilling ? ' · se descarcă istoricul…' : ''} · istoric din ${st ? `${st.getDate()} ${LUNI[st.getMonth()]} ${st.getFullYear()}` : esc(i.start)}</div>`;
  }
  _wire(w) {
    w.querySelector('.prev').addEventListener('click', () => this._shift(-1));
    w.querySelector('.next').addEventListener('click', () => this._shift(1));
    w.querySelector('.now').addEventListener('click', () => { this._d = today(); this._sync(); this._load(); });
    w.querySelectorAll('tbody.yrs tr').forEach((tr) => tr.addEventListener('click', () => { this._d = new Date(+tr.dataset.y, 0, 1); this._sync(); this._load(); }));
  }
  _legend(c) {
    if (c.kind === 'soc') {
      const [a, b] = this._socRange || [], ref = this._socRef;
      return `<div class="leg"><span><i style="background:${FLOW.Bc}"></i>Între minim și maxim<b>${isFinite(a) ? `${F0(a)}–${F0(b)}` : '—'}</b> %</span><span><i class="ln" style="background:${C.fg}"></i>Media zilei</span>${isFinite(ref) ? `<span><i class="ln" style="background:${C.soft}"></i>Rezerva acum<b>${F0(ref)}</b> %</span>` : ''}</div>`;
    }
    const tot = this._tot;
    const u = c.unit || 'kWh';
    return `<div class="leg">${[...c.up, ...(c.down || [])].map((k) => `<span><i style="background:${FLOW[k]}"></i>${c.names[k]}<b>${(c.num || kwh)(tot.v[k])}</b> ${u}</span>`).join('')}${c.line ? `<span><i class="ln" style="background:${C.fg}"></i>Producție<b>${kwh(tot.prod)}</b> kWh</span>` : ''}${c.dash ? `<span><i class="dash"></i>${c.dashName}<b>${kwh((this._fcTot || {})[c.dash] || 0)}</b> kWh</span>` : ''}</div>`;
  }
  _box(c) {
    const wide = this._wide.has(c.id), lbl = wide ? 'Lățime normală' : 'Lățime dublă';
    return `<div class="box${wide ? ' wide' : ''}"><div class="hd"><div><div class="ttl">${c.ttl}</div><div class="note">${c.note}</div></div>
      <div class="tools"><button class="tb wb hn" data-c="${c.id}" title="${lbl}" aria-label="${lbl}">${svgI(wide ? ICON.narrow : ICON.wide)}</button>
      <button class="tb fb" data-c="${c.id}" title="Ecran complet" aria-label="Ecran complet">${svgI(ICON.full)}</button></div></div>
      ${this._legend(c)}<div class="ch" id="${c.id}"></div></div>`;
  }
  _toggleWide(btn) {
    const id = btn.dataset.c, on = !this._wide.has(id), lbl = on ? 'Lățime normală' : 'Lățime dublă';
    if (on) this._wide.add(id); else this._wide.delete(id);
    saveWide(this._wide);
    btn.closest('.box').classList.toggle('wide', on);
    btn.innerHTML = svgI(on ? ICON.narrow : ICON.wide); btn.title = lbl; btn.setAttribute('aria-label', lbl);
    this._charts();
  }
  // redesenează doar graficele a căror lățime s-a schimbat
  _charts() {
    const root = this.shadowRoot; if (!root || !this._rows) return;
    this._cws = this._cws || {};
    for (const c of this._chartList || CHARTS) {
      const el = root.getElementById(c.id);
      if (!el) continue;
      const W = el.clientWidth;
      if (!W || this._cws[c.id] === W) continue;
      this._cws[c.id] = W;
      this._draw(el, c, W, 220);
    }
  }
  _draw(el, c, W, H) {
    const v = this._cfg.view, rows = c.rows ? this._extra[c.rows] : this._rows;
    const label = (r) => r.label;
    // barele cresc odată cu graficul (lățime dublă / ecran complet), până la 2,5×
    const maxBar = Math.round((c.rows === 'hod' ? 18 : { zi: 18, saptamana: 40, luna: 16, an: 36, amortizare: 36, masina: 16, baterie: 16 }[v]) * Math.min(2.5, Math.max(1, W / 640)));
    const drill = c.drill !== undefined ? c.drill : v === 'an' || v === 'amortizare' ? 'luna' : v === 'zi' ? null : 'zi';
    const svg = c.kind === 'soc' ? rangeChart(W, H, rows, { label, maxBar, labelW: 34, click: !!drill, fz: this._fz || 1, ref: this._socRef }) : barChart(W, H, rows, { up: c.up, down: c.down, line: c.line, dash: c.dash, label, maxBar, unit: c.unit || 'kWh', labelW: v === 'zi' || c.rows === 'hod' ? 30 : v === 'amortizare' ? 44 : 34, click: !!drill, fz: this._fz || 1 });
    el.innerHTML = svg + '<div class="tip" hidden></div>';
    const tip = el.querySelector('.tip'), hl = el.querySelector('.hl');
    el.querySelectorAll('.hit').forEach((hit) => {
      const r = rows[+hit.dataset.i];
      hit.addEventListener('mousemove', (ev) => {
        hl.setAttribute('x', hit.getAttribute('x')); hl.setAttribute('width', hit.getAttribute('width')); hl.setAttribute('opacity', '0.06');
        const lines = c.kind === 'soc' ? (isFinite(r.smin) ? `<div>Minim: ${F0(r.smin)}%</div><div>Maxim: ${F0(r.smax)}%</div>${isFinite(r.smean) ? `<div>Medie: ${F0(r.smean)}%</div>` : ''}` : '<div>Fără date</div>') : [...c.up, ...(c.down || [])].map((k) => `<div><i style="background:${FLOW[k]}"></i>${c.names[k]}: ${(c.num || F1)(r.v[k])} ${c.unit || 'kWh'}</div>`).join('')
          + (c.line ? `<div><i style="background:${C.fg}"></i>Producție: ${F1(r.prod)} kWh</div>` : '')
          + (c.dash && isFinite(r[c.dash]) ? `<div><i class="dash"></i>${c.dashName}: ${F1(r[c.dash])} kWh</div>` : '');
        tip.innerHTML = `<div class="d">${esc(r.tip)}</div>${lines}`;
        tip.hidden = false;
        const b = el.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
        tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, x + 12)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 8) + 'px';
      });
      hit.addEventListener('mouseleave', () => { tip.hidden = true; hl.setAttribute('opacity', '0'); });
      if (drill && (r.any || (c.dash && isFinite(r[c.dash]) && r.d))) hit.addEventListener('click', () => this._go(drill, r.d || parse(r.k)));
    });
  }

  // ── mașina: starea stației, comenzi și istoricul încărcărilor ───────
  _evEnt() {
    const c = this._cfg.charger, car = this._cfg.car, E = {};
    if (c) Object.assign(E, { status: `sensor.${c}_status`, power: `sensor.${c}_power`, current: `sensor.${c}_current`, mode: `select.${c}_mode`,
      charging: `switch.${c}_ev_charging`, setpoint: `number.${c}_charge_current_setpoint`, auto: `switch.${c}_auto_start`,
      total: `sensor.${c}_total_energy`, lastE: `sensor.${c}_last_session_energy`, lastT: `sensor.${c}_last_session_time` });
    if (car) Object.assign(E, { soc: `sensor.${car}_state_of_charge`, target: `sensor.${car}_target_state_of_charge`, cstate: `sensor.${car}_charging_state` });
    return Object.assign(E, this._cfg.entities || {});
  }
  _liveKey() {
    const E = this._evEnt(), st = this._hass && this._hass.states;
    return Object.values(E).map((id) => { const x = st && st[id]; return x ? x.state : '-'; }).join('|');
  }
  _liveHtml() {
    const E = this._evEnt(), st = this._hass.states, S = (k) => (E[k] && st[E[k]]) || null;
    const num = (k) => { const x = S(k); const n = x ? parseFloat(x.state) : NaN; return isFinite(n) ? n : NaN; };
    if (!E.status) return `<div class="box live"><div class="ttl">Stația de încărcare</div><div class="note" style="margin:0">Pentru starea live și comenzi, adaugă în configurația cardului <code>charger:</code> cu începutul entităților stației (de exemplu <code>evcs_hq2620yv6qn</code>) și, opțional, <code>car:</code> pentru mașină.</div></div>`;
    const sx = S('status');
    if (!sx) return `<div class="box live"><div class="ttl">Stația de încărcare</div><div class="note warn" style="margin:0">Entitatea ${esc(E.status)} nu există.</div></div>`;
    const status = sx.state, bad = /error|detected/.test(status) || status === 'unavailable';
    const on = status === 'charging' || status === 'start_charging';
    const mode = S('mode') ? S('mode').state : null, sp = num('setpoint'), spx = S('setpoint');
    const amin = spx && isFinite(+spx.attributes.min) ? +spx.attributes.min : 6, amax = spx && isFinite(+spx.attributes.max) ? +spx.attributes.max : 32;
    const shownA = this._evA != null ? this._evA : sp;
    const kw = num('power') / 1000, amps = num('current');
    const soc = num('soc'), target = num('target'), cs = S('cstate');
    const carName = S('soc') ? String(S('soc').attributes.friendly_name || 'Mașina').replace(/\s*state of charge$/i, '') : '';
    const charging = S('charging') ? S('charging').state === 'on' : null, auto = S('auto') ? S('auto').state === 'on' : null;
    const kpi = (l, val, u, sub, extra = '') => `<div class="kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${extra}${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const carK = S('soc') ? kpi(esc(carName), isFinite(soc) ? F0(soc) : '—', '%',
      `${isFinite(target) ? `țintă ${F0(target)}%` : ''}${cs ? `${isFinite(target) ? ' · ' : ''}${esc(CAR_ST[cs.state] || cs.state)}` : ''}`,
      isFinite(soc) ? `<div class="socb" role="img" aria-label="Baterie ${F0(soc)}%${isFinite(target) ? `, țintă ${F0(target)}%` : ''}"><i style="width:${Math.max(0, Math.min(100, soc))}%"></i>${isFinite(target) ? `<b style="left:${Math.max(0, Math.min(100, target))}%"></b>` : ''}</div>` : '') : '';
    const ctl = [
      charging !== null ? `<div class="cg"><div class="l">Încărcare</div><button class="btn pri ev-go">${charging ? 'Oprește încărcarea' : 'Pornește încărcarea'}</button></div>` : '',
      mode !== null ? `<div class="cg"><div class="l">Mod</div><div class="seg ev-mode" role="group" aria-label="Modul stației">${EV_MODES.map(([k, l]) => `<button data-m="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>` : '',
      spx ? `<div class="cg"><div class="l">Curent de încărcare</div><div class="step"><button class="tb ev-dn" aria-label="Scade curentul"${shownA <= amin ? ' disabled' : ''}>−</button><span class="ev-a" aria-live="polite">${isFinite(shownA) ? F0(shownA) : '—'} A</span><button class="tb ev-up" aria-label="Crește curentul"${shownA >= amax ? ' disabled' : ''}>+</button></div></div>` : '',
      auto !== null ? `<div class="cg"><div class="l">Pornire la conectare</div><button class="sw ev-auto" role="switch" aria-checked="${auto}" aria-label="Pornire automată când conectezi mașina"></button></div>` : '',
    ].join('');
    return `<div class="box live">
 <div class="hd"><div><div class="ttl">Stația de încărcare</div><div class="note" style="margin:0">${mode ? esc(EV_MODE_NOTE[mode] || mode) : 'acum'}</div></div>
  <span class="pill${bad ? ' bad' : on ? ' on' : ''}"><i></i>${esc(EVCS_ST[status] || (status === 'unavailable' ? 'Indisponibilă' : status))}</span></div>
 <div class="kpis" style="--k:3;margin-top:12px">${kpi('Putere acum', isFinite(kw) ? F1(kw) : '—', 'kW', `${isFinite(amps) ? `${F0(amps)} A` : ''}${isFinite(sp) ? `${isFinite(amps) ? ' · ' : ''}setat ${F0(sp)} A` : ''}`)}${carK}${kpi('Ultima sesiune', isFinite(num('lastE')) ? kwh(num('lastE')) : '—', 'kWh', `${isFinite(num('lastT')) ? dur(num('lastT')) : ''}${isFinite(num('total')) ? ` · ${kwh(num('total'))} kWh de la instalare` : ''}`)}</div>
 ${ctl ? `<div class="ctl">${ctl}</div>` : ''}<div class="note ev-st" role="status"></div></div>`;
  }
  _wireLive(box) {
    const E = this._evEnt(), st = box.querySelector('.ev-st');
    const call = (btn, domain, service, data) => {
      if (btn) btn.disabled = true;
      st.textContent = ''; st.className = 'note ev-st';
      return this._hass.callService(domain, service, data)
        .catch((e) => { st.textContent = `Comanda nu a mers: ${e && e.message ? e.message : e}`; st.className = 'note ev-st warn'; })
        .finally(() => { if (btn) btn.disabled = false; });
    };
    const go = box.querySelector('.ev-go');
    if (go) go.addEventListener('click', () => {
      const on = this._hass.states[E.charging] && this._hass.states[E.charging].state === 'on';
      call(go, 'switch', on ? 'turn_off' : 'turn_on', { entity_id: E.charging });
    });
    box.querySelectorAll('.ev-mode button').forEach((b) => b.addEventListener('click', () => {
      box.querySelectorAll('.ev-mode button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      call(null, 'select', 'select_option', { entity_id: E.mode, option: b.dataset.m });
    }));
    const auto = box.querySelector('.ev-auto');
    if (auto) auto.addEventListener('click', () => {
      const on = auto.getAttribute('aria-checked') !== 'true';
      auto.setAttribute('aria-checked', on);
      call(auto, 'switch', on ? 'turn_on' : 'turn_off', { entity_id: E.auto });
    });
    // curentul se trimite după o scurtă pauză, ca apăsările repetate să ajungă ca o singură comandă
    const spx = this._hass.states[E.setpoint];
    const step = (d) => {
      const amin = spx && isFinite(+spx.attributes.min) ? +spx.attributes.min : 6, amax = spx && isFinite(+spx.attributes.max) ? +spx.attributes.max : 32;
      const base = this._evA != null ? this._evA : parseFloat(spx && spx.state);
      if (!isFinite(base)) return;
      this._evA = Math.max(amin, Math.min(amax, base + d));
      box.querySelector('.ev-a').textContent = `${F0(this._evA)} A`;
      box.querySelector('.ev-dn').disabled = this._evA <= amin; box.querySelector('.ev-up').disabled = this._evA >= amax;
      clearTimeout(this._evT);
      this._evT = setTimeout(() => {
        const value = this._evA;
        call(null, 'number', 'set_value', { entity_id: E.setpoint, value }).finally(() => { if (this._evA === value) { this._evA = null; this._syncLive(true); } });
      }, 800);
    };
    const dn = box.querySelector('.ev-dn'), up = box.querySelector('.ev-up');
    if (dn) dn.addEventListener('click', () => step(-1));
    if (up) up.addEventListener('click', () => step(1));
  }
  // HA trimite `hass` la fiecare schimbare; redesenăm doar caseta live, și doar când s-a schimbat ceva de-al ei
  _syncLive(force = false) {
    const box = this.shadowRoot && this.shadowRoot.querySelector('.live');
    if (!box || !this._hass) return;
    const key = this._liveKey();
    if (!force && (key === this._liveK || this._evA != null)) return;
    this._liveK = key;
    const t = document.createElement('div'); t.innerHTML = this._liveHtml();
    const nb = t.firstElementChild; box.replaceWith(nb); this._wireLive(nb);
  }
  // sesiunile: ore consecutive în care mașina a primit energie
  _sessions() {
    if (this._sess && this._sess.src === this._ev) return this._sess.list;
    const H = (this._ev && this._ev.hours) || {}, codes = (this._ev && this._ev.codes) || ['Pe', 'Be', 'Ge'], list = [];
    let cur = null;
    for (const ds of Object.keys(H).sort()) {
      const d = parse(ds);
      for (const hh of Object.keys(H[ds]).sort()) {
        const vals = H[ds][hh], e = vals.reduce((a, x) => a + (x || 0), 0);
        if (e < 0.05) continue;
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hh);
        if (!cur || +start !== cur.next) { cur = { start, v: { Pe: 0, Be: 0, Ge: 0 }, kwh: 0 }; list.push(cur); }
        codes.forEach((c, i) => { cur.v[c] = (cur.v[c] || 0) + (vals[i] || 0); });
        cur.kwh += e;
        cur.end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hh + 1); cur.next = +cur.end;
      }
    }
    this._sess = { src: this._ev, list };
    return list;
  }
  _renderEv() {
    const w = this.shadowRoot && this.shadowRoot.querySelector('.w'); if (!w || !this._hass) return;
    const t = today(), { from, to } = this._range();
    const nav = `<div class="box"><div class="nav"><div class="t">${esc(this._title())}</div>
      <div class="bt"><button class="prev" aria-label="Luna trecută">‹</button><button class="now">Acum</button>
      <button class="next" aria-label="Luna următoare"${to >= t ? ' disabled' : ''}>›</button></div></div>${this._err ? '' : '<div class="take"></div>'}</div>`;
    const live = this._liveHtml();
    if (this._err || !this._ev) {
      w.innerHTML = nav + live + (this._err ? `<div class="box msg">Nu am putut citi istoricul VRM: ${esc(this._err)}</div>` : '');
      this._wire(w); this._wireLive(w.querySelector('.live')); this._liveK = this._liveKey();
      return;
    }
    const H = this._ev.hours, codes = this._ev.codes, ym = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
    const list = priceList((this._info && this._info.finance) || {}), price = (k) => { const q = list.length ? priceAt(list, k) : null; return q && q.import > 0 ? q.import : NaN; };
    const P = price(ym(from));
    const add = (acc, vals) => vals.map((x, i) => x + (acc[i] || 0));
    // pe zile și pe orele zilei, pentru luna afișată
    const rows = [], hod = Array.from({ length: 24 }, () => codes.map(() => 0));
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const day = H[iso(d)] || {};
      let tot = codes.map(() => 0);
      for (const [hh, vals] of Object.entries(day)) { tot = add(tot, vals); hod[+hh] = add(hod[+hh], vals); }
      rows.push(Object.assign(mk(iso(d), tot, codes), { label: String(d.getDate()), tip: cap(`${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI_L[d.getMonth()]}`), d, future: d > t }));
    }
    this._extra = { hod: hod.map((vals, h) => Object.assign(mk(p2(h), vals, codes), { label: p2(h), tip: `${p2(h)}:00 – ${p2((h + 1) % 24)}:00` })) };
    const tot = sum(rows), ev = tot.ev, sol = tot.v.Pe, bat = tot.v.Be, grid = tot.v.Ge;
    const sess = this._sessions(), ms = sess.filter((x) => x.start >= from && x.start <= addDays(to, 1) && ym(x.start) === ym(from)), n = ms.length;
    const kpi = (l, val, u, s = '') => `<div class="box kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const per = `${LUNI_L[from.getMonth()]} ${from.getFullYear()}`;
    const first = Object.keys(H).sort()[0];
    const take = ev > 0
      ? `În ${per}, mașina a primit <b>${kwh(ev)} kWh</b> în <b>${n} ${n === 1 ? 'sesiune' : 'sesiuni'}</b>: <b>${pct(sol / ev)}</b> din solar, <b>${pct(bat / ev)}</b> din baterie și <b>${pct(grid / ev)}</b> din rețea.`
        + (isFinite(P) ? ` Energia din rețea a costat <b>${lei(grid * P)} lei</b>; dacă toată încărcarea venea din rețea, ar fi costat <b>${lei(ev * P)} lei</b>.` : '')
      : first && iso(to) < first ? `Istoricul stației de încărcare începe pe ${esc(first)}.` : `În ${per} mașina nu s-a încărcat acasă.`;

    const src = (r) => `<td>${kwh(r.Pe)}</td><td>${kwh(r.Be)}</td><td>${kwh(r.Ge)}</td>`;
    const srcH = `${th('Solar', 'Sol.', 'kWh')}${th('Baterie', 'Bat.', 'kWh')}${th('Rețea', 'Reț.', 'kWh')}`;
    const hm = (d) => `${p2(d.getHours())}:00`;
    const srows = ms.slice().reverse().map((x) => `<tr class="go" data-d="${iso(x.start)}"><td><span class="hn">${esc(cap(`${ZILE[x.start.getDay()]}, ${x.start.getDate()} ${LUNI_L[x.start.getMonth()]}`))}</span><span class="hm">${x.start.getDate()} ${LUNI[x.start.getMonth()]}</span></td>`
      + `<td class="hn">${hm(x.start)}–${hm(x.end)}${iso(x.end) !== iso(x.start) && x.end.getHours() ? ' (a doua zi)' : ''}</td><td>${kwh(x.kwh)}</td>${src(x.v)}<td class="hn">${isFinite(price(ym(x.start))) ? lei(x.v.Ge * price(ym(x.start))) : '—'}</td></tr>`).join('');
    // toate lunile cu încărcări
    const mon = {};
    for (const [ds, day] of Object.entries(H)) {
      const k = ds.slice(0, 7), m = (mon[k] = mon[k] || { k, Pe: 0, Be: 0, Ge: 0, n: 0 });
      for (const vals of Object.values(day)) codes.forEach((c, i) => { m[c] += vals[i] || 0; });
    }
    for (const x of sess) { const k = ym(x.start); if (mon[k]) mon[k].n++; }
    const mrows = Object.values(mon).sort((a, b) => b.k.localeCompare(a.k)).map((m) => {
      const e = m.Pe + m.Be + m.Ge, pk = price(m.k), [y, mm] = m.k.split('-');
      return `<tr class="go${m.k === ym(from) ? ' sel' : ''}" data-m="${m.k}"><td><span class="hn">${cap(LUNI_L[+mm - 1])} ${y}</span><span class="hm">${cap(LUNI[+mm - 1])} ${y.slice(2)}</span></td><td>${kwh(e)}</td>${src(m)}<td class="hn">${m.n}</td><td>${isFinite(pk) ? lei(m.Ge * pk) : '—'}</td><td class="hn">${isFinite(pk) ? lei((m.Pe + m.Be) * pk) : '—'}</td></tr>`;
    }).join('');

    // pe ani: aceleași sume, cu costul fiecărei luni la prețul ei
    const yrs = {};
    for (const m of Object.values(mon)) {
      const Y = (yrs[m.k.slice(0, 4)] = yrs[m.k.slice(0, 4)] || { k: m.k.slice(0, 4), Pe: 0, Be: 0, Ge: 0, n: 0, cost: 0, eco: 0, ok: true, last: m.k });
      Y.Pe += m.Pe; Y.Be += m.Be; Y.Ge += m.Ge; Y.n += m.n; if (m.k > Y.last) Y.last = m.k;
      const pk = price(m.k);
      if (isFinite(pk)) { Y.cost += m.Ge * pk; Y.eco += (m.Pe + m.Be) * pk; } else Y.ok = false;
    }
    const ylist = Object.values(yrs).sort((a, b) => b.k.localeCompare(a.k));
    const ycols = (Y) => { const e = Y.Pe + Y.Be + Y.Ge; return `<td>${kwh(e)}</td>${src(Y)}<td class="hn">${Y.n}</td><td class="hn">${Y.n ? kwh(e / Y.n) : '—'}</td><td>${Y.ok ? lei(Y.cost) : '—'}</td><td class="hn">${Y.ok ? lei(Y.eco) : '—'}</td>`; };
    const yrows = ylist.map((Y) => `<tr class="go${Y.k === String(from.getFullYear()) ? ' sel' : ''}" data-m="${Y.last}"><td>${Y.k}${Y.k === String(t.getFullYear()) ? ' <span class="hn" style="color:' + C.muted + '">(în curs)</span>' : ''}</td>${ycols(Y)}</tr>`).join('');
    const ytot = ylist.reduce((a, Y) => ({ Pe: a.Pe + Y.Pe, Be: a.Be + Y.Be, Ge: a.Ge + Y.Ge, n: a.n + Y.n, cost: a.cost + Y.cost, eco: a.eco + Y.eco, ok: a.ok && Y.ok }), { Pe: 0, Be: 0, Ge: 0, n: 0, cost: 0, eco: 0, ok: true });
    const yhead = `<thead><tr><th>An</th>${th('Total', 'Tot.', 'kWh')}${srcH}${th('Sesiuni', '', '', 'hn')}${th('Ø pe sesiune', '', 'kWh', 'hn')}${th('Cost rețea', 'Cost', 'lei')}${th('Economie', '', 'lei', 'hn')}</tr></thead>`;
    const ytable = ylist.length ? `<h2>Pe ani<small>apasă pe un an pentru ultima lui lună</small></h2><div class="box"><div class="tw"><table>${yhead}<tbody class="evm">${yrows}</tbody>${ylist.length > 1 ? `<tfoot><tr><td>Total</td>${ycols(ytot)}</tr></tfoot>` : ''}</table></div></div>` : '';

    this._rows = rows; this._tot = tot; this._chartList = EV_CHARTS; this._wide = this._wide || loadWide();
    w.innerHTML = nav + live + `
<div class="kpis" style="--k:4">${kpi('Energie primită', kwh(ev), 'kWh', n ? `${n} ${n === 1 ? 'sesiune' : 'sesiuni'} · Ø ${kwh(ev / n)} kWh/sesiune` : 'nicio sesiune')}${kpi('Din solar și baterie', ev > 0 ? pctN((sol + bat) / ev) : '—', ev > 0 ? '%' : '', `${kwh(sol)} kWh solar · ${kwh(bat)} kWh baterie`)}${kpi('Din rețea', kwh(grid), 'kWh', isFinite(P) ? `${lei(grid * P)} lei, la ${F2(P)} lei/kWh` : 'completează prețul în Setări')}${kpi('Economie', isFinite(P) ? lei((sol + bat) * P) : '—', 'lei', isFinite(P) ? `doar din rețea ar fi costat ${lei(ev * P)} lei` : '')}</div>
<div class="charts">${EV_CHARTS.map((c) => this._box(c)).join('')}</div>
<div class="box"><div class="ttl">Sesiuni de încărcare</div><div class="note">Reconstituite din datele orare VRM, deci pe ore întregi · apasă pe o sesiune pentru ziua respectivă</div>
 ${n ? `<div class="tw"><table><thead><tr><th>Ziua</th><th class="hn">Interval</th>${th('Total', 'Tot.', 'kWh')}${srcH}${th('Cost rețea', '', 'lei', 'hn')}</tr></thead><tbody>${srows}</tbody></table></div>` : `<div class="note" style="margin:0">Nicio sesiune în ${per}.</div>`}</div>
${mrows ? `<h2>Pe luni<small>apasă pe o lună</small></h2><div class="box"><div class="tw"><table><thead><tr><th>Luna</th>${th('Total', 'Tot.', 'kWh')}${srcH}<th class="hn">Sesiuni</th>${th('Cost rețea', 'Cost', 'lei')}${th('Economie', '', 'lei', 'hn')}</tr></thead><tbody class="evm">${mrows}</tbody></table></div></div>` : ''}
${ytable}
<div class="foot">Costul folosește prețul energiei din rețea din Setări pentru fiecare lună; energia din solar și baterie e socotită la același preț, ca în Amortizare · ${esc(this._info.site)}</div>`;
    w.querySelector('.take').innerHTML = take;
    this._wire(w);
    this._wireLive(w.querySelector('.live')); this._liveK = this._liveKey();
    w.querySelectorAll('tr.go[data-d]').forEach((tr) => tr.addEventListener('click', () => this._go('zi', parse(tr.dataset.d))));
    w.querySelectorAll('tbody.evm tr').forEach((tr) => tr.addEventListener('click', () => { const [y, m] = tr.dataset.m.split('-'); this._d = new Date(+y, +m - 1, 1); this._sync(); this._load(); window.scrollTo({ top: 0 }); }));
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(EV_CHARTS.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }

  // ── bateria: starea acum, setările ESS și istoricul încărcărilor ─────
  _batEnt() { return Object.assign({}, BAT_DEF, this._cfg.battery || {}); }
  _batKey() {
    const E = this._batEnt(), st = this._hass && this._hass.states;
    return Object.values(E).map((id) => { const x = st && st[id]; return x ? x.state : '-'; }).join('|');
  }
  // istoricul SoC din statisticile HA (minim / maxim / medie pe zi); null dacă lipsește
  async _socStats(from, to, live) {
    const id = this._batEnt().soc, key = `soc|${id}|${iso(from)}|${iso(to)}`, hit = this._cache.get(key);
    if (hit && (!live || Date.now() - hit.at < 5 * 60 * 1000)) return hit.data;
    let data = null;
    try {
      const r = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: from.toISOString(), end_time: addDays(to, 1).toISOString(),
        statistic_ids: [id], period: 'day', types: ['min', 'max', 'mean'] });
      data = {};
      for (const p of (r && r[id]) || []) data[iso(new Date(p.start))] = p;
    } catch (e) { data = null; }
    this._cache.set(key, { at: Date.now(), data });
    return data;
  }
  _batLiveHtml() {
    const E = this._batEnt(), st = this._hass.states, S = (k) => (E[k] && st[E[k]]) || null;
    const num = (k) => { const x = S(k); const n = x ? parseFloat(x.state) : NaN; return isFinite(n) ? n : NaN; };
    const soc = num('soc'), res = num('reserve'), pw = num('power'), capK = +this._cfg.capacity;
    const force = S('force') ? S('force').state === 'on' : null, mode = S('mode') ? S('mode').state : null;
    const chg = pw > 25, dis = pw < -25;
    const pill = force ? ['on', 'Încărcare forțată'] : chg ? ['on', 'Se încarcă'] : dis ? ['dis', 'Se descarcă'] : ['', isFinite(pw) ? 'În repaus' : 'Indisponibilă'];
    const kpi = (l, val, u, sub, extra = '') => `<div class="kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${extra}${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const bar = isFinite(soc) ? `<div class="socb" role="img" aria-label="Baterie ${F0(soc)}%${isFinite(res) ? `, rezervă ${F0(res)}%` : ''}"><i style="width:${Math.max(0, Math.min(100, soc))}%"></i>${isFinite(res) ? `<b style="left:${Math.max(0, Math.min(100, res))}%"></b>` : ''}</div>` : '';
    const socK = kpi('Stare de încărcare', isFinite(soc) ? F0(soc) : '—', '%', `${isFinite(res) ? `rezervă ${F0(res)}%` : ''}${isFinite(soc) && capK > 0 ? `${isFinite(res) ? ' · ' : ''}${kwh(capK * soc / 100)} din ${kwh(capK)} kWh` : ''}`, bar);
    const vi = [isFinite(num('voltage')) ? `${F1(num('voltage'))} V` : '', isFinite(num('current')) ? `${F1(Math.abs(num('current')))} A` : '', isFinite(num('temp')) ? `${F0(num('temp'))} °C` : ''].filter(Boolean).join(' · ');
    const pwK = kpi(chg ? 'Putere de încărcare' : dis ? 'Putere de descărcare' : 'Putere', isFinite(pw) ? F1(Math.abs(pw) / 1000) : '—', 'kW', vi);
    const left = S('left') ? S('left').state : null, full = S('full') ? S('full').state : null;
    const t = chg && isDur(full) ? [full, 'până la 100%'] : dis && isDur(left) ? [left, 'până la rezervă'] : null;
    const tK = (E.left || E.full) ? kpi('Autonomie', t ? esc(t[0]) : '—', '', t ? t[1] : esc((chg ? full : left) || 'nu se descarcă')) : '';
    const ms = S('minsoc'), msv = this._batM != null ? this._batM : num('minsoc');
    const mmin = ms && isFinite(+ms.attributes.min) ? +ms.attributes.min : 0, mmax = ms && isFinite(+ms.attributes.max) ? +ms.attributes.max : 100;
    const modes = mode && !ESS_MODES.some(([k]) => k === mode) ? [...ESS_MODES, [mode, mode === 'external_control' ? 'Control extern' : mode]] : ESS_MODES;
    const ctl = [
      mode !== null ? `<div class="cg"><div class="l">Mod ESS</div><div class="seg bat-mode" role="group" aria-label="Modul ESS">${modes.map(([k, l]) => `<button data-m="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>` : '',
      ms ? `<div class="cg socm"><div class="l"><label for="bat-mi">SoC minim</label></div><div class="sl"><div class="rg"><input type="range" class="bat-ms" min="${mmin}" max="${mmax}" step="10" value="${isFinite(msv) ? msv : mmin}" list="bat-ticks" aria-label="SoC minim, din 10 în 10">`
        + `<datalist id="bat-ticks">${Array.from({ length: Math.floor((mmax - mmin) / 10) + 1 }, (_, i) => `<option value="${mmin + i * 10}"></option>`).join('')}</datalist>`
        + `<div class="sc"><span>${F0(mmin)}</span><span>${F0((mmin + mmax) / 2)}</span><span>${F0(mmax)}</span></div></div>`
        + `<input id="bat-mi" class="bat-mi" type="text" inputmode="numeric" autocomplete="off" value="${isFinite(msv) ? F0(msv) : ''}"><span class="u">%</span></div></div>` : '',
      force !== null ? `<div class="cg"><div class="l">Încărcare forțată din rețea</div><button class="sw bat-force" role="switch" aria-checked="${force}" aria-label="Încărcare forțată din rețea"></button></div>` : '',
    ].join('');
    const lims = BAT_LIMS.filter(([k]) => S(k)).map(([k, l, u, h]) => {
      const v = num(k);
      return `<div class="fld"><label for="lim-${k}">${l}</label><div class="in"><input id="lim-${k}" data-k="${k}" type="text" inputmode="numeric" autocomplete="off" placeholder="fără limită" value="${isFinite(v) && v >= 0 ? F0(v).replace(/\./g, '') : ''}"${h ? ` aria-describedby="lim-${k}-h"` : ''}><span>${u}</span></div>${h ? `<div class="h" id="lim-${k}-h">${h}</div>` : ''}</div>`;
    }).join('');
    return `<div class="box live">
 <div class="hd"><div><div class="ttl">Bateria acum</div><div class="note" style="margin:0">${mode ? esc(ESS_NOTE[mode] || mode) : 'acum'}</div></div>
  <span class="pill${pill[0] ? ' ' + pill[0] : ''}"><i></i>${pill[1]}</span></div>
 <div class="kpis" style="--k:${tK ? 3 : 2};margin-top:12px">${socK}${pwK}${tK}</div>
 ${ctl ? `<div class="ctl">${ctl}</div>` : ''}
 ${lims ? `<div class="sub"><div class="l2">Limite</div><div class="note" style="margin:0">Câmp gol = fără limită. Se aplică doar după ce apeși „Aplică limitele”.</div><div class="lims">${lims}</div>
  <div class="row acts"><span></span><button class="btn pri bat-lim">Aplică limitele</button></div></div>` : ''}
 <div class="cf" hidden role="alertdialog"><span class="t"></span><button class="btn pri cf-ok">Confirmă</button><button class="btn cf-no">Renunță</button></div>
 <div class="note bat-st" role="status"></div></div>`;
  }
  _wireBat(box) {
    const E = this._batEnt(), cf = box.querySelector('.cf');
    // caseta se poate redesena cât așteaptă comanda: mesajul merge în caseta de acum
    const msg = (t, cls = '') => { const stl = this.shadowRoot.querySelector('.live .bat-st') || box.querySelector('.bat-st'); stl.textContent = t; stl.className = `note bat-st${cls ? ' ' + cls : ''}`; };
    const call = (domain, service, data) => this._hass.callService(domain, service, data);
    const fail = (e) => msg(`Comanda nu a mers: ${e && e.message ? e.message : e}`, 'warn');
    // fiecare comandă care schimbă cum lucrează bateria cere o confirmare
    const ask = (text, fn) => {
      this._batAsk = true; msg('');
      cf.querySelector('.t').textContent = text; cf.hidden = false; cf.querySelector('.cf-ok').focus();
      const done = (ok) => { cf.hidden = true; this._batAsk = false; cf.querySelector('.cf-ok').onclick = cf.querySelector('.cf-no').onclick = null; if (ok) fn(); else this._syncBat(true); };
      cf.querySelector('.cf-ok').onclick = () => done(true);
      cf.querySelector('.cf-no').onclick = () => done(false);
    };
    box.querySelectorAll('.bat-mode button').forEach((b) => b.addEventListener('click', () => {
      const cur = this._hass.states[E.mode] && this._hass.states[E.mode].state;
      if (b.dataset.m === cur) return;
      const name = b.textContent;
      ask(`Schimbi modul ESS în „${name}”?`, () => {
        box.querySelectorAll('.bat-mode button').forEach((x) => x.setAttribute('aria-pressed', x === b));
        call('select', 'select_option', { entity_id: E.mode, option: b.dataset.m }).then(() => msg(`Mod ESS: ${name}.`, 'ok'), fail);
      });
    }));
    const force = box.querySelector('.bat-force');
    if (force) force.addEventListener('click', () => {
      const on = force.getAttribute('aria-checked') !== 'true';
      ask(on ? 'Pornești încărcarea forțată a bateriei din rețea? Rămâne pornită până o oprești.' : 'Oprești încărcarea forțată din rețea?', () => {
        force.setAttribute('aria-checked', on); force.disabled = true;
        call('switch', on ? 'turn_on' : 'turn_off', { entity_id: E.force }).then(() => msg(on ? 'Încărcarea forțată a pornit.' : 'Încărcarea forțată s-a oprit.', 'ok'), fail).finally(() => { force.disabled = false; });
      });
    });
    // SoC-ul minim: sliderul (din 10 în 10) trimite la eliberare, câmpul la Enter sau la ieșirea din el
    const ms = this._hass.states[E.minsoc], rg = box.querySelector('.bat-ms'), mi = box.querySelector('.bat-mi');
    const lo = ms && isFinite(+ms.attributes.min) ? +ms.attributes.min : 0, hi = ms && isFinite(+ms.attributes.max) ? +ms.attributes.max : 100;
    const send = (value, delay) => {
      this._batM = value; clearTimeout(this._batT);
      this._batT = setTimeout(() => {
        call('number', 'set_value', { entity_id: E.minsoc, value }).then(() => msg(`SoC minim: ${F0(value)}%.`, 'ok'), fail)
          .finally(() => { if (this._batM === value) { this._batM = null; this._syncBat(true); } });
      }, delay);
    };
    if (rg) {
      rg.addEventListener('input', () => { this._batM = +rg.value; mi.value = rg.value; clearTimeout(this._batT); });
      rg.addEventListener('change', () => send(+rg.value, 300));
    }
    if (mi) {
      mi.addEventListener('input', () => { this._batTyping = true; });
      mi.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') mi.blur(); });
      mi.addEventListener('change', () => {
        this._batTyping = false;
        const n = parseNum(mi.value), cur = parseFloat(ms && ms.state);
        if (n === null || !isFinite(n) || Math.round(n) !== n || n < lo || n > hi) {
          msg(`SoC minim: scrie un număr întreg între ${F0(lo)} și ${F0(hi)}.`, 'warn');
          mi.value = isFinite(cur) ? F0(cur) : ''; if (rg && isFinite(cur)) rg.value = cur;
          return;
        }
        if (rg) rg.value = n;
        if (n !== cur) send(n, 0);
      });
    }
    box.querySelectorAll('.lims input').forEach((i) => i.addEventListener('input', () => { this._batDirty = true; }));
    const apply = box.querySelector('.bat-lim');
    if (apply) apply.addEventListener('click', () => {
      const ch = [];
      for (const inp of box.querySelectorAll('.lims input')) {
        const k = inp.dataset.k, x = this._hass.states[E[k]], lim = BAT_LIMS.find((l) => l[0] === k);
        const raw = inp.value.trim(), n = raw === '' ? -1 : parseNum(raw.replace(/\./g, ''));
        const max = x && isFinite(+x.attributes.max) ? +x.attributes.max : Infinity;
        if (!isFinite(n) || (n !== -1 && (n < 0 || n > max || Math.round(n) !== n))) { msg(`${lim[1]}: scrie un număr întreg între 0 și ${F0(max)} sau lasă câmpul gol.`, 'warn'); inp.focus(); return; }
        const cur = x ? parseFloat(x.state) : NaN;
        if (n !== cur) ch.push({ k, n, cur, lim });
      }
      if (!ch.length) { msg('Nicio limită schimbată.'); this._batDirty = false; return; }
      const fmt = (v, u) => (v === -1 || !isFinite(v) ? 'fără limită' : `${F0(v)} ${u}`);
      ask(`Setezi ${ch.map((c) => `${c.lim[1].toLowerCase()}: ${fmt(c.cur, c.lim[2])} → ${fmt(c.n, c.lim[2])}`).join('; ')}?`, async () => {
        apply.disabled = true;
        try {
          for (const c of ch) await call('number', 'set_value', { entity_id: E[c.k], value: c.n });
          msg(ch.length === 1 ? 'Limita a fost aplicată.' : 'Limitele au fost aplicate.', 'ok');
        } catch (e) { fail(e); }
        apply.disabled = false; this._batDirty = false; this._syncBat(true);
      });
    });
  }
  // HA trimite `hass` la fiecare schimbare: redesenăm doar caseta live, și nu cât timp utilizatorul lucrează în ea
  _syncBat(force = false) {
    const box = this.shadowRoot && this.shadowRoot.querySelector('.live');
    if (!box || !this._hass) return;
    const key = this._batKey();
    if (this._batM != null || this._batAsk || this._batDirty || this._batTyping) return;
    if (!force && key === this._batK) return;
    this._batK = key;
    const keep = box.querySelector('.bat-st'), note = keep ? [keep.textContent, keep.className] : null;
    const t = document.createElement('div'); t.innerHTML = this._batLiveHtml();
    const nb = t.firstElementChild; box.replaceWith(nb); this._wireBat(nb);
    if (note && note[0]) { const s = nb.querySelector('.bat-st'); s.textContent = note[0]; s.className = note[1]; }
  }
  _renderBat() {
    const w = this.shadowRoot && this.shadowRoot.querySelector('.w'); if (!w || !this._hass) return;
    const t = today(), { from, to } = this._range();
    const nav = `<div class="box"><div class="nav"><div class="t">${esc(this._title())}</div>
      <div class="bt"><button class="prev" aria-label="Luna trecută">‹</button><button class="now">Acum</button>
      <button class="next" aria-label="Luna următoare"${to >= t ? ' disabled' : ''}>›</button></div></div>${this._err ? '' : '<div class="take"></div>'}</div>`;
    const live = this._batLiveHtml();
    const done = () => { this._wire(w); this._wireBat(w.querySelector('.live')); this._batK = this._batKey(); };
    if (this._err || !this._bat) {
      w.innerHTML = nav + live + (this._err ? `<div class="box msg">Nu am putut citi istoricul VRM: ${esc(this._err)}</div>` : '');
      return done();
    }
    const B = this._bat, capK = +this._cfg.capacity > 0 ? +this._cfg.capacity : NaN, ym = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
    const socD = B.soc || {}, sv = (p, k) => (p && isFinite(+p[k]) ? +p[k] : NaN);
    const rows = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const p = socD[iso(d)];
      rows.push(Object.assign(mk(iso(d), B.days.days[iso(d)], B.days.codes), { label: String(d.getDate()), tip: cap(`${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI_L[d.getMonth()]}`), d, future: d > t,
        smin: sv(p, 'min'), smax: sv(p, 'max'), smean: sv(p, 'mean') }));
    }
    const hod = Array.from({ length: 24 }, () => B.flows.codes.map(() => 0));
    for (const day of Object.values(B.flows.hours)) for (const [hh, vals] of Object.entries(day)) hod[+hh] = hod[+hh].map((x, i) => x + (vals[i] || 0));
    this._extra = { hod: hod.map((vals, h) => Object.assign(mk(p2(h), vals, B.flows.codes), { label: p2(h), tip: `${p2(h)}:00 – ${p2((h + 1) % 24)}:00` })), soc: rows };
    const tot = sum(rows), n = rows.filter((r) => r.any).length, sdays = rows.filter((r) => isFinite(r.smin));
    const smin = sdays.length ? Math.min(...sdays.map((r) => r.smin)) : NaN, smax = sdays.length ? Math.max(...sdays.map((r) => r.smax)) : NaN;
    const eff = (r) => (r.chg > 0 ? r.dis / r.chg : NaN);
    const per = `${LUNI_L[from.getMonth()]} ${from.getFullYear()}`;
    const first = parse(this._info.start);
    const take = n
      ? `În ${per}, bateria s-a încărcat cu <b>${kwh(tot.chg)} kWh</b>, <b>${tot.chg > 0 ? pct(tot.v.Pb / tot.chg) : '—'}</b> din solar, și a dat <b>${kwh(tot.dis)} kWh</b>: <b>${kwh(tot.v.Bc)} kWh</b> spre consum și <b>${kwh(tot.v.Bg)} kWh</b> în rețea. `
        + `A acoperit <b>${tot.cons > 0 ? pct(tot.v.Bc / tot.cons) : '—'}</b> din consumul casei${tot.ev > 0 ? ' și al mașinii' : ''}`
        + (isFinite(capK) ? `, cât <b>${F1(tot.dis / capK)} cicluri</b> complete.` : '.')
        + (isFinite(smin) ? ` Starea de încărcare a fost între <b>${F0(smin)}%</b> și <b>${F0(smax)}%</b>.` : '')
      : first && to < first ? `Istoricul VRM începe pe ${esc(this._info.start)}.` : `Nu există date VRM pentru ${per}.`;
    const kpi = (l, val, u, s = '') => `<div class="box kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const avg = (x) => (n ? `Ø ${kwh(x / n)} kWh/zi` : '');

    // pe zile, în luna afișată
    const dcols = (r) => `<td>${kwh(r.chg)}</td><td class="hn">${kwh(r.v.Gb)}</td><td>${kwh(r.dis)}</td><td class="hn">${kwh(r.v.Bg)}</td><td>${isFinite(r.smin) ? F0(r.smin) : '—'}</td><td>${isFinite(r.smax) ? F0(r.smax) : '—'}</td>`;
    const dhead = `<thead><tr><th>Ziua</th>${th('Încărcare', 'Înc.', 'kWh')}${th('Din rețea', '', 'kWh', 'hn')}${th('Descărcare', 'Desc.', 'kWh')}${th('În rețea', '', 'kWh', 'hn')}${th('SoC minim', 'Min', '%')}${th('SoC maxim', 'Max', '%')}</tr></thead>`;
    const dbody = rows.filter((r) => r.any || !r.future).slice().reverse().map((r) => `<tr class="${r.any ? 'go' : 'nil'}" data-d="${r.k}"><td><span class="hn">${esc(r.tip)}</span><span class="hm">${esc(r.label)}</span></td>${dcols(r)}</tr>`).join('');
    const dtot = Object.assign(sum(rows), { smin, smax });

    // pe luni și pe ani, din totalurile VRM
    const Y = B.years.years, mons = [], yrs = [];
    for (const y of Object.keys(Y).sort().reverse()) {
      const yr = Object.assign(mk(y, Y[y].t, B.years.codes), { days: Object.values(Y[y].n || {}).reduce((a, x) => a + x, 0) });
      if (yr.any) yrs.push(yr);
      for (const m of Object.keys(Y[y].m).sort().reverse()) {
        const r = Object.assign(mk(`${y}-${m}`, Y[y].m[m], B.years.codes), { days: (Y[y].n && Y[y].n[m]) || 0 });
        if (r.any) mons.push(r);
      }
    }
    const pcols = (r) => `<td>${kwh(r.chg)}</td><td class="hn">${kwh(r.v.Gb)}</td><td>${kwh(r.dis)}</td><td>${isFinite(capK) ? F1(r.dis / capK) : '—'}</td><td class="hn">${pctN(eff(r))}</td><td class="hn">${kwh(Math.max(0, r.loss))}</td>`;
    const phead = (f) => `<thead><tr><th>${f}</th>${th('Încărcare', 'Înc.', 'kWh')}${th('Din rețea', '', 'kWh', 'hn')}${th('Descărcare', 'Desc.', 'kWh')}${th('Cicluri', 'Cicl.')}${th('Randament', '', '%', 'hn')}${th('Pierderi', '', 'kWh', 'hn')}</tr></thead>`;
    const mrows = mons.map((r) => { const [y, m] = r.k.split('-'); return `<tr class="go${r.k === ym(from) ? ' sel' : ''}" data-m="${r.k}"><td><span class="hn">${cap(LUNI_L[+m - 1])} ${y}</span><span class="hm">${cap(LUNI[+m - 1])} ${y.slice(2)}</span></td>${pcols(r)}</tr>`; }).join('');
    const yrows = yrs.map((r) => `<tr class="go${r.k === String(from.getFullYear()) ? ' sel' : ''}" data-m="${r.k}-${mons.find((x) => x.k.startsWith(r.k)).k.slice(5)}"><td>${r.k}${r.k === String(t.getFullYear()) ? ' <span class="hn" style="color:' + C.muted + '">(în curs)</span>' : ''}</td>${pcols(r)}</tr>`).join('');
    const ytot = sum(yrs);

    this._rows = rows; this._tot = tot; this._socRef = parseFloat(this._hass.states[this._batEnt().reserve] && this._hass.states[this._batEnt().reserve].state);
    this._socRange = [smin, smax];
    const charts = BAT_CHARTS.filter((c) => c.kind !== 'soc' || sdays.length);
    this._chartList = charts; this._wide = this._wide || loadWide();
    w.innerHTML = nav + live + `
<div class="kpis" style="--k:4">${kpi('Încărcare', kwh(tot.chg), 'kWh', `${kwh(tot.v.Pb)} kWh solar · ${kwh(tot.v.Gb)} kWh rețea`)}${kpi('Descărcare', kwh(tot.dis), 'kWh', `${kwh(tot.v.Bc)} kWh consum · ${kwh(tot.v.Bg)} kWh rețea`)}${kpi('Consum din baterie', tot.cons > 0 ? pctN(tot.v.Bc / tot.cons) : '—', tot.cons > 0 ? '%' : '', `din consumul ${tot.ev > 0 ? 'casei și al mașinii' : 'casei'} · ${avg(tot.v.Bc)}`)}${isFinite(capK) ? kpi('Cicluri complete', F1(tot.dis / capK), '', `descărcare ÷ ${kwh(capK)} kWh capacitate`) : kpi('Randament', pctN(eff(tot)), isFinite(eff(tot)) ? '%' : '', 'descărcare ÷ încărcare')}</div>
<div class="charts">${charts.map((c) => this._box(c)).join('')}</div>
<div class="box"><div class="ttl">Pe zile</div><div class="note">Apasă pe o zi pentru detalii</div>
 <div class="tw"><table>${dhead}<tbody>${dbody}</tbody><tfoot><tr><td>Total</td>${dcols(dtot)}</tr></tfoot></table></div></div>
${mrows ? `<h2>Pe luni<small>apasă pe o lună</small></h2><div class="box"><div class="note">Randamentul (descărcare ÷ încărcare) include consumul invertorului în gol și pierderile conversiilor; pe o lună, energia rămasă în baterie contează puțin</div><div class="tw"><table>${phead('Luna')}<tbody class="evm">${mrows}</tbody></table></div></div>` : ''}
${yrows ? `<h2>Pe ani<small>apasă pe un an pentru ultima lui lună</small></h2><div class="box"><div class="tw"><table>${phead('An')}<tbody class="evm">${yrows}</tbody>${yrs.length > 1 ? `<tfoot><tr><td>Total</td>${pcols(ytot)}</tr></tfoot>` : ''}</table></div></div>` : ''}
<div class="foot">Energia vine din istoricul orar VRM, starea de încărcare din statisticile Home Assistant${isFinite(capK) ? ` · capacitate ${kwh(capK)} kWh` : ''} · ${esc(this._info.site)}</div>`;
    w.querySelector('.take').innerHTML = take;
    done();
    w.querySelectorAll('tr.go[data-d]').forEach((tr) => tr.addEventListener('click', () => this._go('zi', parse(tr.dataset.d))));
    w.querySelectorAll('tbody.evm tr').forEach((tr) => tr.addEventListener('click', () => { const [y, m] = tr.dataset.m.split('-'); this._d = new Date(+y, +m - 1, 1); this._sync(); this._load(); window.scrollTo({ top: 0 }); }));
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(charts.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }

  // ── amortizare: investiția recuperată din câștigul lunar ────────────
  _fin() {
    const f = (this._info && this._info.finance) || {};
    const list = priceList(f), cur = list[list.length - 1] || {};
    return { inv: f.investment, list, P: cur.import, PI: cur.export };
  }
  _renderPay() {
    const w = this.shadowRoot && this.shadowRoot.querySelector('.w'); if (!w) return;
    const head = `<div class="box"><div class="nav"><div class="t">Amortizare</div></div><div class="take"></div></div>`;
    if (this._err) { w.innerHTML = head + `<div class="box msg">Nu am putut citi istoricul VRM: ${esc(this._err)}</div>`; return; }
    if (!this._info || !this._yrs) return;
    const { inv, list, P, PI } = this._fin();
    if (!(inv > 0) || !list.length || !list.every((q) => q.import > 0 && q.export >= 0)) {
      w.innerHTML = head + `<div class="box msg">Completează valoarea investiției și prețurile energiei în <button class="btn go-set">Setări</button></div>`;
      w.querySelector('.take').remove();
      w.querySelector('.go-set').addEventListener('click', () => this._go('setari'));
      return;
    }
    const yrs = this._yrs, months = [];
    for (const ys of Object.keys(yrs.years).sort()) {
      const y = yrs.years[ys];
      for (const ms of Object.keys(y.m).sort()) {
        const m = +ms - 1, first = !months.length || m === 0, pr = priceAt(list, `${ys}-${ms}`);
        months.push(money(Object.assign(mk(`${ys}-${ms}`, y.m[ms], yrs.codes), {
          label: first ? `${LUNI[m]} ${ys.slice(2)}` : LUNI[m], tip: cap(`${LUNI_L[m]} ${ys}`),
          d: new Date(+ys, m, 1), days: (y.n && y.n[ms]) || 0, y: ys }), pr.import, pr.export));
      }
    }
    let cum = 0, paidAt = null;
    for (const r of months) { cum += r.gain; r.cum = cum; if (paidAt === null && cum >= inv) paidAt = r; }
    const rec = cum, left = Math.max(0, inv - rec), pc = Math.min(1, rec / inv);
    // ritmul: ultimele 12 luni încheiate (un an întreg de anotimpuri); cu istoric mai scurt, tot ce există
    const t0 = today(), done = months.filter((r) => r.d.getFullYear() * 12 + r.d.getMonth() < t0.getFullYear() * 12 + t0.getMonth());
    const last = (done.length ? done : months).slice(-12), n12 = last.length, lastDays = last.reduce((a, r) => a + r.days, 0);
    // estimarea viitorului: aceleași luni, la prețurile de acum
    const rate = lastDays >= 28 ? last.reduce((a, r) => a + gainAt(r, P, PI), 0) / lastDays : NaN;
    const atNow = last.some((r) => r.P !== P || r.PI !== PI) ? ', la prețurile actuale' : '';
    const yr12 = { billNo: last.reduce((a, r) => a + r.billNo, 0), bill: last.reduce((a, r) => a + r.bill, 0) };
    const dl = isFinite(rate) && rate > 0 ? left / rate : NaN;
    const eta = isFinite(dl) ? new Date(Date.now() + dl * 86400000) : null;
    const yy = isFinite(dl) ? Math.floor(dl / 365.25) : 0, mm = isFinite(dl) ? Math.round((dl - yy * 365.25) / 30.44) : 0;
    const span = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const remain = !isFinite(dl) ? '—' : left === 0 ? 'amortizat' : [yy ? span(yy, 'an', 'ani') : '', mm ? span(mm, 'lună', 'luni') : ''].filter(Boolean).join(' ') || 'sub o lună';
    const roi = isFinite(rate) ? rate * 365.25 / inv : NaN;
    const st = parse(this._info.start), since = st ? `${st.getDate()} ${LUNI_L[st.getMonth()]} ${st.getFullYear()}` : esc(this._info.start);
    const kpi = (l, val, u, s = '') => `<div class="box kpi"><div class="l">${l}</div><div class="v">${val}<span class="u">${u}</span></div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const sgn = (x) => (x < 0 ? '−' + lei(-x) : lei(x));
    const take = `De la ${since}, sistemul a adus <b>${lei(rec)} lei</b>: <b>${lei(months.reduce((a, r) => a + r.v.eco, 0))} lei</b> din energia consumată fără s-o cumperi și <b>${lei(months.reduce((a, r) => a + r.v.injv, 0))} lei</b> din energia injectată. `
      + (paidAt ? `Investiția a fost recuperată în ${LUNI_L[paidAt.d.getMonth()]} ${paidAt.d.getFullYear()}.`
        : isFinite(rate) ? `În ultimele ${n12} luni încheiate câștigul a fost în medie <b>${lei(rate)} lei/zi</b>${atNow}; în ritmul ăsta, restul de <b>${lei(left)} lei</b> se recuperează în <b>${remain}</b>.` : '');

    const cols = (r) => `<td class="hn">${lei(r.billNo)}</td><td class="hn">${sgn(r.bill)}</td><td>${lei(r.v.eco)}</td><td>${lei(r.v.injv)}</td><td>${lei(r.gain)}</td>`;
    const th2 = `${th('Fără sistem', '', 'lei', 'hn')}${th('Cu sistem', '', 'lei', 'hn')}${th('Economii', 'Econ.', 'lei')}${th('Injecție', 'Inj.', 'lei')}${th('Câștig', 'Câștig', 'lei')}`;
    const mrows = months.slice().reverse().map((r) => `<tr class="go" data-k="${r.k}" title="Preț ${F2(r.P)} lei/kWh din rețea, ${F2(r.PI)} lei/kWh injecție"><td><span class="hn">${esc(r.tip)}</span><span class="hm">${esc(cap(LUNI[r.d.getMonth()]))} ${r.y.slice(2)}</span></td>${cols(r)}<td class="hn">${lei(r.cum)}</td></tr>`).join('');
    const years = Object.keys(yrs.years).sort().map((ys) => {
      const ms = months.filter((r) => r.y === ys), t = { billNo: 0, bill: 0, gain: 0, v: { eco: 0, injv: 0 } };
      for (const r of ms) { t.billNo += r.billNo; t.bill += r.bill; t.gain += r.gain; t.v.eco += r.v.eco; t.v.injv += r.v.injv; }
      return `<tr><td>${ys}${ys === String(today().getFullYear()) ? ' <span class="hn" style="color:' + C.muted + '">(în curs)</span>' : ''}</td>${cols(t)}</tr>`;
    }).join('');
    const tot = { billNo: months.reduce((a, r) => a + r.billNo, 0), bill: months.reduce((a, r) => a + r.bill, 0), gain: rec, v: { eco: months.reduce((a, r) => a + r.v.eco, 0), injv: months.reduce((a, r) => a + r.v.injv, 0) } };

    this._rows = months; this._tot = sum(months); this._tot.v.eco = tot.v.eco; this._tot.v.injv = tot.v.injv;
    this._chartList = PAY_CHARTS; this._wide = this._wide || loadWide();
    w.innerHTML = `<div class="box"><div class="nav"><div class="t">Amortizare</div></div><div class="take">${take}</div></div>
<div class="box"><div class="hd"><div><div class="ttl">Investiție recuperată</div><div class="note">din ${lei(inv)} lei, de la ${since}</div></div><div class="pct">${F1(pc * 100)}%</div></div>
 <div class="bar" role="progressbar" aria-label="Investiție recuperată" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${(pc * 100).toFixed(1)}"><i style="width:${(pc * 100).toFixed(2)}%"></i></div>
 <div class="bl"><span>Recuperat <b>${lei(rec)} lei</b></span><span>Rămas <b>${lei(left)} lei</b></span></div></div>
<div class="kpis" style="--k:3">${kpi('Câștig mediu', isFinite(rate) ? lei(rate) : '—', 'lei/zi', `${n12 === 12 ? 'ultimele 12 luni încheiate' : `ultimele ${n12} luni`}${atNow} · ≈ ${isFinite(rate) ? lei(rate * 30.44) : '—'} lei/lună`)}${kpi('Timp rămas', remain, '', 'dacă ritmul se păstrează')}${kpi('Amortizare estimată', paidAt ? cap(`${LUNI_L[paidAt.d.getMonth()]} ${paidAt.d.getFullYear()}`) : eta ? cap(`${LUNI_L[eta.getMonth()]} ${eta.getFullYear()}`) : '—', '', paidAt ? 'investiția e recuperată' : 'luna în care câștigul acoperă investiția')}
${kpi('Randament anual', isFinite(roi) ? F1(roi * 100) : '—', '%', `${isFinite(rate) ? lei(rate * 365.25) : '—'} lei/an din ${lei(inv)} lei`)}${kpi('Fără sistem', lei(yr12.billNo), 'lei', `factura pe ${n12 === 12 ? 'ultimele 12 luni' : `${n12} luni`}, tot consumul din rețea`)}${kpi('Cu sistem', sgn(yr12.bill), 'lei', `factura pe ${n12 === 12 ? 'ultimele 12 luni' : `${n12} luni`}, cu compensarea lunară`)}</div>
<div class="charts">${PAY_CHARTS.map((c) => this._box(c)).join('')}</div>
<div class="box"><div class="ttl">Pe luni</div><div class="note">Apasă pe o lună pentru detalii</div>
 <div class="tw"><table><thead><tr><th>Luna</th>${th2}${th('Recuperat', '', 'lei', 'hn')}</tr></thead><tbody>${mrows}</tbody></table></div></div>
<h2>Pe ani</h2><div class="box"><div class="tw"><table><thead><tr><th>An</th>${th2}</tr></thead><tbody>${years}</tbody><tfoot><tr><td>Total</td>${cols(tot)}</tr></tfoot></table></div></div>
<div class="foot">${list.length > 1 ? `Prețuri din Setări: fiecare lună cu prețul ei, acum ${F2(P)} lei/kWh din rețea și ${F2(PI)} lei/kWh injectat` : `Preț din Setări: ${F2(P)} lei/kWh din rețea, ${F2(PI)} lei/kWh injectat, pentru toată perioada`} · importul și injecția se compensează lunar · istoric VRM din ${since}</div>`;
    w.querySelectorAll('tbody tr.go').forEach((tr) => tr.addEventListener('click', () => this._go('luna', parse(tr.dataset.k + '-01'))));
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(PAY_CHARTS.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }

  // ── setări: mărimea textului (per dispozitiv) și automatizarea cu notificări ─
  _auto() {
    const id = this._cfg.automation, st = id && this._hass ? this._hass.states[id] : null;
    return { id, st, on: !!st && st.state === 'on', last: st && st.attributes.last_triggered };
  }
  _renderSettings() {
    const w = this.shadowRoot && this.shadowRoot.querySelector('.w'); if (!w || !this._hass) return;
    const fz = this._fz || loadFz(), a = this._auto(), i = this._info;
    const st = i ? parse(i.start) : null;
    let notif;
    if (!a.id) notif = `<div class="note" style="margin-top:10px">Adaugă în configurația cardului <code>automation: automation.…</code> cu automatizarea care trimite rezumatele.</div>`;
    else if (!a.st) notif = `<div class="note warn" style="margin-top:10px">Automatizarea ${esc(a.id)} nu există.</div>`;
    else notif = `<div class="row"><span class="l">Trimite rezumatele pe telefon</span><button class="sw" role="switch" aria-checked="${a.on}" aria-label="Notificări"></button></div>
      <ul class="sch"><li>în fiecare zi la 8:00, rezumatul zilei de ieri</li><li>pe 1 ale lunii, și rezumatul lunii trecute</li><li>pe 1 ianuarie, și rezumatul anului trecut</li></ul>
      <div class="row"><span class="note" style="margin:0">Ultima trimitere: <span class="lt">${esc(stamp(a.last))}</span></span><button class="btn test">Trimite acum</button></div>`;
    w.innerHTML = `<div class="box"><div class="nav"><div class="t">Setări</div></div></div>
<div class="set"><div class="col">
 <div class="box"><div class="ttl">Mărime text</div><div class="note">Se aplică tuturor paginilor Energie VRM, doar pe acest dispozitiv</div>
  <div class="seg">${FZ.map(([l, v]) => `<button data-fz="${v}" aria-pressed="${v === fz}">${l}</button>`).join('')}</div>
  <div class="kpi" style="margin-top:14px"><div class="l">Exemplu</div><div class="v">${kwh(18.4)}<span class="u">kWh</span></div><div class="s">Ø ${kwh(15.9)} kWh/zi</div></div></div>
 ${this._panelBox()}
 <div class="box"><div class="ttl">Notificări</div><div class="note" style="margin:0">Automatizarea ${a.st ? esc(a.st.attributes.friendly_name || a.id) : ''}</div>${notif}</div>
 </div><div class="col">
 ${this._finBox()}
 <div class="box"><div class="ttl">Sincronizare VRM</div>${this._err ? `<div class="note warn" style="margin-top:10px">${esc(this._err)}</div>` : i ? `<dl class="kv">
  <dt>Instalație</dt><dd>${esc(i.site)}</dd>
  <dt>Ultima sincronizare</dt><dd>${esc(stamp(i.synced))}</dd>
  <dt>Istoric din</dt><dd>${st ? `${st.getDate()} ${LUNI[st.getMonth()]} ${st.getFullYear()}` : esc(i.start)}</dd>
  <dt>Stare</dt><dd class="${i.backfilling ? 'warn' : 'ok'}">${i.backfilling ? 'se descarcă istoricul…' : 'complet'}</dd>
  <dt>Versiune card</dt><dd>${VERSION}</dd></dl>` : ''}</div>
</div></div>`;
    this._wireFin(w);
    this._wirePanel(w);
    w.querySelectorAll('.seg button[data-fz]').forEach((b) => b.addEventListener('click', () => {
      saveFz(+b.dataset.fz);
      window.dispatchEvent(new Event(FZ_EVENT));
    }));
    const sw = w.querySelector('.sw');
    if (sw) sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.disabled = true;
      this._hass.callService('automation', on ? 'turn_on' : 'turn_off', { entity_id: a.id })
        .catch((e) => console.error('victron-vrm-card: automatizarea nu a putut fi schimbată', e))
        .finally(() => { sw.disabled = false; });
    });
    const test = w.querySelector('.test');
    if (test) test.addEventListener('click', () => {
      test.disabled = true; test.textContent = 'Se trimite…';
      this._hass.callService('automation', 'trigger', { entity_id: a.id, skip_condition: true })
        .then(() => { test.textContent = 'Trimis'; })
        .catch(() => { test.textContent = 'Eroare'; })
        .finally(() => setTimeout(() => { test.disabled = false; test.textContent = 'Trimite acum'; }, 3000));
    });
    this._autoKey = `${a.st ? a.st.state : ''}|${a.last || ''}`;
  }
  _panelBox() {
    const cur = loadPanel(), admin = !this._hass.user || this._hass.user.is_admin;
    return `<div class="box"><div class="ttl">Culoarea casetelor</div><div class="note">Aceeași pe toate dispozitivele${admin ? '' : '; o poate schimba doar un administrator'}</div>
  <div class="seg">${PANELS.map(([l, v]) => `<button data-panel="${v}" aria-pressed="${v === cur}"${admin ? '' : ' disabled'}><i class="swc" style="background:${v}"></i>${l}</button>`).join('')}</div>
  <div class="note pst" aria-live="polite"></div></div>`;
  }
  _wirePanel(w) {
    const btns = [...w.querySelectorAll('.seg button[data-panel]')], st = w.querySelector('.pst');
    btns.forEach((b) => b.addEventListener('click', async () => {
      const v = b.dataset.panel;
      if (v === loadPanel()) return;
      btns.forEach((x) => { x.disabled = true; });
      st.textContent = 'Se salvează…'; st.className = 'note pst';
      try {
        const msg = { type: 'victron_vrm/panel', panel: v };
        const res = await this._hass.callWS(this._cfg.entry_id ? { ...msg, entry_id: this._cfg.entry_id } : msg);
        this._info = { ...this._info, panel: res.panel };
        this._cache.clear();
        this._setPanel(res.panel);
        btns.forEach((x) => x.setAttribute('aria-pressed', x.dataset.panel === okPanel(res.panel)));
        st.textContent = '';
      } catch (e) {
        st.textContent = `Nu am putut salva: ${e.message || e}`; st.className = 'note pst warn';
      } finally { btns.forEach((x) => { x.disabled = false; }); }
    }));
  }
  _finBox() {
    const f = (this._info && this._info.finance) || {}, admin = !this._hass.user || this._hass.user.is_admin;
    return `<div class="box"><div class="ttl">Investiție și prețuri</div><div class="note">Folosite în pagina Amortizare, aceleași pe toate dispozitivele</div>
  <div class="fld"><label for="f-investment">Valoarea investiției</label><div class="in inv"><input id="f-investment" type="text" inputmode="decimal" autocomplete="off" value="${numS(f.investment)}"${admin ? '' : ' disabled'}><span>lei</span></div></div>
  <div class="sub"><div class="l2">Prețul energiei</div><div class="note">În lei/kWh. Fiecare preț se aplică din luna aleasă până la următorul; Amortizarea calculează fiecare lună cu prețul ei, iar estimarea viitorului cu prețul actual.</div>
  <div class="pl">${this._priceRows(priceList(f).map((q) => ({ from: q.from || '', import: numS(q.import), export: numS(q.export) })), admin)}</div></div>
  ${admin ? '<div class="row acts"><button class="btn padd">+ Adaugă un preț</button><button class="btn pri fsave">Salvează</button></div><div class="note fst" role="status"></div>'
    : '<div class="note" style="margin:12px 0 0">Doar un administrator poate schimba valorile.</div>'}</div>`;
  }
  _priceRows(rows, admin = true) {
    if (!rows.length) rows = [{ from: '', import: '', export: '' }];
    const dis = admin ? '' : ' disabled';
    const inp = (i, k, val) => `<input id="p${i}-${k}" class="p-${k}" type="text" inputmode="decimal" autocomplete="off" aria-label="${k === 'import' ? 'Din rețea' : 'Injecție'}" value="${esc(val)}"${dis}>`;
    return `<div class="pr ph"><span>Din luna</span><span>Din rețea</span><span>Injecție</span><span></span></div>` + rows.map((r, i) => `<div class="pr">
   ${i ? `<input id="p${i}-from" class="p-from" type="month" aria-label="Din luna" placeholder="aaaa-ll" value="${esc(r.from)}"${dis}>` : '<span class="p0">de la început</span>'}
   ${inp(i, 'import', r.import)}${inp(i, 'export', r.export)}
   ${i && admin ? `<button class="tb pdel" data-i="${i}" title="Șterge" aria-label="Șterge prețul din ${esc(r.from)}">${svgI(ICON.close)}</button>` : '<span></span>'}</div>`).join('');
  }
  _readPrices(w) {
    return [...w.querySelectorAll('.pr:not(.ph)')].map((el, i) => ({
      from: i ? el.querySelector('.p-from').value.trim() : '',
      import: el.querySelector('.p-import').value, export: el.querySelector('.p-export').value }));
  }
  _wireFin(w) {
    const save = w.querySelector('.fsave'); if (!save) return;
    const status = w.querySelector('.fst'), pl = w.querySelector('.pl');
    const draw = (rows) => { pl.innerHTML = this._priceRows(rows); };
    const bad = (t, el) => { status.textContent = t; status.className = 'note fst warn'; if (el) el.focus(); };
    pl.addEventListener('click', (e) => {
      const del = e.target.closest('.pdel'); if (!del) return;
      const rows = this._readPrices(w); rows.splice(+del.dataset.i, 1); draw(rows);
    });
    w.querySelector('.padd').addEventListener('click', () => {
      const rows = this._readPrices(w), lastR = rows[rows.length - 1] || {}, t = today();
      let y = t.getFullYear(), m = t.getMonth() + 1, k;
      // luna curentă, sau prima lună liberă după ultima folosită
      for (;;) { k = `${y}-${String(m).padStart(2, '0')}`; if (!rows.some((r) => r.from === k) && rows.every((r) => !r.from || r.from < k)) break; m++; if (m > 12) { m = 1; y++; } }
      rows.push({ from: k, import: lastR.import || '', export: lastR.export || '' });
      draw(rows);
      const ins = pl.querySelectorAll('.p-import'); ins[ins.length - 1].focus();
    });
    save.addEventListener('click', async () => {
      const inv = w.querySelector('#f-investment'), iv = parseNum(inv.value);
      if (iv !== null && !(iv >= 0)) return bad('Valoarea investiției trebuie să fie un număr pozitiv, de exemplu 81.246,17.', inv);
      const prices = [], seen = new Set(), els = [...w.querySelectorAll('.pr:not(.ph)')];
      for (const [i, el] of els.entries()) {
        const fe = el.querySelector('.p-from'), from = i ? fe.value.trim() : null;
        if (i && !/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) return bad('Alege luna de la care se aplică prețul (aaaa-ll, de exemplu 2026-07).', fe);
        if (seen.has(from)) return bad('Două prețuri încep în aceeași lună.', fe);
        seen.add(from);
        const q = { from };
        for (const k of ['import', 'export']) {
          const ie = el.querySelector(`.p-${k}`), n = parseNum(ie.value);
          if (n === null || !(n >= 0)) return bad('Prețurile trebuie să fie numere pozitive, de exemplu 1,11.', ie);
          q[k] = n;
        }
        prices.push(q);
      }
      const msg = { type: 'victron_vrm/finance', investment: iv, price_import: null, price_export: null, prices };
      save.disabled = true; status.textContent = 'Se salvează…'; status.className = 'note fst';
      try {
        const res = await this._hass.callWS(this._cfg.entry_id ? { ...msg, entry_id: this._cfg.entry_id } : msg);
        this._info = { ...this._info, finance: res.finance };
        draw(priceList(res.finance).map((q) => ({ from: q.from || '', import: numS(q.import), export: numS(q.export) })));
        inv.value = numS(res.finance.investment);
        status.textContent = 'Salvat'; status.className = 'note fst ok';
        window.dispatchEvent(new Event(FIN_EVENT));
      } catch (e) {
        status.textContent = `Nu am putut salva: ${e.message || e}`; status.className = 'note fst warn';
      } finally { save.disabled = false; }
    });
  }
  // HA trimite `hass` la fiecare schimbare de stare; redesenăm doar când se schimbă automatizarea
  _syncAuto() {
    const a = this._auto(), key = `${a.st ? a.st.state : ''}|${a.last || ''}`;
    if (key === this._autoKey) return;
    const w = this.shadowRoot && this.shadowRoot.querySelector('.w');
    const sw = w && w.querySelector('.sw');
    if (sw && a.st && this._autoKey !== undefined) {
      sw.setAttribute('aria-checked', a.on);
      const lt = w.querySelector('.lt'); if (lt) lt.textContent = stamp(a.last);
      this._autoKey = key;
    } else this._renderSettings();
  }

  // ── ecran complet: un strat peste toată pagina, în afara cardului ───
  // (pe iPhone nu există Fullscreen API pentru elemente, așa că stratul acoperă oricum ecranul)
  _openFs(c) {
    if (!c || !this._rows) return;
    this._closeFs();
    const host = document.createElement('div');
    host.style.setProperty('--fz', this._fz || 1);
    host.style.setProperty('--vrm-panel', loadPanel());
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${CSS}</style><div class="fs"><div class="hd"><div><div class="ttl">${c.ttl} · ${esc(this._title())}</div><div class="note">${c.note}</div></div>
      <div class="tools"><button class="tb xb" title="Închide" aria-label="Închide">${svgI(ICON.close)}</button></div></div>${this._legend(c)}<div class="ch"></div></div>`;
    document.body.appendChild(host);
    const el = sr.querySelector('.ch');
    const draw = () => { if (el.clientWidth) this._draw(el, c, el.clientWidth, Math.max(200, el.clientHeight)); };
    const onKey = (e) => { if (e.key === 'Escape') this._closeFs(); };
    const onFs = () => { if (this._fs && this._fs.native && !document.fullscreenElement) this._closeFs(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', draw);
    document.addEventListener('fullscreenchange', onFs);
    this._fs = { host, native: false, cleanup: () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', draw);
      document.removeEventListener('fullscreenchange', onFs);
      document.body.style.overflow = overflow;
    } };
    sr.querySelector('.xb').addEventListener('click', () => this._closeFs());
    if (document.fullscreenEnabled && host.requestFullscreen) {
      host.requestFullscreen().then(() => { if (this._fs && this._fs.host === host) this._fs.native = true; }).catch(() => {});
    }
    requestAnimationFrame(draw);
  }
  _closeFs() {
    const f = this._fs; if (!f) return;
    this._fs = null;
    f.cleanup();
    if (document.fullscreenElement === f.host) document.exitFullscreen().catch(() => {});
    f.host.remove();
  }
}
if (!customElements.get('victron-vrm-card')) customElements.define('victron-vrm-card', VictronVrmCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'victron-vrm-card'))
  window.customCards.push({ type: 'victron-vrm-card', name: 'Victron VRM · Istoric', description: `Zi / Săptămână / Lună / An din istoricul VRM (v${VERSION})` });
})();
