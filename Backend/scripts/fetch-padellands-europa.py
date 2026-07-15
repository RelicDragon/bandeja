#!/usr/bin/env python3
"""Fetch Padel Lands clubs for a europa country → scripts/data/{key}-padellands-clubs.json

Usage:
  python3 scripts/fetch-padellands-europa.py slovenia
  python3 scripts/fetch-padellands-europa.py slovakia
"""
from __future__ import annotations

import json
import re
import sys
import time
import html as H
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
UA = "BandejaPadellandsImport/1.0"

COUNTRIES = {
    "slovenia": {
        "europa_id": 6380,
        "region_slug": "eslovenia",
        "region_name": "Slovenia",
        "country_aliases": ("Slovenia", "Eslovenia", "Slowenien", "Slovenija"),
        "key": "slovenia",
    },
    "slovakia": {
        "europa_id": 6379,
        "region_slug": "eslovaquia",
        "region_name": "Slovakia",
        "country_aliases": ("Slovakia", "Eslovaquia", "Slowakei", "Slovensko"),
        "key": "slovakia",
    },
    "bulgaria": {
        "europa_id": 6375,
        "region_slug": "bulgaria",
        "region_name": "Bulgaria",
        "country_aliases": ("Bulgaria", "Bulgarie", "Bulgarije", "България"),
        "key": "bulgaria",
    },
    "moldova": {
        "europa_id": 6396,
        "region_slug": "moldavia",
        "region_name": "Moldova",
        "country_aliases": ("Moldova", "Moldavia", "Moldavie", "Republica Moldova"),
        "key": "moldova",
    },
}


def log(msg: str) -> None:
    print(msg, flush=True)


