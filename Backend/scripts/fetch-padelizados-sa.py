#!/usr/bin/env python3
"""Fetch Padelizados clubs from country sitemaps + JSON-LD → scripts/data/{key}-padelizados-clubs.json

Usage:
  python3 scripts/fetch-padelizados-sa.py
  python3 scripts/fetch-padelizados-sa.py ar,br,cl,co
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
UA = "BandejaPadelizadosImport/1.0"
WORKERS = 4

HOSTS = {
    "ar": {
        "key": "argentina",
        "country": "Argentina",
        "host": "https://ar.padelizados.net",
        "sitemap": "https://ar.padelizados.net/sitemaps/padelizados/sitemap-ar.xml",
    },
    "br": {
        "key": "brazil",
        "country": "Brazil",
        "host": "https://br.padelizados.net",
        "sitemap": "https://br.padelizados.net/sitemaps/padelizados/sitemap-br.xml",
    },
    "cl": {
        "key": "chile",
        "country": "Chile",
        "host": "https://cl.padelizados.net",
        "sitemap": "https://cl.padelizados.net/sitemaps/padelizados/sitemap-cl.xml",
    },
    "co": {
        "key": "colombia",
        "country": "Colombia",
        "host": "https://co.padelizados.net",
        "sitemap": "https://co.padelizados.net/sitemaps/padelizados/sitemap-co.xml",
    },
}


def log(msg: str) -> None:
    print(msg, flush=True)


def http_text(url: str, retries: int = 5) -> str:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            wait = 3 + attempt * 4
            if "503" in str(e) or "429" in str(e):
                wait = 10 + attempt * 6
            log(f"[http] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def item_urls(sitemap_url: str) -> list[str]:
    xml = http_text(sitemap_url)
    locs = re.findall(r"<loc>(.*?)</loc>", xml)
    return sorted({u for u in locs if re.search(r"/i/\d+-", u)})


def parse_ld(html: str) -> dict | None:
    m = re.search(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    )
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    nodes = data.get("@graph") if isinstance(data, dict) else None
    if not isinstance(nodes, list):
        nodes = [data] if isinstance(data, dict) else []
    biz = next((n for n in nodes if isinstance(n, dict) and n.get("@type") == "LocalBusiness"), None)
    return biz


def parse_coords(html: str) -> tuple[float | None, float | None]:
    lat_m = re.search(r'"latitude"\s*:\s*"?([-\d.]+)"?', html)
    lon_m = re.search(r'"longitude"\s*:\s*"?([-\d.]+)"?', html)
    if not lat_m or not lon_m:
        return None, None
    try:
        lat, lon = float(lat_m.group(1)), float(lon_m.group(1))
    except ValueError:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def courts_from_html(html: str) -> int | None:
    m = re.search(r"(\d+)\s*(?:canchas?|pistas?|campos?)\s*(?:de\s*)?pá?del", html, re.I)
    if m:
        return int(m.group(1))
    return None


def scrape_item(url: str, country: str) -> dict | None:
    html = http_text(url)
    biz = parse_ld(html)
    if not biz:
        return None
    name = (biz.get("name") or "").strip()
    addr = biz.get("address") or {}
    city = (addr.get("addressLocality") or "").strip()
    street = (addr.get("streetAddress") or "").strip()
    if not name or not city:
        return None
    lat, lon = parse_coords(html)
    images = biz.get("image") or []
    avatar = images[0] if isinstance(images, list) and images else None
    mid = None
    m = re.search(r"/i/(\d+)-", url)
    if m:
        mid = int(m.group(1))
    return {
        "id": mid,
        "name": name,
        "cityRaw": city,
        "address": street or city,
        "phone": biz.get("telephone"),
        "website": biz.get("url") if isinstance(biz.get("url"), str) else None,
        "latitude": lat,
        "longitude": lon,
        "avatarUrl": avatar,
        "courtsNumber": courts_from_html(html),
        "sports": ["PADEL"],
        "source": "padelizados",
        "sourceUrl": url,
        "regionName": country,
        "postalCode": addr.get("postalCode"),
        "countryCode": addr.get("addressCountry"),
    }


def run_host(cc: str, cfg: dict) -> list[dict]:
    urls = item_urls(cfg["sitemap"])
    log(f"[pz {cc}] items={len(urls)}")
    out: list[dict] = []
    errors = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = {pool.submit(scrape_item, u, cfg["country"]): u for u in urls}
        done = 0
        for fut in as_completed(futs):
            done += 1
            try:
                row = fut.result()
                if row:
                    out.append(row)
                else:
                    errors += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    log(f"[pz {cc}] err {e}")
            if done % 50 == 0 or done == len(urls):
                log(f"[pz {cc}] {done}/{len(urls)} ok={len(out)} errors={errors}")
            time.sleep(0.02)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = list(HOSTS.keys())
    if len(sys.argv) > 1 and sys.argv[1].strip():
        wanted = [c.strip().lower() for c in sys.argv[1].split(",") if c.strip()]
        unknown = [c for c in wanted if c not in HOSTS]
        if unknown:
            print(f"Unknown: {unknown}; known={','.join(HOSTS)}", file=sys.stderr)
            sys.exit(2)

    summary = {}
    for cc in wanted:
        cfg = HOSTS[cc]
        rows = run_host(cc, cfg)
        path = OUT_DIR / f"{cfg['key']}-padelizados-clubs.json"
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        summary[cc] = {"n": len(rows), "path": str(path)}
        log(f"[done] {cc} {cfg['country']}={len(rows)} → {path}")
    log(f"[summary] {json.dumps(summary)}")


if __name__ == "__main__":
    main()
