# BookTime — Novi Sad clubs (companyId catalog)

Verified 2026-06-11. Companion: [PLAN_BOOKTIME_INTEGRATION.md](./PLAN_BOOKTIME_INTEGRATION.md), Padel City decomp: `../Decomp/PadelCity/FINDINGS.md`.

BookTime ships one white-label Capacitor app per club (`rs.booktime.*`). Each embeds a fixed `companyId` in `assets/public/main-*.js`.

---

## Novi Sad clubs in Bandeja (dev DB)

| Club (DB name) | BookTime app | companyId configured (dev) |
|----------------|--------------|------------------------------|
| Padel City | yes | yes |
| The Padel | yes | yes |
| Elite Padel | yes | yes |
| Royal Padel Club | yes | yes |
| KSC (ex.CRS) | yes | yes |
| Padel Balon | — | no app found |
| Stribor, Arena Pub, Bunker Karaoke, Dve Kule | — | not BookTime |

---

## companyId map (verified)

| Club | Play package | companyId | Verified name (public API) |
|------|--------------|-----------|----------------------------|
| Padel City Centar | `rs.booktime.padelcity` | `d4130d78-a7e8-499d-90f0-92773ccc2f9c` | Padel City Centar |
| The Padel | `rs.booktime.thepadel` | `465669e3-4f8b-4e8d-984d-2c9e16f66914` | The Padel |
| Elite Padel | `rs.booktime.elite.tennis` | `8defd7d4-7eb7-4e71-862b-3e98a02bce9d` | Elite Padel |
| Royal Padel Club | `rs.booktime.royal` | `8fb6026a-4e2f-4fa5-a81b-e87a8f7e37d3` | Royal Padel Club |
| KSC (Krajinović Sport Centar) | `rs.booktime.ksc` | `002f8a6a-6433-490f-9bae-726b98399672` | KSC |

Verify any ID:

```bash
curl https://api.booktime.rs/public/company/{companyId}
```

---

## Where to download APKs

### Google Play (canonical)

Developer: [BookTime](https://play.google.com/store/apps/dev?id=7718041824321820160)

| Club | URL |
|------|-----|
| Padel City Centar | https://play.google.com/store/apps/details?id=rs.booktime.padelcity |
| The Padel | https://play.google.com/store/apps/details?id=rs.booktime.thepadel |
| Elite Padel | https://play.google.com/store/apps/details?id=rs.booktime.elite.tennis |
| Royal Padel Club | https://play.google.com/store/apps/details?id=rs.booktime.royal |
| KSC | https://play.google.com/store/apps/details?id=rs.booktime.ksc |

### APKPure (XAPK mirror)

Direct URL pattern:

```
https://d.apkpure.com/b/XAPK/{package}?version=latest
```

| Package | APKPure mirror (2026-06) |
|---------|--------------------------|
| `rs.booktime.padelcity` | yes |
| `rs.booktime.thepadel` | yes |
| `rs.booktime.elite.tennis` | yes |
| `rs.booktime.royal` | **no** (Play only) |
| `rs.booktime.ksc` | **no** (Play only) |

`apkeep -d apk-pure` lists zero versions for royal/ksc.

### Play-only fallback (used for royal + ksc)

1. Install [Aurora Store](https://f-droid.org/packages/com.aurora.store/) (or `apkeep -a com.aurora.store -d f-droid .`).
2. Anonymous login (dispenser).
3. Open `market://details?id={package}` in Aurora → **Manual download** (enter version code) or **Install**.
4. Pull base APK:
   - From Aurora cache: `/data/data/com.aurora.store/cache/Downloads/{package}/{versionCode}/base.apk`
   - From installed app: `adb shell pm path {package}` → pull `base.apk`

Requires `adb root` or install permission for cache path on emulator.

Local copies (2026-06-11 session):

- `/tmp/booktime-apks/royal/base.apk`
- `/tmp/booktime-apks/ksc/base.apk`

Padel City reference XAPK: `../Decomp/PadelCity/rs.booktime.padelcity_1.1.0.xapk`

---

## Extract companyId from APK

Pattern in minified Angular bundle (`main-*.js`):

```
companyId:"{uuid}"
```

```bash
unzip -p base.apk 'assets/public/main-*.js' | grep -oE 'companyId:"[a-f0-9-]+"'
```

For XAPK: unzip outer archive, then unzip `rs.booktime.*.apk` (base split).

---

## Version codes (Play, 2026-06)

| Package | Version | versionCode |
|---------|---------|-------------|
| `rs.booktime.royal` | v1.0.0 | 1 |
| `rs.booktime.ksc` | v1.0.0 → v1.0.3 | 1 → **4** (latest) |

Use latest version code in Aurora **Manual download** dialog.

---

## Tools tried

| Tool | royal / ksc result |
|------|-------------------|
| APKPure direct / apkeep `-d apk-pure` | Not mirrored |
| APKCombo, APKMirror, Uptodown | No usable download |
| Aurora Store + emulator + adb pull | **Success** |
| `brew install apkeep` + Google Play auth | Not attempted (needs token) |

---

## Admin config (Bandeja)

Per club in platform admin:

- `integrationType`: `BOOKTIME`
- `integrationConfig`: `{ "companyId": "<uuid>" }`
- Then **Import courts** (`POST /admin/clubs/:clubId/booktime/import-courts`)

All five Novi Sad BookTime clubs configured in dev and prod (2026-06-11). Court `externalCourtId` mapping still via admin **Import courts** per club.
