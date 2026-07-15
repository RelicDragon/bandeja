#!/usr/bin/env python3
"""Fetch UK clubs from padellands.com → scripts/data/uk-padellands-clubs.json"""
from __future__ import annotations

import json
import re
import time
import html as H
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
OUT_PATH = OUT_DIR / "uk-padellands-clubs.json"
INDEX_PATH = OUT_DIR / "uk-padellands-index.json"
UA = "BandejaUKImport/1.0"
EUROPA_UK = 6403  # padellands europa term: Reino Unido
REGION_SLUG = "reino-unido"
REGION_NAME = "United Kingdom"
COUNTRY_RE = (
    r"(?:United Kingdom|Reino Unido|UK|Great Britain|Gran Breta(?:ñ|n)a|"
    r"England|Scotland|Wales|Northern Ireland)"
)


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


def http_text(url: str, retries: int = 6) -> str:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            wait = 8 + attempt * 6
            if "503" in str(e) or "429" in str(e):
                wait = 15 + attempt * 8
            log(f"[http] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def slug_to_city(slug: str) -> str:
    special = {
        "london": "London",
        "londres": "London",
        "manchester": "Manchester",
        "birmingham": "Birmingham",
        "leeds": "Leeds",
        "glasgow": "Glasgow",
        "edinburgh": "Edinburgh",
        "edimburgo": "Edinburgh",
        "liverpool": "Liverpool",
        "bristol": "Bristol",
        "cardiff": "Cardiff",
        "belfast": "Belfast",
        "newcastle": "Newcastle",
        "sheffield": "Sheffield",
        "nottingham": "Nottingham",
        "southampton": "Southampton",
        "brighton": "Brighton",
        "cambridge": "Cambridge",
        "oxford": "Oxford",
        "reading": "Reading",
        "milton-keynes": "Milton Keynes",
        "st-albans": "St Albans",
        "kingston-upon-thames": "Kingston upon Thames",
    }
    if slug in special:
        return special[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def fetch_index():
    posts = []
    page = 1
    while True:
        url = (
            "https://padellands.com/wp-json/wp/v2/pistas-de-padel"
            f"?europa={EUROPA_UK}&per_page=100&page={page}"
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
        time.sleep(0.5)
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
    city_from_desc = None
    m3 = re.search(rf"(?:en|in)\s+([^,]+),\s*{COUNTRY_RE}", desc, re.I)
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


def extract_slugs(html: str) -> set[str]:
    skip = {"europa", "espana", "feed", "otros-paises", "page", REGION_SLUG, "irlanda"}
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

    def one(city_slug: str):
        url = f"https://padellands.com/pistas-de-padel/europa/{REGION_SLUG}/_localidad_pistas-{city_slug}/"
        h = http_text(url)
        slugs = extract_slugs(h)
        pages = [int(x) for x in re.findall(rf"_localidad_pistas-{re.escape(city_slug)}/page/(\d+)/", h)]
        for page in range(2, (max(pages) if pages else 1) + 1):
            slugs |= extract_slugs(http_text(f"{url}page/{page}/"))
            time.sleep(0.35)
        return city_slug, slugs

    done = 0
    for city_slug in locs:
        try:
            cs, slugs = one(city_slug)
        except Exception as e:
            log(f"[locality] fail {city_slug}: {e}")
            done += 1
            time.sleep(2)
            continue
        city = slug_to_city(cs)
        for slug in slugs:
            meta = by_slug.get(slug)
            if meta:
                city_by_id[int(meta["id"])] = city
        done += 1
        if done % 15 == 0 or done == len(locs):
            log(f"[locality] {done}/{len(locs)} mapped={len(city_by_id)}")
        time.sleep(0.8)
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


def main():
    # UK has ~300+ localities → rate-limits badly. Prefer yoast city + HTML detail.
    skip_locality = True
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if INDEX_PATH.exists() and not posts_needed():
        index = json.loads(INDEX_PATH.read_text())
        log(f"[index] reuse {len(index)} from {INDEX_PATH.name}")
    else:
        posts = fetch_index()
        index = [parse_yoast(p) for p in posts]
        INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2))
        log(f"[index] {len(index)} clubs")

    by_slug = {c["slug"]: c for c in index if c.get("slug")}
    city_by_id: dict[int, str] = {}
    if not skip_locality:
        city_by_id = locality_map(by_slug)

    out: dict[int, dict] = {}
    missing = []
    for c in index:
        cid = int(c["id"])
        city = city_by_id.get(cid) or c.get("cityFromDesc")
        # Spanish capital → English for seed aliases
        if city and city.strip().lower() == "londres":
            city = "London"
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
    done = 0
    with ThreadPoolExecutor(max_workers=1) as pool:
        futs = [pool.submit(scrape_detail, m) for m in missing]
        for fut in as_completed(futs):
            club = fut.result()
            done += 1
            if done % 20 == 0 or done == len(missing):
                log(f"[detail] {done}/{len(missing)}")
            if club.get("cityRaw") and not club.get("error"):
                city = club["cityRaw"]
                if str(city).strip().lower() == "londres":
                    club["cityRaw"] = "London"
                out[int(club["id"])] = {
                    **club,
                    "regionSlug": REGION_SLUG,
                    "regionName": REGION_NAME,
                }
            time.sleep(0.6)

    rows = list(out.values())
    OUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    log(
        f"[done] {len(rows)} withCity={sum(1 for c in rows if c.get('cityRaw'))} "
        f"withImg={sum(1 for c in rows if c.get('avatarUrl'))} → {OUT_PATH}"
    )


def posts_needed() -> bool:
    return False


if __name__ == "__main__":
    main()
