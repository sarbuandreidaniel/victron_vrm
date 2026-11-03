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
view: zi          # zi | saptamana | luna | an
```

Fiecare grafic are în colț două butoane: **⇔** îl întinde pe ambele coloane (alegerea se ține minte în browser; pe mobil totul e deja pe o coloană) și **⛶** îl deschide pe tot ecranul (închidere cu ✕ sau Esc).

Câte un card pe view, cu căile `zi`, `saptamana`, `luna`, `an`. Apăsarea pe o zi (în Săptămână/Lună) sau pe o lună (în An) deschide vederea mai detaliată; data aleasă se păstrează în URL (`?d=2026-03-14`). Dacă view-urile au alte căi, setează-le în card:

```yaml
paths: { zi: azi, saptamana: sapt, luna: luna, an: an }
```

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
