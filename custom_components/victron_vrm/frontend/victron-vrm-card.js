/* victron-vrm-card — Zi / Săptămână / Lună / An din istoricul VRM salvat de integrarea victron_vrm */
(() => {
const VERSION = '0.3.2';
const C = { page: '#0b0b0b', panel: '#1f1f1f', border: '#292929', fg: '#ffffff', muted: '#858585',
  grid: '#2a2a2a', axis: '#3a3a3a', pop: '#262626', sel: '#3987e5' };
// fiecare flux are aceeași culoare în toate graficele
const FLOW = { Pc: '#199e70', Pb: '#c98500', Pg: '#9085e9', Bc: '#3987e5', Bg: '#d55181', Gc: '#d03b3b', Gb: '#3fae3f',
  Pe: '#199e70', Be: '#3987e5', Ge: '#d03b3b' };
// consumul casei fără mașină (hPc = solar direct în casă etc.) păstrează culoarea sursei
FLOW.hPc = FLOW.Pc; FLOW.hBc = FLOW.Bc; FLOW.hGc = FLOW.Gc;
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
const svgI = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
// graficele lățite se țin minte în browser (preferință per vizitator)
const WIDE_KEY = 'victron-vrm-wide';
const loadWide = () => { try { return new Set(JSON.parse(localStorage.getItem(WIDE_KEY) || '[]')); } catch (e) { return new Set(); } };
const saveWide = (set) => { try { localStorage.setItem(WIDE_KEY, JSON.stringify([...set])); } catch (e) { /* stocare indisponibilă */ } };
const nf = (d) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const F0 = nf(0).format, F1 = nf(1).format;
const kwh = (v) => (v >= 100 ? F0(v) : F1(v));
const pct = (v) => (isFinite(v) ? F0(v * 100) + '%' : '—');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
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

// bare stivuite în sus / în jos, cu linie opțională; întoarce SVG
function barChart(W, H, rows, o) {
  const up = o.up || [], down = o.down || [], line = o.line;
  const ml = 40, mr = 8, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
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
    g += `<text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" fill="${C.muted}" font-size="11">${tf(Math.abs(v))}</text>`;
  }
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(iw / (o.labelW || 46)))));
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
    if (i % every === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" fill="${C.muted}" font-size="11">${o.label(r)}</text>`;
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
  { id: 'cb', ttl: 'Baterie', note: 'În sus încărcare, în jos descărcare', up: ['Pb', 'Gb'], down: ['Bc', 'Bg'],
    names: { Pb: 'Încărcare din solar', Gb: 'Încărcare din rețea', Bc: 'Descărcare spre consum', Bg: 'Descărcare în rețea' } },
  { id: 'ce', ttl: 'Stația de încărcare', note: 'Energia primită de mașină, după sursă', up: ['Pe', 'Be', 'Ge'], ev: true,
    names: { Pe: 'Din solar', Be: 'Din baterie', Ge: 'Din rețea' } },
];

