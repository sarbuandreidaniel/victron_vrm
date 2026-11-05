/* victron-vrm-card — Zi / Săptămână / Lună / An din istoricul VRM salvat de integrarea victron_vrm */
(() => {
const VERSION = '0.10.2';
// contrast față de panou (#1f1f1f): fg 16,5:1 · soft 10:1 · muted 6,5:1 (AA) · ctl 3,1:1 (marginea controalelor)
const C = { page: '#0b0b0b', panel: '#1f1f1f', border: '#333333', fg: '#ffffff', soft: '#c7c7c7', muted: '#a3a3a3',
  ctl: '#6b6b6b', grid: '#2a2a2a', axis: '#4a4a4a', pop: '#262626', sel: '#3987e5', focus: '#5aa0f0' };
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
const th = (full, short) => `<th><span class="hn">${full}</span><span class="hm">${short}</span></th>`;
const HEAD = (ev) => `${th('Producție', 'Prod.')}<th>Casă</th>${ev ? th('Mașină', 'Maș.') : ''}${th('Import', 'Imp.')}${th('Injecție', 'Inj.')}<th class="hn">Încărcare</th><th class="hn">Descărcare</th>${th('Independență', 'Indep.')}<th class="hn">Autoconsum</th>`;
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
const nf = (d) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const F0 = nf(0).format, F1 = nf(1).format, F2 = nf(2).format;
const lei = (v) => (Math.abs(v) >= 1000 ? F0(v) : F2(v));
const kwh = (v) => (v >= 100 ? F0(v) : F1(v));
const pct = (v) => (isFinite(v) ? F0(v * 100) + '%' : '—');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
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
const PAY_CHARTS = [
  { id: 'cm', ttl: 'Câștig pe luni', note: 'Energia consumată fără s-o cumperi, plus valoarea energiei injectate', up: ['eco', 'injv'], unit: 'lei', num: lei,
    names: { eco: 'Economii din autoconsum', injv: 'Valoarea injecției' } },
];

// bare stivuite în sus / în jos, cu linie opțională; întoarce SVG
function barChart(W, H, rows, o) {
  const up = o.up || [], down = o.down || [], line = o.line, fz = o.fz || 1, fs = Math.round(12 * fz);
  const ml = Math.round(44 * fz), mr = 8, mt = 10, mb = Math.round(26 * fz), iw = W - ml - mr, ih = H - mt - mb;
  const val = (r, c) => r.v[c];
  const maxUp = Math.max(0.1, ...rows.map((r) => Math.max(up.reduce((a, c) => a + val(r, c), 0), line ? r[line] : 0)));
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

const RAW_CSS = `
:host{display:block}
.w{max-width:1404px;margin:0 auto;font-family:${FONT};-webkit-font-smoothing:antialiased;color:${C.fg};background:${C.page};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.box{background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:16px;position:relative}
.nav{display:flex;align-items:center;gap:8px}
.nav .t{font-size:24px;font-weight:500;letter-spacing:-.01em;flex:1;min-width:0}
.nav .bt{display:flex;gap:8px;flex-shrink:0}
.nav button{background:transparent;color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;height:36px;min-width:36px;padding:0 12px;font:inherit;font-size:15px;cursor:pointer}
.nav button:hover:not(:disabled){background:#2a2a2a}
.nav button:disabled{opacity:.35;cursor:default}
.take{font-size:15px;line-height:1.6;color:${C.soft};margin-top:8px}
.take b{color:${C.fg};font-weight:500}
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
.leg b{color:${C.fg};font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}
.ch{position:relative;min-height:220px}
.ch svg{display:block}
.tip{position:absolute;pointer-events:none;background:${C.pop};border:1px solid ${C.ctl};border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.45);padding:6px 10px;font-size:13px;line-height:1.45;white-space:nowrap;z-index:2;color:${C.fg}}
.tip .d{color:${C.muted};margin-bottom:2px}
.tip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums;color:${C.fg}}
th{color:${C.muted};font-weight:500;font-size:13px;text-align:right;padding:6px 8px;border-bottom:1px solid ${C.border}}
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
.tb:hover{color:${C.fg};background:#2a2a2a}
.tb svg{width:18px;height:18px;fill:currentColor}
.fs{position:fixed;inset:0;z-index:2147483000;background:${C.page};color:${C.fg};font-family:${FONT};display:flex;flex-direction:column;box-sizing:border-box;
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
.seg button:hover{background:#2a2a2a}
.seg button[aria-pressed="true"]{border-color:${C.sel};background:rgba(57,135,229,.18)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}
.row .l{font-size:15px}
.sw{position:relative;width:46px;height:26px;border-radius:13px;border:1px solid ${C.ctl};background:#333;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
.sw::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#bbb;transition:transform .15s}
.sw[aria-checked="true"]{background:${C.sel};border-color:${C.sel}}
.sw[aria-checked="true"]::after{transform:translateX(20px);background:#fff}
.sw:disabled{opacity:.4;cursor:default}
.btn{background:transparent;color:${C.fg};border:1px solid ${C.ctl};border-radius:6px;min-height:36px;padding:0 14px;font:inherit;font-size:15px;cursor:pointer;white-space:nowrap;flex-shrink:0}
.btn:hover:not(:disabled){background:#2a2a2a}
.btn:disabled{opacity:.4;cursor:default}
ul.sch{margin:8px 0 0;padding-left:18px;color:${C.muted};font-size:14px;line-height:1.6}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:10px 0 0;font-size:15px}
dl.kv dt{color:${C.muted}}
dl.kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.pct{font-size:28px;font-weight:500;font-variant-numeric:tabular-nums}
.bar{height:14px;border-radius:7px;background:#333;overflow:hidden;margin:12px 0 10px}
.bar i{display:block;height:100%;background:${FLOW.Pc};border-radius:7px 0 0 7px}
.bl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;font-size:15px;color:${C.muted}}
.bl b{color:${C.fg};font-weight:500;font-variant-numeric:tabular-nums}
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
@media (max-width:480px){.pr{grid-template-columns:minmax(0,1.8fr) minmax(0,1fr) minmax(0,1fr) 32px;gap:6px}.pr input{padding:0 6px}}
.ok{color:#4cc04c}.warn{color:#e09a1a}
button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}
@media (max-width:700px){.w{padding:8px}.hm{display:inline}.hn{display:none}.kpi .v{font-size:24px}.nav .t{font-size:20px}table{font-size:14px}th{font-size:12px}th,td{padding:7px 3px}}
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
    const view = VIEWS.includes(config.view) || config.view === 'setari' || config.view === 'amortizare' ? config.view : 'zi';
    this._cfg = { ...config, view, paths: { zi: 'zi', saptamana: 'saptamana', luna: 'luna', an: 'an', amortizare: 'amortizare', setari: 'setari', ...(config.paths || {}) } };
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
    this._timer = setInterval(() => this._load(true), 5 * 60 * 1000);
    this._load();
  }
  disconnectedCallback() {
    clearInterval(this._timer); this._closeFs();
    window.removeEventListener(FZ_EVENT, this._onFz);
    window.removeEventListener('storage', this._onFz);
    window.removeEventListener(FIN_EVENT, this._onFin);
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (first && this._d) this._load();
    else if (this._settings()) this._syncAuto();
  }
  get hass() { return this._hass; }
  _settings() { return this._cfg && this._cfg.view === 'setari'; }
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
    if (v === 'luna') return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
    return { from: new Date(d.getFullYear(), 0, 1), to: new Date(d.getFullYear(), 11, 31) };
  }
  _shift(n) {
    const d = this._d, v = this._cfg.view;
    this._d = v === 'zi' ? addDays(d, n) : v === 'saptamana' ? addDays(d, 7 * n)
      : v === 'luna' ? new Date(d.getFullYear(), d.getMonth() + n, 1) : new Date(d.getFullYear() + n, 0, 1);
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
  _title() {
    const { from, to } = this._range(), v = this._cfg.view;
    if (v === 'amortizare') return 'Amortizare';
    if (v === 'zi') return cap(`${ZILE[from.getDay()]}, ${from.getDate()} ${LUNI_L[from.getMonth()]} ${from.getFullYear()}`);
    if (v === 'saptamana') {
      const y = from.getFullYear() === to.getFullYear() ? '' : ' ' + from.getFullYear();
      return `${from.getDate()} ${LUNI[from.getMonth()]}${y} – ${to.getDate()} ${LUNI[to.getMonth()]} ${to.getFullYear()}`;
    }
    if (v === 'luna') return cap(`${LUNI_L[from.getMonth()]} ${from.getFullYear()}`);
    return String(from.getFullYear());
  }

  // ── date ────────────────────────────────────────────────────────────
  async _ws(msg, live) {
    const key = JSON.stringify(msg), hit = this._cache.get(key);
    if (hit && (!live || Date.now() - hit.at < 5 * 60 * 1000)) return hit.data;
    const data = await this._hass.callWS(this._cfg.entry_id ? { ...msg, entry_id: this._cfg.entry_id } : msg);
    this._cache.set(key, { at: Date.now(), data });
    return data;
  }
  async _load(refresh = false) {
    const h = this._hass; if (!h || !this._d || !this._cfg) return;
    if (this._settings()) {
      if (refresh) return;
      try { this._info = await this._ws({ type: 'victron_vrm/info' }, true); this._err = null; } catch (e) { this._err = e && e.message ? e.message : String(e); }
      return this._renderSettings();
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
      if (seq !== this._seq) return;
      this._info = info; this._rows = rows; this._years = years; this._err = null;
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
      <button class="next" aria-label="Înainte"${to >= t ? ' disabled' : ''}>›</button></div></div>${this._err ? '' : '<div class="take"></div>'}</div>`;
    if (this._err) {
      w.innerHTML = nav + `<div class="box msg">Nu am putut citi istoricul VRM: ${esc(this._err)}</div>`;
      return this._wire(w);
    }
    const rows = this._rows, tot = sum(rows), info = this._info;
    const n = rows.filter((r) => r.any).length;
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
    const per = { zi: 'în această zi', saptamana: 'în această săptămână', luna: 'în această lună', an: `în ${from.getFullYear()}` }[v];
    const hasEv = tot.ev > 0;
    // pierderile apar doar pe lună / an: pe zi sau săptămână ar include energia rămasă în baterie
    const showLoss = v === 'luna' || v === 'an';
    const hours = 24 * (v === 'an' ? rows.reduce((a, r) => a + (r.days || 0), 0) : n);
    const lossW = hours > 0 ? tot.loss / hours * 1000 : NaN;
    const take = `${cap(per)}, casa a consumat <b>${kwh(tot.house)} kWh</b>: <b>${share(tot.v.hPc, tot.house)}</b> direct din solar, <b>${share(tot.v.hBc, tot.house)}</b> din baterie și <b>${share(tot.v.hGc, tot.house)}</b> din rețea. `
      + (hasEv ? `Mașina a primit <b>${kwh(tot.ev)} kWh</b>: <b>${share(tot.v.Pe, tot.ev)}</b> din solar, <b>${share(tot.v.Be, tot.ev)}</b> din baterie și <b>${share(tot.v.Ge, tot.ev)}</b> din rețea. ` : '')
      + `Panourile au produs <b>${kwh(tot.prod)} kWh</b>, din care <b>${share(tot.v.Pc, tot.prod)}</b> au fost consumate direct, <b>${share(tot.v.Pb, tot.prod)}</b> în baterie și <b>${share(tot.v.Pg, tot.prod)}</b> în rețea.`
      + (showLoss && tot.loss > 0 ? ` Invertoarele, conversiile și bateria au pierdut <b>${kwh(tot.loss)} kWh</b>, în medie <b>${isFinite(lossW) ? F0(lossW) : '—'} W</b> continuu.` : '');

    const first = { zi: 'Ora', saptamana: 'Ziua', luna: 'Ziua', an: 'Luna' }[v];
    const cols = (r) => `<td>${kwh(r.prod)}</td><td>${kwh(r.house)}</td>${hasEv ? `<td>${kwh(r.ev)}</td>` : ''}<td>${kwh(r.imp)}</td><td>${kwh(r.inj)}</td><td class="hn">${kwh(r.chg)}</td><td class="hn">${kwh(r.dis)}</td><td>${pct(r.indep)}</td><td class="hn">${pct(r.autoc)}</td>`;
    const head = (f) => `<thead><tr><th>${f}</th>${HEAD(hasEv)}</tr></thead>`;
    const drill = v === 'an' ? 'luna' : v === 'zi' ? null : 'zi';
    const body = rows.filter((r) => r.any || (v !== 'an' && !r.future)).map((r) => {
      const lbl = v === 'zi' ? `${r.label}:00` : v === 'an' ? `<span class="hn">${cap(LUNI_L[+r.k - 1])}</span><span class="hm">${cap(LUNI[+r.k - 1])}</span>` : `<span class="hn">${esc(r.tip)}</span><span class="hm">${esc(r.label)}</span>`;
      const go = drill && r.any ? ` class="go" data-i="${rows.indexOf(r)}"` : r.any ? '' : ' class="nil"';
      return `<tr${go}><td>${lbl}</td>${cols(r)}</tr>`;
    }).join('');
    this._tot = tot; this._wide = this._wide || loadWide();
    const box = (c) => this._box(c);

    const nk = 8 + (hasEv ? 1 : 0) + (showLoss ? 1 : 0);
    w.innerHTML = nav + `
<div class="kpis" style="--k:${nk > 8 ? Math.ceil(nk / 2) : nk}">${kpi('Producție', kwh(tot.prod), 'kWh', avg(tot.prod))}${kpi('Consum casă', kwh(tot.house), 'kWh', hasEv ? 'fără mașină' + (v === 'zi' ? '' : ' · ' + avg(tot.house)) : avg(tot.house))}${hasEv ? kpi('Stația de încărcare', kwh(tot.ev), 'kWh', `${share(tot.v.Pe + tot.v.Be, tot.ev)} din solar + baterie`) : ''}${kpi('Import rețea', kwh(tot.imp), 'kWh', `${kwh(tot.v.Gb)} kWh în baterie`)}${kpi('Injecție', kwh(tot.inj), 'kWh', `${kwh(tot.v.Bg)} kWh din baterie`)}
${kpi('Încărcare baterie', kwh(tot.chg), 'kWh', `${kwh(tot.v.Gb)} kWh din rețea`)}${kpi('Descărcare baterie', kwh(tot.dis), 'kWh', avg(tot.dis))}${showLoss ? kpi('Pierderi sistem', kwh(Math.max(0, tot.loss)), 'kWh', `≈ ${isFinite(lossW) ? F0(Math.max(0, lossW)) : '—'} W în medie · ${share(Math.max(0, tot.loss), tot.prod + tot.imp)} din energia intrată`) : ''}${kpi('Independență', pct(tot.indep), '', 'consum acoperit de solar + baterie')}${kpi('Autoconsum', pct(tot.autoc), '', 'producție folosită în casă sau baterie')}</div>
<div class="charts">${CHARTS.filter((c) => !c.ev || hasEv).map(box).join('')}</div>
<div class="box"><div class="ttl">${{ zi: 'Pe ore', saptamana: 'Pe zile', luna: 'Pe zile', an: 'Pe luni' }[v]}</div><div class="note">kWh${drill ? ' · apasă pe un rând pentru detalii' : ''}</div>
 <div class="tw"><table>${head(first)}<tbody>${body}</tbody><tfoot><tr><td>Total</td>${cols(tot)}</tr></tfoot></table></div></div>
${this._yearsTable()}${this._foot()}`;
    w.querySelector('.take').innerHTML = take;
    w.querySelectorAll('tbody tr.go').forEach((tr) => tr.addEventListener('click', () => this._go(drill, rows[+tr.dataset.i].d || parse(rows[+tr.dataset.i].k))));
    this._wire(w);
    w.querySelectorAll('.wb').forEach((b) => b.addEventListener('click', () => this._toggleWide(b)));
    w.querySelectorAll('.fb').forEach((b) => b.addEventListener('click', () => this._openFs(CHARTS.find((c) => c.id === b.dataset.c))));
    this._cws = {}; this._charts();
  }
  _yearsTable() {
    if (this._cfg.view !== 'an' || !this._years || !this._years.length) return '';
    const y = String(this._d.getFullYear()), hasEv = this._years.some((r) => r.ev > 0);
    const rows = this._years.map((r) => `<tr class="go${r.k === y ? ' sel' : ''}" data-y="${r.k}"><td>${r.k}${r.k === String(today().getFullYear()) ? ' <span class="hn" style="color:' + C.muted + '">(în curs)</span>' : ''}</td><td>${kwh(r.prod)}</td><td>${kwh(r.house)}</td>${hasEv ? `<td>${kwh(r.ev)}</td>` : ''}<td>${kwh(r.imp)}</td><td>${kwh(r.inj)}</td><td class="hn">${kwh(r.chg)}</td><td class="hn">${kwh(r.dis)}</td><td>${pct(r.indep)}</td><td class="hn">${pct(r.autoc)}</td></tr>`).join('');
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
    const tot = this._tot;
    return `<div class="leg">${[...c.up, ...(c.down || [])].map((k) => `<span><i style="background:${FLOW[k]}"></i>${c.names[k]}<b>${(c.num || kwh)(tot.v[k])}</b></span>`).join('')}${c.line ? `<span><i class="ln" style="background:${C.fg}"></i>Producție<b>${kwh(tot.prod)}</b></span>` : ''}</div>`;
  }
  _box(c) {
    const wide = this._wide.has(c.id), lbl = wide ? 'Lățime normală' : 'Lățime dublă';
    return `<div class="box${wide ? ' wide' : ''}"><div class="hd"><div><div class="ttl">${c.ttl}</div><div class="note">${c.note} · ${c.unit || 'kWh'}</div></div>
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
    const v = this._cfg.view, rows = this._rows;
    const label = (r) => r.label;
    // barele cresc odată cu graficul (lățime dublă / ecran complet), până la 2,5×
    const maxBar = Math.round({ zi: 18, saptamana: 40, luna: 16, an: 36, amortizare: 36 }[v] * Math.min(2.5, Math.max(1, W / 640)));
    const drill = v === 'an' || v === 'amortizare' ? 'luna' : v === 'zi' ? null : 'zi';
    const svg = barChart(W, H, rows, { up: c.up, down: c.down, line: c.line, label, maxBar, labelW: v === 'zi' ? 30 : v === 'amortizare' ? 44 : 34, click: !!drill, fz: this._fz || 1 });
    el.innerHTML = svg + '<div class="tip" hidden></div>';
    const tip = el.querySelector('.tip'), hl = el.querySelector('.hl');
    el.querySelectorAll('.hit').forEach((hit) => {
      const r = rows[+hit.dataset.i];
      hit.addEventListener('mousemove', (ev) => {
        hl.setAttribute('x', hit.getAttribute('x')); hl.setAttribute('width', hit.getAttribute('width')); hl.setAttribute('opacity', '0.06');
        const lines = [...c.up, ...(c.down || [])].map((k) => `<div><i style="background:${FLOW[k]}"></i>${c.names[k]}: ${(c.num || F1)(r.v[k])} ${c.unit || 'kWh'}</div>`).join('')
          + (c.line ? `<div><i style="background:${C.fg}"></i>Producție: ${F1(r.prod)} kWh</div>` : '');
        tip.innerHTML = `<div class="d">${esc(r.tip)}</div>${lines}`;
        tip.hidden = false;
        const b = el.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
        tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, x + 12)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 8) + 'px';
      });
      hit.addEventListener('mouseleave', () => { tip.hidden = true; hl.setAttribute('opacity', '0'); });
      if (drill && r.any) hit.addEventListener('click', () => this._go(drill, r.d || parse(r.k)));
    });
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
    const th2 = `<th class="hn">Fără sistem</th><th class="hn">Cu sistem</th>${th('Economii', 'Econ.')}${th('Injecție', 'Inj.')}<th>Câștig</th>`;
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
<div class="box"><div class="ttl">Pe luni</div><div class="note">lei · apasă pe o lună pentru detalii</div>
 <div class="tw"><table><thead><tr><th>Luna</th>${th2}<th class="hn">Recuperat</th></tr></thead><tbody>${mrows}</tbody></table></div></div>
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
    w.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
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
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${CSS}</style><div class="fs"><div class="hd"><div><div class="ttl">${c.ttl} · ${esc(this._title())}</div><div class="note">${c.note} · ${c.unit || 'kWh'}</div></div>
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
