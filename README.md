# Victron VRM — Integrare Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)
[![GitHub Release](https://img.shields.io/github/v/release/sarbuandreidaniel/victron_vrm?style=flat-square&label=Versiune)](https://github.com/sarbuandreidaniel/victron_vrm/releases)
[![License: MIT](https://img.shields.io/badge/Licen%C8%9B%C4%83-MIT-green.svg?style=flat-square)](LICENSE)

Descarcă istoricul de energie al unei instalații Victron din **VRM** (pe ore), îl păstrează local în Home Assistant și îl afișează într-un card cu vederile **Zi / Săptămână / Lună / An**.

## Cum funcționează

- **O singură descărcare pe lună de istoric.** La prima pornire integrarea ia din VRM, lună cu lună, tot istoricul de la data de început (implicit ziua în care instalația a fost adăugată în VRM). O lună încheiată de peste 2 zile este marcată finală și nu mai este cerută niciodată.
- **Actualizare la 15 minute** pentru ieri și azi.
- **Stocare locală** în `.storage/victron_vrm.<entry_id>`, grupată pe ani → luni → zile → ore. Cardul citește doar din acest cache (prin websocket), deci schimbarea vederilor nu face cereri către VRM.
- **Fluxurile VRM** (`type=custom`, pe ore) sunt păstrate exact:

| Cod | Flux |
|---|---|
| `Pc` / `Pb` / `Pg` | solar → casă / baterie / rețea |
| `Bc` / `Bg` | baterie → casă / rețea |
| `Gc` / `Gb` | rețea → casă / baterie |
| `Pe` / `Be` / `Ge` | solar / baterie / rețea → stația de încărcare (mașina) |

Stația de încărcare stă pe ieșirea AC, deci `Pe`/`Be`/`Ge` sunt o parte din `Pc`/`Bc`/`Gc`: cardul arată consumul casei fără mașină și, separat, energia primită de mașină, după sursă. Din fluxuri cardul calculează producția, consumul, importul, injecția, încărcarea, descărcarea, independența și autoconsumul.

**Pierderi sistem** (vederile Lună și An) = tot ce intră (producție + import) minus tot ce iese (consum + injecție). VRM pune aceste pierderi pe fluxurile bateriei, de aceea „încărcare baterie” e mult mai mare decât „descărcare baterie”; cea mai mare parte vine de la invertoare (consum în gol și conversii), nu de la baterie. Pe zi sau săptămână cifra nu se afișează, pentru că ar include și energia rămasă în baterie.

## Instalare

1. HACS → Integrări → ⋮ → *Custom repositories* → `https://github.com/sarbuandreidaniel/victron_vrm` (tip *Integration*), apoi instalează **Victron VRM** și repornește HA.
2. În VRM: **Preferences → Integrations → Access tokens → Add**, copiază tokenul.
3. **Setări → Dispozitive și servicii → Adaugă integrare → Victron VRM**, lipește tokenul și alege instalația.

Integrarea își adaugă singură cardul ca resursă Lovelace, cu codul inclus direct (`data:`), și o actualizează la fiecare versiune nouă. Varianta cu fișier (`/victron_vrm/…js`) nu rula din nou după un pull-to-refresh în aplicația iOS.

## Card

```yaml
type: custom:victron-vrm-card
view: zi          # zi | saptamana | luna | an | masina | baterie | amortizare | setari
```

Fiecare grafic are în colț două butoane: **⇔** îl întinde pe ambele coloane (alegerea se ține minte în browser; pe mobil totul e deja pe o coloană) și **⛶** îl deschide pe tot ecranul (închidere cu ✕ sau Esc).

Câte un card pe view, cu căile `zi`, `saptamana`, `luna`, `an`. Apăsarea pe o zi (în Săptămână/Lună) sau pe o lună (în An) deschide vederea mai detaliată; data aleasă se păstrează în URL (`?d=2026-03-14`). Dacă view-urile au alte căi, setează-le în card:

```yaml
paths: { zi: azi, saptamana: sapt, luna: luna, an: an }
```

### Mașina (stația de încărcare)

```yaml
type: custom:victron-vrm-card
view: masina
charger: evcs_hq2620yv6qn        # începutul entităților stației Victron EVCS (integrarea Victron GX)
car: electric_vehicle_id_40      # opțional: mașina raportată de stație (nivel baterie, țintă)
```

- **Stația acum**: starea, puterea și curentul, nivelul bateriei mașinii față de țintă, ultima sesiune. Din card se poate porni sau opri încărcarea, schimba modul (Manual / Automat / Programat), curentul de încărcare (6–32 A) și pornirea automată la conectare. Entitățile se iau din prefix (`sensor.<charger>_status`, `switch.<charger>_ev_charging`, `select.<charger>_mode`, `number.<charger>_charge_current_setpoint` …); oricare se poate schimba cu `entities: { status: sensor.… }`.
- **Istoricul, lună cu lună** (‹ ›): energia primită de mașină după sursă (solar / baterie / rețea), pe zile și pe orele zilei, sesiunile de încărcare (reconstituite din datele orare VRM), toate lunile cu încărcări și o statistică pe ani (energie după sursă, sesiuni, media pe sesiune, cost și economie). Costul folosește prețul energiei din rețea din Setări pentru fiecare lună.

### Baterie

```yaml
type: custom:victron-vrm-card
view: baterie
capacity: 20.24                  # opțional, kWh: pentru ciclurile complete și energia stocată
battery:                         # opțional: entitățile care nu sunt pe dispozitivul GX
  power: sensor.lynx_shunt_power
  voltage: sensor.lynx_shunt_dc_bus_voltage
  current: sensor.lynx_shunt_dc_bus_current
  temp: sensor.multiplus_ii_48_8000_110_100_id_276_dc_temperature
  left: sensor.baterie_timp_ramas            # text, de ex. „5h 47min”
  full: sensor.baterie_timp_pana_la_100
```

- **Bateria acum**: starea de încărcare față de rezerva activă, puterea (încărcare / descărcare), tensiunea, curentul, temperatura și cât mai ține. Din card se schimbă modul ESS (Cu BatteryLife / Optimizat / Menține încărcată), SoC-ul minim (slider din 10 în 10 sau o valoare scrisă), încărcarea forțată din rețea și limitele ESS (curentul maxim de încărcare, puterea maximă de încărcare, puterea maximă de descărcare, adică limita invertorului din ESS, și injecția maximă; câmp gol = fără limită). Fiecare schimbare de mod, încărcarea forțată și limitele cer o confirmare. Entitățile implicite sunt cele ale dispozitivului GX din integrarea Victron GX (`sensor.gx_device_dc_battery_charge`, `select.gx_device_ess_mode`, `number.gx_device_ess_min_soc_limit`, `switch.ess_force_charge` …); oricare se poate schimba în `battery:`.
- **Istoricul, lună cu lună** (‹ ›): încărcarea (din solar / din rețea) și descărcarea (spre consum / în rețea) pe zile și pe orele zilei, starea de încărcare pe zile (minim, maxim, medie, din statisticile Home Assistant), un tabel pe zile, toate lunile și anii cu ciclurile complete, randamentul (descărcare ÷ încărcare) și pierderile.

### Amortizare

```yaml
type: custom:victron-vrm-card
view: amortizare
```

Cât din investiție s-a recuperat din istoricul VRM, lună cu lună. Câștigul unei luni e diferența dintre factura fără sistem (tot consumul din rețea) și factura cu sistem, cu importul și injecția compensate lunar:

- **economii** = energia consumată fără s-o cumperi (`Pc + Bc − Gb`, adică consum − import) × prețul energiei din rețea
- **injecție** = energia injectată (`Pg + Bg`) × prețul energiei injectate

Ritmul pentru estimare e media pe zi din ultimele 12 luni încheiate (un an întreg de anotimpuri). Valoarea investiției și prețurile se completează în Setări; se păstrează în integrare (opțiunile intrării), deci sunt aceleași pe toate dispozitivele, și doar un administrator le poate schimba. Prețurile au istoric: fiecare se aplică din luna aleasă până la următorul, iar primul de la început. Fiecare lună e calculată cu prețul ei, deci o scumpire nu schimbă retroactiv suma recuperată; ritmul pentru estimare folosește ultimele 12 luni la prețurile actuale.

### Setări

Un al cincilea view cu cardul în modul `setari`:

```yaml
type: custom:victron-vrm-card
view: setari
automation: automation.energie_vrm_rezumat_zilnic_lunar_si_anual   # opțional
```

- **Mărime text** — Mică / Normală / Mare / Foarte mare, pentru toate cardurile Energie VRM (inclusiv etichetele graficelor). Se ține minte în browser, deci fiecare dispozitiv o are pe a lui.
- **Notificări** — pornește sau oprește automatizarea dată în `automation` și o poate rula imediat („Trimite acum”).
- **Investiție și prețuri** — valoarea investiției (lei) și istoricul prețurilor (lei/kWh, din rețea și injecție), fiecare cu luna de la care se aplică, pentru pagina Amortizare. „Adaugă un preț nou” pornește de la luna curentă. Acceptă virgulă sau punct zecimal.
- **Sincronizare VRM** — instalația, ultima sincronizare, de când începe istoricul și dacă se mai descarcă.

## Servicii

`victron_vrm.resync` — descarcă din nou lunile dintre `start_date` și `end_date` (implicit azi).

`victron_vrm.summary` — întoarce totalurile unei zile, luni sau ale unui an (`period: day | month | year`), din cache, fără apel la VRM. Fără `date` întoarce ultima perioadă încheiată: ieri, luna trecută, anul trecut. Răspunsul are cifrele (`kwh`, `flows`, `independence`, `self_consumption`) și un text gata de trimis (`title`, `message`). Exemplu de notificare zilnică:

```yaml
triggers:
  - trigger: time
    at: "08:00:00"
actions:
  - action: victron_vrm.summary
    data:
      period: day
    response_variable: zi
  - action: notify.mobile_app_telefon
    data:
      title: "{{ zi.title }}"
      message: "{{ zi.message }}"
```

## Entități

`sensor.<instalatie>_ultima_sincronizare` — ora ultimei sincronizări cu VRM (diagnostic).