const CSS = `
:host{display:block}
.w{max-width:1404px;margin:0 auto;font-family:Roboto,Helvetica,system-ui,sans-serif;color:${C.fg};background:${C.page};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.box{background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:16px;position:relative}
.nav{display:flex;align-items:center;gap:8px}
.nav .t{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;flex:1;min-width:0}
.nav .bt{display:flex;gap:8px;flex-shrink:0}
.nav button{background:transparent;color:${C.fg};border:1px solid ${C.border};border-radius:6px;height:34px;min-width:34px;padding:0 10px;font:inherit;font-size:14px;cursor:pointer}
.nav button:hover:not(:disabled){background:#2a2a2a}
.nav button:disabled{opacity:.35;cursor:default}
.take{font-size:14px;line-height:1.55;color:${C.muted};margin-top:8px}
.take b{color:${C.fg};font-weight:500}
h2{font-size:17px;font-weight:500;margin:10px 0 0;color:${C.fg}}
h2 small{font-weight:400;color:${C.muted};font-size:13px;margin-left:8px}
.ttl{color:${C.fg};font-size:15px;font-weight:500;margin:0 0 4px}
.note{color:${C.muted};font-size:12px;margin:0 0 10px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:12px}
.kpi .l{color:${C.muted};font-size:12px}
.kpi .v{font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;margin-top:6px;font-variant-numeric:tabular-nums}
.kpi .u{font-family:Roboto,Helvetica,system-ui,sans-serif;color:${C.muted};font-size:12px;margin-left:4px}
.kpi .s{color:${C.muted};font-size:12px;margin-top:2px}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:${C.muted};margin-bottom:8px}
.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.leg i.ln{height:2px;vertical-align:3px}
.leg b{color:${C.fg};font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}
.ch{position:relative;min-height:220px}
.ch svg{display:block}
.tip{position:absolute;pointer-events:none;background:${C.pop};border:1px solid ${C.border};border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.45);padding:6px 10px;font-size:12px;white-space:nowrap;z-index:2;color:${C.fg}}
.tip .d{color:${C.muted};margin-bottom:2px}
.tip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums;color:${C.fg}}
th{color:${C.muted};font-weight:500;font-size:12px;text-align:right;padding:6px 8px;border-bottom:1px solid ${C.border}}
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
.tb{background:transparent;border:1px solid ${C.border};border-radius:6px;width:30px;height:30px;padding:0;color:${C.muted};cursor:pointer;display:grid;place-items:center}
.tb:hover{color:${C.fg};background:#2a2a2a}
.tb svg{width:18px;height:18px;fill:currentColor}
.fs{position:fixed;inset:0;z-index:2147483000;background:${C.page};color:${C.fg};font-family:Roboto,Helvetica,system-ui,sans-serif;display:flex;flex-direction:column;box-sizing:border-box;
  padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))}
.fs .ttl{font-size:17px}
.fs .ch{flex:1 1 auto;min-height:0}
.hm{display:none}
.msg{color:${C.muted};font-size:14px;padding:30px;text-align:center}
.foot{color:${C.muted};font-size:12px;text-align:right}
@media (max-width:700px){.w{padding:8px}.hm{display:inline}.hn{display:none}.kpi .v{font-size:24px}.nav .t{font-size:20px}table{font-size:13px}th,td{padding:6px 4px}}
`;

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
    const view = VIEWS.includes(config.view) ? config.view : 'zi';
    this._cfg = { paths: { zi: 'zi', saptamana: 'saptamana', luna: 'luna', an: 'an' }, ...config, view };
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
    this._timer = setInterval(() => this._load(true), 5 * 60 * 1000);
    this._load();
  }
  disconnectedCallback() { clearInterval(this._timer); this._closeFs(); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first && this._d) this._load(); }
  get hass() { return this._hass; }

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
    history.pushState(null, '', `${base}/${this._cfg.paths[view]}?d=${iso(d)}`);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }
  _title() {
    const { from, to } = this._range(), v = this._cfg.view;
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
          { label: LUNI[i], tip: cap(`${LUNI_L[i]} ${from.getFullYear()}`), d: new Date(from.getFullYear(), i, 1) }));
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
    const take = `${cap(per)}, casa a consumat <b>${kwh(tot.house)} kWh</b>: <b>${share(tot.v.hPc, tot.house)}</b> direct din solar, <b>${share(tot.v.hBc, tot.house)}</b> din baterie și <b>${share(tot.v.hGc, tot.house)}</b> din rețea. `
      + (hasEv ? `Mașina a primit <b>${kwh(tot.ev)} kWh</b>: <b>${share(tot.v.Pe, tot.ev)}</b> din solar, <b>${share(tot.v.Be, tot.ev)}</b> din baterie și <b>${share(tot.v.Ge, tot.ev)}</b> din rețea. ` : '')
      + `Panourile au produs <b>${kwh(tot.prod)} kWh</b>, din care <b>${share(tot.v.Pc, tot.prod)}</b> au fost consumate direct, <b>${share(tot.v.Pb, tot.prod)}</b> în baterie și <b>${share(tot.v.Pg, tot.prod)}</b> în rețea.`;

    const first = { zi: 'Ora', saptamana: 'Ziua', luna: 'Ziua', an: 'Luna' }[v];
    const cols = (r) => `<td>${kwh(r.prod)}</td><td>${kwh(r.house)}</td>${hasEv ? `<td>${kwh(r.ev)}</td>` : ''}<td>${kwh(r.imp)}</td><td>${kwh(r.inj)}</td><td class="hn">${kwh(r.chg)}</td><td class="hn">${kwh(r.dis)}</td><td>${pct(r.indep)}</td><td class="hn">${pct(r.autoc)}</td>`;
    const head = (f) => `<thead><tr><th>${f}</th><th>Producție</th><th>Casă</th>${hasEv ? '<th>Mașină</th>' : ''}<th>Import</th><th>Injecție</th><th class="hn">Încărcare</th><th class="hn">Descărcare</th><th><span class="hn">Independență</span><span class="hm">Indep.</span></th><th class="hn">Autoconsum</th></tr></thead>`;
    const drill = v === 'an' ? 'luna' : v === 'zi' ? null : 'zi';
    const body = rows.filter((r) => r.any || (v !== 'an' && !r.future)).map((r) => {
      const lbl = v === 'zi' ? `${r.label}:00` : v === 'an' ? cap(LUNI_L[+r.k - 1]) : `<span class="hn">${esc(r.tip)}</span><span class="hm">${esc(r.label)}</span>`;
      const go = drill && r.any ? ` class="go" data-i="${rows.indexOf(r)}"` : r.any ? '' : ' class="nil"';
      return `<tr${go}><td>${lbl}</td>${cols(r)}</tr>`;
    }).join('');
    this._tot = tot; this._wide = this._wide || loadWide();
    const box = (c) => this._box(c);

    w.innerHTML = nav + `
<div class="kpis">${kpi('Producție', kwh(tot.prod), 'kWh', avg(tot.prod))}${kpi('Consum casă', kwh(tot.house), 'kWh', hasEv ? 'fără mașină' + (v === 'zi' ? '' : ' · ' + avg(tot.house)) : avg(tot.house))}${hasEv ? kpi('Stația de încărcare', kwh(tot.ev), 'kWh', `${share(tot.v.Pe + tot.v.Be, tot.ev)} din solar + baterie`) : ''}${kpi('Import rețea', kwh(tot.imp), 'kWh', `${kwh(tot.v.Gb)} kWh în baterie`)}${kpi('Injecție', kwh(tot.inj), 'kWh', `${kwh(tot.v.Bg)} kWh din baterie`)}
${kpi('Încărcare baterie', kwh(tot.chg), 'kWh', `${kwh(tot.v.Gb)} kWh din rețea`)}${kpi('Descărcare baterie', kwh(tot.dis), 'kWh', avg(tot.dis))}${kpi('Independență', pct(tot.indep), '', 'consum acoperit de solar + baterie')}${kpi('Autoconsum', pct(tot.autoc), '', 'producție folosită în casă sau baterie')}</div>
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
    return `<h2>Pe ani<small>apasă pe un an pentru lunile lui</small></h2><div class="box"><div class="tw"><table><thead><tr><th>An</th><th>Producție</th><th>Casă</th>${hasEv ? '<th>Mașină</th>' : ''}<th>Import</th><th>Injecție</th><th class="hn">Încărcare</th><th class="hn">Descărcare</th><th><span class="hn">Independență</span><span class="hm">Indep.</span></th><th class="hn">Autoconsum</th></tr></thead><tbody class="yrs">${rows}</tbody></table></div></div>`;
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
    return `<div class="leg">${[...c.up, ...(c.down || [])].map((k) => `<span><i style="background:${FLOW[k]}"></i>${c.names[k]}<b>${kwh(tot.v[k])}</b></span>`).join('')}${c.line ? `<span><i class="ln" style="background:${C.fg}"></i>Producție<b>${kwh(tot.prod)}</b></span>` : ''}</div>`;
  }
  _box(c) {
    const wide = this._wide.has(c.id), lbl = wide ? 'Lățime normală' : 'Lățime dublă';
    return `<div class="box${wide ? ' wide' : ''}"><div class="hd"><div><div class="ttl">${c.ttl}</div><div class="note">${c.note} · kWh</div></div>
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
    for (const c of CHARTS) {
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
    const maxBar = Math.round({ zi: 18, saptamana: 40, luna: 16, an: 36 }[v] * Math.min(2.5, Math.max(1, W / 640)));
    const drill = v === 'an' ? 'luna' : v === 'zi' ? null : 'zi';
    const svg = barChart(W, H, rows, { up: c.up, down: c.down, line: c.line, label, maxBar, labelW: v === 'zi' ? 30 : 34, click: !!drill });
    el.innerHTML = svg + '<div class="tip" hidden></div>';
    const tip = el.querySelector('.tip'), hl = el.querySelector('.hl');
    el.querySelectorAll('.hit').forEach((hit) => {
      const r = rows[+hit.dataset.i];
      hit.addEventListener('mousemove', (ev) => {
        hl.setAttribute('x', hit.getAttribute('x')); hl.setAttribute('width', hit.getAttribute('width')); hl.setAttribute('opacity', '0.06');
        const lines = [...c.up, ...(c.down || [])].map((k) => `<div><i style="background:${FLOW[k]}"></i>${c.names[k]}: ${F1(r.v[k])} kWh</div>`).join('')
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

  // ── ecran complet: un strat peste toată pagina, în afara cardului ───
  // (pe iPhone nu există Fullscreen API pentru elemente, așa că stratul acoperă oricum ecranul)
  _openFs(c) {
    if (!c || !this._rows) return;
    this._closeFs();
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${CSS}</style><div class="fs"><div class="hd"><div><div class="ttl">${c.ttl} · ${esc(this._title())}</div><div class="note">${c.note} · kWh</div></div>
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
