#!/usr/bin/env python3
"""Fetch Latvia clubs from padellands.com → scripts/data/latvia-padellands-clubs.json"""
from __future__ import annotations

import json
import re
import time
import html as H
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
OUT_PATH = OUT_DIR / "latvia-padellands-clubs.json"
INDEX_PATH = OUT_DIR / "latvia-padellands-index.json"
UA = "BandejaLatviaImport/1.0"
EUROPA_ID = 6392
REGION_SLUG = "letonia"
REGION_NAME = "Latvia"
COUNTRY_ALIASES = r"Latvia|Letonia|Latvija|Lettland"

CITY_PREFIX = re.compile(
    r"^(?:la\s+ciudad\s+de|la\s+localidad\s+de|la\s+poblaci[oó]n\s+de|"
    r"su\s+sede\s+de|un\s+centro\s+de|este\s+centro\s+ubicado\s+en|"
    r"sus\s+instalaciones\s+de|el\s+municipio\s+de)\s+",
    re.I,
)

SLUG_CITY = {
    "riga": "Riga",
    "jurmala": "Jūrmala",
    "liepaja": "Liepāja",
    "daugavpils": "Daugavpils",
    "jelgava": "Jelgava",
    "ventspils": "Ventspils",
    "rezekne": "Rēzekne",
    "valmiera": "Valmiera",
    "jekabpils": "Jēkabpils",
    "ogre": "Ogre",
    "tukums": "Tukums",
    "sigulda": "Sigulda",
    "cesis": "Cēsis",
    "salaspils": "Salaspils",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def http_json(url: str, retries: int = 8):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                headers = {k.lower(): v for k, v in r.headers.items()}
                return json.loads(r.read().decode("utf-8", "ignore")), headers
        except Exception as e:
            last = e
            wait = 8 + attempt * 8
            if "503" in str(e) or "429" in str(e):
                wait = 20 + attempt * 15
            log(f"[json] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def http_text(url: str, retries: int = 8) -> str:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            wait = 8 + attempt * 8
            if "503" in str(e) or "429" in str(e):
                wait = 25 + attempt * 20
            log(f"[http] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def slug_to_city(slug: str) -> str:
    if slug in SLUG_CITY:
        return SLUG_CITY[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def clean_city(raw: str | None) -> str | None:
    if not raw:
        return None
    s = CITY_PREFIX.sub("", raw.strip())
    s = re.sub(r"\s+", " ", s).strip(" .")
    if not s or len(s) > 60:
        return None
    if s.lower() in {"la ciudad", "la localidad", "este centro", "un centro"}:
        return None
    aliases = {
        "Jurmala": "Jūrmala",
        "Liepaja": "Liepāja",
        "Rezekne": "Rēzekne",
        "Jekabpils": "Jēkabpils",
        "Cesis": "Cēsis",
    }
    return aliases.get(s, s)


def city_from_description(desc: str) -> str | None:
    if not desc:
        return None
    m = re.search(rf"(?:en|in)\s+([^,]+),\s*(?:{COUNTRY_ALIASES})", desc, re.I)
    if m:
        return clean_city(m.group(1))
    m = re.search(r"(\d+)\s+padel\s+courts?\s+in\s+([^.,]+)", desc, re.I)
    if m:
        return clean_city(m.group(2))
    return None


def fetch_index():
    posts = []
    page = 1
    while True:
        url = (
            "https://padellands.com/wp-json/wp/v2/pistas-de-padel"
            f"?europa={EUROPA_ID}&per_page=100&page={page}"
            "&_fields=id,slug,title,link,featured_media,yoast_head_json"
        )
        data, headers = http_json(url)
        if not data:
            break
        posts.extend(data)
        total = headers.get("x-wp-total")
        log(f"[index] page {page} +{len(data)} total_hdr={total} have={len(posts)}")
        if page >= int(headers.get("x-wp-totalpages") or 1):
            break
        page += 1
        time.sleep(0.4)
    return posts


def parse_yoast(p: dict) -> dict:
    title = H.unescape((p.get("title") or {}).get("rendered") or "").strip()
    y = p.get("yoast_head_json") or {}
    desc = y.get("description") or ""
    og = y.get("og_image") or []
    img = og[0].get("url") if og else None
    courts = None
    m = re.search(r"(\d+)\s+pistas?\s+de\s+padel", desc, re.I)
    if m:
        courts = int(m.group(1))
    else:
        m = re.search(r"(\d+)\s+padel\s+courts?", desc, re.I)
        if m:
            courts = int(m.group(1))
    return {
        "id": int(p["id"]),
        "slug": p.get("slug"),
        "name": title,
        "link": p.get("link"),
        "avatarUrl": img,
        "courtsNumber": courts,
        "cityFromDesc": city_from_description(desc),
        "description": desc,
        "sourceUrl": p.get("link"),
    }


def extract_slugs(html: str) -> set[str]:
    skip = {"europa", "espana", "feed", "otros-paises", "page", REGION_SLUG}
    slugs = set()
    for m in re.finditer(r'href="https://padellands\.com/pistas-de-padel/([a-z0-9\-]+)/"', html):
        s = m.group(1)
        if s not in skip:
            slugs.add(s)
    return slugs


def locality_map(by_slug: dict) -> dict[int, str]:
    region_url = f"https://padellands.com/pistas-de-padel/europa/{REGION_SLUG}/"
    html = http_text(region_url)
    locs = sorted(set(re.findall(r"_localidad_pistas-([a-z0-9\-]+)/", html)))
    log(f"[locality] {len(locs)} localities")
    city_by_id: dict[int, str] = {}
    for i, city_slug in enumerate(locs, 1):
        url = f"https://padellands.com/pistas-de-padel/europa/{REGION_SLUG}/_localidad_pistas-{city_slug}/"
        try:
            h = http_text(url)
        except Exception as e:
            log(f"[locality] fail {city_slug}: {e}")
            time.sleep(5)
            continue
        slugs = extract_slugs(h)
        pages = [int(x) for x in re.findall(rf"_localidad_pistas-{re.escape(city_slug)}/page/(\d+)/", h)]
        for page in range(2, (max(pages) if pages else 1) + 1):
            try:
                slugs |= extract_slugs(http_text(f"{url}page/{page}/"))
            except Exception as e:
                log(f"[locality] page fail {city_slug}/{page}: {e}")
            time.sleep(1.5)
        city = slug_to_city(city_slug)
        for slug in slugs:
            meta = by_slug.get(slug)
            if meta:
                city_by_id[int(meta["id"])] = city
        log(f"[locality] {i}/{len(locs)} {city_slug}→{city} +{len(slugs)} mapped={len(city_by_id)}")
        time.sleep(2.5)
    return city_by_id


def after_label(lines, *labels):
    lowers = {l.lower() for l in labels}
    for i, line in enumerate(lines):
        if line.lower() in lowers and i + 1 < len(lines):
            nxt = lines[i + 1].strip()
            if nxt and nxt.lower() not in lowers:
                return nxt
    return None


def scrape_detail(meta: dict) -> dict:
    url = meta.get("link") or f"https://padellands.com/pistas-de-padel/{meta['slug']}/"
    try:
        html = http_text(url)
    except Exception as e:
        return {**meta, "error": str(e), "sourceUrl": url}
    text = H.unescape(re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I))
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    lines = [re.sub(r"\s+", " ", l).strip() for l in re.sub("<.*?>", "\n", text).splitlines()]
    lines = [l for l in lines if l]
    address = after_label(lines, "Dirección", "Address", "Adresse")
    phone = after_label(lines, "Teléfono", "Phone", "Telefon")
    city = clean_city(after_label(lines, "Localidad", "Location", "Ort"))
    courts_raw = after_label(lines, "Nº de pistas", "N° de pistas", "Number of courts", "Pistas")
    courts_n = None
    if courts_raw:
        m = re.search(r"\d+", courts_raw)
        courts_n = int(m.group()) if m else None
    og = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
    avatar = og.group(1) if og else meta.get("avatarUrl")
    return {
        **meta,
        "address": address,
        "phone": phone,
        "cityRaw": city or meta.get("cityFromDesc"),
        "courtsNumber": courts_n or meta.get("courtsNumber"),
        "avatarUrl": avatar,
        "sourceUrl": url,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        posts = fetch_index()
        index = [parse_yoast(p) for p in posts]
        INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2))
    except Exception as e:
        log(f"[index] API fail ({e}); using cached index if present")
        if not INDEX_PATH.exists():
            raise
        index = json.loads(INDEX_PATH.read_text())
        for c in index:
            c["cityFromDesc"] = city_from_description(c.get("description") or "") or clean_city(c.get("cityFromDesc"))

    by_slug = {c["slug"]: c for c in index if c.get("slug")}
    log(f"[index] {len(index)} clubs withCityDesc={sum(1 for c in index if c.get('cityFromDesc'))}")

    city_by_id: dict[int, str] = {}
    try:
        city_by_id = locality_map(by_slug)
    except Exception as e:
        log(f"[locality] aborted: {e}")

    out: dict[int, dict] = {}
    missing = []
    for c in index:
        cid = int(c["id"])
        city = city_by_id.get(cid) or clean_city(c.get("cityFromDesc"))
        row = {
            **c,
            "cityRaw": city,
            "address": city,
            "phone": None,
            "website": None,
            "latitude": None,
            "longitude": None,
            "regionSlug": REGION_SLUG,
            "regionName": REGION_NAME,
        }
        if city:
            out[cid] = row
        else:
            missing.append(c)

    log(f"[map] withCity={len(out)} needDetail={len(missing)}")
    for i, m in enumerate(missing, 1):
        club = scrape_detail(m)
        log(f"[detail] {i}/{len(missing)} {club.get('slug')} city={club.get('cityRaw')} err={club.get('error')}")
        if club.get("cityRaw") and not club.get("error"):
            out[int(club["id"])] = {
                **club,
                "regionSlug": REGION_SLUG,
                "regionName": REGION_NAME,
            }
        time.sleep(2.5)

    rows = list(out.values())
    OUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    log(
        f"[done] {len(rows)} withCity={sum(1 for c in rows if c.get('cityRaw'))} "
        f"withImg={sum(1 for c in rows if c.get('avatarUrl'))} → {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