def http_json(url: str, retries: int = 6):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                headers = {k.lower(): v for k, v in r.headers.items()}
                return json.loads(r.read().decode("utf-8", "ignore")), headers
        except Exception as e:
            last = e
            wait = 8 + attempt * 6
            if "503" in str(e) or "429" in str(e):
                wait = 15 + attempt * 8
            log(f"[json] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def http_text(url: str, retries: int = 5) -> str:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            wait = 4 + attempt * 5
            if "503" in str(e) or "429" in str(e):
                wait = 12 + attempt * 6
            log(f"[http] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def slug_to_city(slug: str) -> str:
    special = {
        "ljubljana": "Ljubljana",
        "bratislava": "Bratislava",
        "maribor": "Maribor",
        "celje": "Celje",
        "koper": "Koper",
        "kosice": "Košice",
        "trencin": "Trenčín",
        "zilina": "Žilina",
        "nitra": "Nitra",
        "banska-bystrica": "Banská Bystrica",
    }
    if slug in special:
        return special[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def fetch_index(europa_id: int):
    posts = []
    page = 1
    while True:
        url = (
            "https://padellands.com/wp-json/wp/v2/pistas-de-padel"
            f"?europa={europa_id}&per_page=100&page={page}"
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
        time.sleep(0.15)
    return posts


def parse_yoast(p: dict, country_aliases: tuple[str, ...]) -> dict:
    title = H.unescape((p.get("title") or {}).get("rendered") or "").strip()
    y = p.get("yoast_head_json") or {}
    desc = y.get("description") or ""
    og = y.get("og_image") or []
    img = og[0].get("url") if og else None
    courts = None
    m = re.search(r"(\d+)\s+pistas?\s+de\s+padel", desc, re.I)
    if m:
        courts = int(m.group(1))
    city_from_desc = None
    alias_re = "|".join(re.escape(a) for a in country_aliases)
    m3 = re.search(rf"(?:en|in)\s+([^,]+),\s*(?:{alias_re})", desc, re.I)
    if m3:
        city_from_desc = m3.group(1).strip()
    else:
        m2 = re.search(r"(?:en|in)\s+([^.,]+?)(?:,|\.|$)", desc, re.I)
        if m2:
            city_from_desc = m2.group(1).strip()
    return {
        "id": int(p["id"]),
        "slug": p.get("slug"),
        "name": title,
        "link": p.get("link"),
        "avatarUrl": img,
        "courtsNumber": courts,
        "cityFromDesc": city_from_desc,
        "description": desc,
        "sourceUrl": p.get("link"),
    }


def extract_slugs(html: str, region_slug: str) -> set[str]:
    skip = {"europa", "espana", "feed", "otros-paises", "page", region_slug}
    slugs = set()
    for m in re.finditer(r'href="https://padellands\.com/pistas-de-padel/([a-z0-9\-]+)/"', html):
        s = m.group(1)
        if s not in skip:
            slugs.add(s)
    return slugs


def locality_map(by_slug: dict, region_slug: str) -> dict[int, str]:
    region_url = f"https://padellands.com/pistas-de-padel/europa/{region_slug}/"
    html = http_text(region_url)
    locs = sorted(set(re.findall(r"_localidad_pistas-([a-z0-9\-]+)/", html)))
    log(f"[locality] {len(locs)} localities")
    city_by_id: dict[int, str] = {}

    def one(city_slug: str):
        url = f"https://padellands.com/pistas-de-padel/europa/{region_slug}/_localidad_pistas-{city_slug}/"
        h = http_text(url)
        slugs = extract_slugs(h, region_slug)
        pages = [int(x) for x in re.findall(rf"_localidad_pistas-{re.escape(city_slug)}/page/(\d+)/", h)]
        for page in range(2, (max(pages) if pages else 1) + 1):
            slugs |= extract_slugs(http_text(f"{url}page/{page}/"), region_slug)
            time.sleep(0.15)
        return city_slug, slugs

    done = 0
    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = [pool.submit(one, s) for s in locs]
        for fut in as_completed(futs):
            try:
                city_slug, slugs = fut.result()
            except Exception as e:
                log(f"[locality] fail {e}")
                done += 1
                continue
            city = slug_to_city(city_slug)
            for slug in slugs:
                meta = by_slug.get(slug)
                if meta:
                    city_by_id[int(meta["id"])] = city
            done += 1
            if done % 10 == 0 or done == len(locs):
                log(f"[locality] {done}/{len(locs)} mapped={len(city_by_id)}")
            time.sleep(0.05)
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
    city = after_label(lines, "Localidad", "Location", "Ort")
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


def run(cfg: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    key = cfg["key"]
    out_path = OUT_DIR / f"{key}-padellands-clubs.json"
    index_path = OUT_DIR / f"{key}-padellands-index.json"

    posts = fetch_index(cfg["europa_id"])
    index = [parse_yoast(p, cfg["country_aliases"]) for p in posts]
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2))
    by_slug = {c["slug"]: c for c in index if c.get("slug")}
    log(f"[index] {len(index)} clubs")

    city_by_id = locality_map(by_slug, cfg["region_slug"])

    out: dict[int, dict] = {}
    # Small countries: always detail-scrape for address/phone
    log(f"[detail] scraping {len(index)} clubs")
    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = [pool.submit(scrape_detail, c) for c in index]
        for fut in as_completed(futs):
            club = fut.result()
            cid = int(club["id"])
            city = city_by_id.get(cid) or club.get("cityRaw") or club.get("cityFromDesc")
            if not city or club.get("error"):
                log(f"[detail] skip id={cid} city={city} err={club.get('error')}")
                continue
            out[cid] = {
                **club,
                "cityRaw": city,
                "address": club.get("address") or city,
                "regionSlug": cfg["region_slug"],
                "regionName": cfg["region_name"],
            }
            time.sleep(0.15)

    rows = list(out.values())
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    log(
        f"[done] {len(rows)} withCity={sum(1 for c in rows if c.get('cityRaw'))} "
        f"withImg={sum(1 for c in rows if c.get('avatarUrl'))} → {out_path}"
    )


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COUNTRIES:
        keys = ", ".join(COUNTRIES)
        print(f"Usage: {sys.argv[0]} <{'|'.join(COUNTRIES)}>", file=sys.stderr)
        print(f"Known: {keys}", file=sys.stderr)
        sys.exit(2)
    run(COUNTRIES[sys.argv[1]])


if __name__ == "__main__":
    main()
