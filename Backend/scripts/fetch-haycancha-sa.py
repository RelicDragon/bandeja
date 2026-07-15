#!/usr/bin/env python3
"""Fetch HayCancha clubs (tennis/padel/pickleball) for South America → scripts/data/{key}-haycancha-clubs.json

Usage:
  python3 scripts/fetch-haycancha-sa.py
  python3 scripts/fetch-haycancha-sa.py AR,CL,BR
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
GQL = "https://api.haycancha.com/graphql"
UA = "BandejaHayCanchaImport/1.0"
PAGE = 100
ASSET = "https://api.haycancha.com/assets"

# ISO → bandeja key / English country name / timezone
SA = {
    "AR": {"key": "argentina", "country": "Argentina", "timezone": "America/Argentina/Buenos_Aires"},
    "BO": {"key": "bolivia", "country": "Bolivia", "timezone": "America/La_Paz"},
    "BR": {"key": "brazil", "country": "Brazil", "timezone": "America/Sao_Paulo"},
    "CL": {"key": "chile", "country": "Chile", "timezone": "America/Santiago"},
    "CO": {"key": "colombia", "country": "Colombia", "timezone": "America/Bogota"},
    "EC": {"key": "ecuador", "country": "Ecuador", "timezone": "America/Guayaquil"},
    "GY": {"key": "guyana", "country": "Guyana", "timezone": "America/Guyana"},
    "PY": {"key": "paraguay", "country": "Paraguay", "timezone": "America/Asuncion"},
    "PE": {"key": "peru", "country": "Peru", "timezone": "America/Lima"},
    "SR": {"key": "suriname", "country": "Suriname", "timezone": "America/Paramaribo"},
    "UY": {"key": "uruguay", "country": "Uruguay", "timezone": "America/Montevideo"},
    "VE": {"key": "venezuela", "country": "Venezuela", "timezone": "America/Caracas"},
}

SPORT_MAP = {
    "padel": "PADEL",
    "tenis": "TENNIS",
    "tennis": "TENNIS",
    "pickleball": "PICKLEBALL",
}

QUERY = """
query($iso: String!, $limit: Int!, $offset: Int!) {
  clubes(
    limit: $limit
    offset: $offset
    filter: { pais: { codigo_iso: { _eq: $iso } }, activo: { _eq: true } }
    sort: ["nombre"]
  ) {
    id
    nombre
    slug
    tipo
    direccion
    telefono
    website
    email
    whatsapp
    ubicacion
    descripcion
    pais { nombre codigo_iso }
    ciudad { nombre slug provincia_estado latitud_centro longitud_centro }
    clubes_deportes { deporte { nombre slug } }
    foto_portada { id filename_download }
  }
}
"""


def log(msg: str) -> None:
    print(msg, flush=True)


def gql(query: str, variables: dict | None = None, retries: int = 6) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    raw = json.dumps(payload).encode("utf-8")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                GQL,
                data=raw,
                headers={
                    "User-Agent": UA,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read().decode("utf-8", "ignore"))
            if data.get("errors"):
                raise RuntimeError(data["errors"])
            return data["data"]
        except Exception as e:
            last = e
            wait = 4 + attempt * 5
            log(f"[gql] retry {attempt + 1} wait={wait}s ({e})")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def coords(ubicacion) -> tuple[float | None, float | None]:
    if not isinstance(ubicacion, dict):
        return None, None
    c = ubicacion.get("coordinates")
    if not isinstance(c, list) or len(c) < 2:
        return None, None
    lon, lat = c[0], c[1]
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return None, None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return None, None
    if lat_f == 0 and lon_f == 0:
        return None, None
    return lat_f, lon_f


def normalize_row(row: dict, meta: dict) -> dict | None:
    name = (row.get("nombre") or "").strip()
    city = ((row.get("ciudad") or {}).get("nombre") or "").strip()
    if not name or not city:
        return None
    sports: list[str] = []
    for link in row.get("clubes_deportes") or []:
        dep = (link or {}).get("deporte") or {}
        slug = (dep.get("slug") or "").lower()
        mapped = SPORT_MAP.get(slug)
        if mapped and mapped not in sports:
            sports.append(mapped)
    if not sports:
        sports = ["PADEL"]
    lat, lon = coords(row.get("ubicacion"))
    foto = row.get("foto_portada") or {}
    avatar = None
    if foto.get("id"):
        avatar = f"{ASSET}/{foto['id']}"
        if foto.get("filename_download"):
            avatar = f"{avatar}/{foto['filename_download']}"
    return {
        "id": row.get("id"),
        "name": name,
        "slug": row.get("slug"),
        "cityRaw": city,
        "address": (row.get("direccion") or city).strip() or city,
        "phone": (row.get("telefono") or row.get("whatsapp") or None),
        "website": (row.get("website") or None),
        "email": (row.get("email") or None),
        "latitude": lat,
        "longitude": lon,
        "avatarUrl": avatar,
        "description": row.get("descripcion"),
        "sports": sports,
        "source": "haycancha",
        "sourceUrl": f"https://haycancha.com/club/{row.get('slug')}" if row.get("slug") else None,
        "regionName": meta["country"],
        "countryCode": (row.get("pais") or {}).get("codigo_iso") or None,
        "administrativeArea": (row.get("ciudad") or {}).get("provincia_estado"),
    }


def fetch_country(iso: str, meta: dict) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        data = gql(QUERY, {"iso": iso, "limit": PAGE, "offset": offset})
        batch = data.get("clubes") or []
        if not batch:
            break
        for row in batch:
            norm = normalize_row(row, meta)
            if norm:
                out.append(norm)
        log(f"[hc {iso}] offset={offset} +{len(batch)} have={len(out)}")
        if len(batch) < PAGE:
            break
        offset += PAGE
        time.sleep(0.15)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = list(SA.keys())
    if len(sys.argv) > 1 and sys.argv[1].strip():
        wanted = [c.strip().upper() for c in sys.argv[1].split(",") if c.strip()]
        unknown = [c for c in wanted if c not in SA]
        if unknown:
            print(f"Unknown ISO: {unknown}; known={','.join(SA)}", file=sys.stderr)
            sys.exit(2)

    summary = {}
    for iso in wanted:
        meta = SA[iso]
        rows = fetch_country(iso, meta)
        path = OUT_DIR / f"{meta['key']}-haycancha-clubs.json"
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        summary[iso] = {"n": len(rows), "path": str(path)}
        log(f"[done] {iso} {meta['country']}={len(rows)} → {path}")
    log(f"[summary] {json.dumps(summary)}")


if __name__ == "__main__":
    main()
