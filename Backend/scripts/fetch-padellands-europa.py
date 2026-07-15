#!/usr/bin/env python3
"""Fetch Padel Lands clubs for a country → scripts/data/{key}-padellands-clubs.json

Usage:
  python3 scripts/fetch-padellands-europa.py slovenia
  python3 scripts/fetch-padellands-europa.py israel
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import html as H
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
UA = "BandejaPadellandsImport/1.0"
SKIP_DETAIL = os.environ.get("SKIP_DETAIL") == "1"
SKIP_LOCALITY = os.environ.get("SKIP_LOCALITY") == "1"
LOCALITY_WORKERS = int(os.environ.get("LOCALITY_WORKERS") or "4")
DETAIL_WORKERS = int(os.environ.get("DETAIL_WORKERS") or ("6" if SKIP_DETAIL else "2"))

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
    "ukraine": {
        "europa_id": 6411,
        "region_slug": "ucrania",
        "region_name": "Ukraine",
        "country_aliases": ("Ukraine", "Ucrania", "Ukraina", "Україна", "Украина"),
        "key": "ukraine",
        "slug_city": {
            "kiev": "Kyiv",
            "kyiv": "Kyiv",
            "київ": "Kyiv",
            "киев": "Kyiv",
            "odesa": "Odesa",
            "odessa": "Odesa",
            "lviv": "Lviv",
            "lvov": "Lviv",
            "kharkiv": "Kharkiv",
            "dnipro": "Dnipro",
            "dnipropetrovsk": "Dnipro",
        },
    },
    "belarus": {
        "europa_id": 6374,
        "region_slug": "bielorrusia",
        "region_name": "Belarus",
        "country_aliases": ("Belarus", "Bielorrusia", "Belarusia", "Беларусь", "Белоруссия"),
        "key": "belarus",
        "slug_city": {
            "minsk": "Minsk",
            "мінск": "Minsk",
            "минск": "Minsk",
            "gomel": "Gomel",
            "homiel": "Gomel",
            "brest": "Brest",
            "grodno": "Grodno",
            "hrodna": "Grodno",
            "vitebsk": "Vitebsk",
            "mogilev": "Mogilev",
        },
    },
    "israel": {
        "europa_id": 6330,  # otros-paises taxonomy id
        "tax": "otros-paises",
        "region_slug": "israel",
        "region_name": "Israel",
        "country_aliases": ("Israel", "Israël", "Израиль"),
        "key": "israel",
        "slug_city": {
            "tel-aviv": "Tel Aviv",
            "tel-aviv-yafo": "Tel Aviv",
            "jerusalen": "Jerusalem",
            "jerusalem": "Jerusalem",
            "herzliya": "Herzliya",
            "netanya": "Netanya",
            "ramat-gan": "Ramat Gan",
            "rehovot": "Rehovot",
            "kfar-saba": "Kfar Saba",
            "kefar-sava": "Kfar Saba",
            "beer-sheva": "Be'er Sheva",
            "beersheba": "Be'er Sheva",
            "ashdod": "Ashdod",
            "ashdood": "Ashdod",
            "nesher": "Nesher",
            "savyon": "Savyon",
            "haifa": "Haifa",
            "rishon-lezion": "Rishon LeZion",
            "petah-tikva": "Petah Tikva",
        },
    },
    "kazakhstan": {
        "europa_id": 6333,  # otros-paises taxonomy id
        "tax": "otros-paises",
        "region_slug": "kazajistan",
        "region_name": "Kazakhstan",
        "country_aliases": ("Kazakhstan", "Kazajistán", "Kazajistan", "Kazahstan", "Қазақстан"),
        "key": "kazakhstan",
        "slug_city": {
            "almaty": "Almaty",
            "astana": "Astana",
            "nur-sultan": "Astana",
            "nursultan": "Astana",
        },
    },
    "georgia": {
        "europa_id": 6384,
        "region_slug": "georgia",
        "region_name": "Georgia",
        "country_aliases": ("Georgia", "Georgien", "Géorgie", "საქართველო"),
        "key": "georgia",
        "slug_city": {
            "tbilisi": "Tbilisi",
            "tibilisi": "Tbilisi",
            "batumi": "Batumi",
            "kutaisi": "Kutaisi",
            "rustavi": "Rustavi",
            "mtskheta": "Mtskheta",
            "tskneti": "Tbilisi",
        },
    },
    "armenia": {
        "europa_id": 6297,
        "tax": "otros-paises",
        "region_slug": "armenia",
        "region_name": "Armenia",
        "country_aliases": ("Armenia", "Armenien", "Arménie", "Հայաստան"),
        "key": "armenia",
        "slug_city": {
            "yerevan": "Yerevan",
            "erevan": "Yerevan",
            "gyumri": "Gyumri",
        },
        # Search hits not always under the taxonomy term
        "extra_slugs": (
            "pame-padel-armenia",
            "armenia-padel-center",
            "club-country-padel-armenia",
        ),
    },
    "argentina": {
        "europa_id": 6296,
        "tax": "otros-paises",
        "region_slug": "argentina",
        "region_name": "Argentina",
        "country_aliases": ("Argentina", "Argentine", "Argentinien"),
        "key": "argentina",
        "slug_city": {
            "buenos-aires": "Buenos Aires",
            "ciudad-autonoma-de-buenos-aires": "Buenos Aires",
            "caba": "Buenos Aires",
            "cordoba": "Córdoba",
            "rosario": "Rosario",
            "mendoza": "Mendoza",
            "la-plata": "La Plata",
            "mar-del-plata": "Mar del Plata",
            "salta": "Salta",
            "tucuman": "San Miguel de Tucumán",
            "san-miguel-de-tucuman": "San Miguel de Tucumán",
        },
    },
    "brazil": {
        "europa_id": 6304,
        "tax": "otros-paises",
        "region_slug": "brasil",
        "region_name": "Brazil",
        "country_aliases": ("Brazil", "Brasil", "Brésil", "Brasilien"),
        "key": "brazil",
        "slug_city": {
            "sao-paulo": "São Paulo",
            "rio-de-janeiro": "Rio de Janeiro",
            "brasilia": "Brasília",
            "curitiba": "Curitiba",
            "belo-horizonte": "Belo Horizonte",
            "porto-alegre": "Porto Alegre",
            "florianopolis": "Florianópolis",
            "fortaleza": "Fortaleza",
            "salvador": "Salvador",
            "recife": "Recife",
        },
    },
    "chile": {
        "europa_id": 6307,
        "tax": "otros-paises",
        "region_slug": "chile",
        "region_name": "Chile",
        "country_aliases": ("Chile", "Chili"),
        "key": "chile",
        "slug_city": {
            "santiago": "Santiago",
            "santiago-de-chile": "Santiago",
            "valparaiso": "Valparaíso",
            "vina-del-mar": "Viña del Mar",
            "concepcion": "Concepción",
            "antofagasta": "Antofagasta",
            "la-serena": "La Serena",
        },
    },
    "colombia": {
        "europa_id": 6309,
        "tax": "otros-paises",
        "region_slug": "colombia",
        "region_name": "Colombia",
        "country_aliases": ("Colombia", "Colombie", "Kolumbien"),
        "key": "colombia",
        "slug_city": {
            "bogota": "Bogotá",
            "medellin": "Medellín",
            "cali": "Cali",
            "barranquilla": "Barranquilla",
            "cartagena": "Cartagena",
            "bucaramanga": "Bucaramanga",
            "pereira": "Pereira",
        },
    },
    "ecuador": {
        "europa_id": 6314,
        "tax": "otros-paises",
        "region_slug": "ecuador",
        "region_name": "Ecuador",
        "country_aliases": ("Ecuador", "Équateur"),
        "key": "ecuador",
        "slug_city": {
            "quito": "Quito",
            "guayaquil": "Guayaquil",
            "cuenca": "Cuenca",
            "manta": "Manta",
        },
    },
    "paraguay": {
        "europa_id": 6348,
        "tax": "otros-paises",
        "region_slug": "paraguay",
        "region_name": "Paraguay",
        "country_aliases": ("Paraguay", "Paraguai"),
        "key": "paraguay",
        "slug_city": {
            "asuncion": "Asunción",
            "ciudad-del-este": "Ciudad del Este",
            "encarnacion": "Encarnación",
        },
    },
    "peru": {
        "europa_id": 6349,
        "tax": "otros-paises",
        "region_slug": "peru",
        "region_name": "Peru",
        "country_aliases": ("Peru", "Perú", "Pérou"),
        "key": "peru",
        "slug_city": {
            "lima": "Lima",
            "arequipa": "Arequipa",
            "cusco": "Cusco",
            "trujillo": "Trujillo",
        },
    },
    "uruguay": {
        "europa_id": 6364,
        "tax": "otros-paises",
        "region_slug": "uruguay",
        "region_name": "Uruguay",
        "country_aliases": ("Uruguay", "Uruguai"),
        "key": "uruguay",
        "slug_city": {
            "montevideo": "Montevideo",
            "punta-del-este": "Punta del Este",
            "maldonado": "Maldonado",
            "colonia": "Colonia del Sacramento",
            "colonia-del-sacramento": "Colonia del Sacramento",
        },
    },
    "venezuela": {
        "europa_id": 6366,
        "tax": "otros-paises",
        "region_slug": "venezuela",
        "region_name": "Venezuela",
        "country_aliases": ("Venezuela",),
        "key": "venezuela",
        "slug_city": {
            "caracas": "Caracas",
            "maracaibo": "Maracaibo",
            "valencia": "Valencia",
            "barquisimeto": "Barquisimeto",
        },
    },
    "bolivia": {
        "europa_id": 6302,
        "tax": "otros-paises",
        "region_slug": "bolivia",
        "region_name": "Bolivia",
        "country_aliases": ("Bolivia", "Bolivie", "Bolivien"),
        "key": "bolivia",
        "slug_city": {
            "la-paz": "La Paz",
            "santa-cruz": "Santa Cruz de la Sierra",
            "santa-cruz-de-la-sierra": "Santa Cruz de la Sierra",
            "cochabamba": "Cochabamba",
            "sucre": "Sucre",
        },
    },
    "southafrica": {
        "europa_id": 6358,
        "tax": "otros-paises",
        "region_slug": "sudafrica",
        "region_name": "South Africa",
        "country_aliases": (
            "South Africa",
            "Sudáfrica",
            "Sudafrica",
            "Southafrica",
            "Afrique du Sud",
            "Südafrika",
        ),
        "key": "southafrica",
        "slug_city": {
            "cape-town": "Cape Town",
            "ciudad-del-cabo": "Cape Town",
            "johannesburg": "Johannesburg",
            "johannesburgo": "Johannesburg",
            "pretoria": "Pretoria",
            "durban": "Durban",
            "sandton": "Sandton",
            "stellenbosch": "Stellenbosch",
            "bloemfontein": "Bloemfontein",
            "port-elizabeth": "Gqeberha",
            "gqeberha": "Gqeberha",
            "east-london": "East London",
            "milnerton": "Milnerton",
            "somerset-west": "Somerset West",
            "paarl": "Paarl",
            "centurion": "Centurion",
            "randburg": "Randburg",
            "kimberley": "Kimberley",
            "hartswater": "Hartswater",
            "fourways": "Fourways",
            "midrand": "Midrand",
            "umhlanga": "Umhlanga",
            "ballito": "Ballito",
            "knysna": "Knysna",
            "hermanus": "Hermanus",
            "george": "George",
            "nelspruit": "Mbombela",
            "mbombela": "Mbombela",
            "polokwane": "Polokwane",
            "roodepoort": "Roodepoort",
            "benoni": "Benoni",
            "boksburg": "Boksburg",
            "krugersdorp": "Krugersdorp",
            "claremont": "Claremont",
            "constantia": "Constantia",
            "sea-point": "Sea Point",
            "camps-bay": "Camps Bay",
        },
    },
    "saudi": {
        "europa_id": 6295,
        "tax": "otros-paises",
        "region_slug": "arabia-saudi",
        "region_name": "Saudi Arabia",
        "country_aliases": (
            "Saudi Arabia",
            "Arabia Saudí",
            "Arabia Saudi",
            "Arabia Saudita",
            "Kingdom of Saudi Arabia",
            "KSA",
            "السعودية",
        ),
        "key": "saudi",
        "slug_city": {
            "riyadh": "Riyadh",
            "jeddah": "Jeddah",
            "jaddah": "Jeddah",
            "dammam": "Dammam",
            "dhahran": "Dhahran",
            "al-khobar": "Al Khobar",
            "khobar": "Al Khobar",
            "al-hofuf": "Al Hofuf",
            "hofuf": "Al Hofuf",
            "al-jubail": "Al Jubail",
            "al-jubaail": "Al Jubail",
            "jubail": "Al Jubail",
            "al-kharj": "Al Kharj",
            "kharj": "Al Kharj",
            "al-madinah": "Medina",
            "al-madinah-al-munawwarah": "Medina",
            "madinah": "Medina",
            "medina": "Medina",
            "makkah": "Mecca",
            "mecca": "Mecca",
            "abha": "Abha",
            "khamis-mushait": "Khamis Mushait",
            "buraydah": "Buraydah",
            "buraidah": "Buraydah",
            "tabuk": "Tabuk",
            "yanbu": "Yanbu",
            "taif": "Taif",
            "jazan": "Jazan",
            "qatif": "Al Qatif",
            "al-qatif": "Al Qatif",
            "diriyah": "Diriyah",
            "hail": "Hail",
            "unaizah": "Unaizah",
            "unayzah": "Unaizah",
            "saihat": "Saihat",
            "al-mubarraz": "Al Mubarraz",
            "muhayil": "Muhayil",
            "anak": "Anak",
            "al-qusur": "Al Qusur",
        },
    },
    "oman": {
        "europa_id": 6346,
        "tax": "otros-paises",
        "region_slug": "oman",
        "region_name": "Oman",
        "country_aliases": ("Oman", "Omán", "Omàn", "عمان"),
        "key": "oman",
        "slug_city": {
            "mascate": "Muscat",
            "muscat": "Muscat",
            "seeb": "Seeb",
            "sohar": "Sohar",
            "salalah": "Salalah",
            "barka": "Barka",
            "dhofar": "Salalah",
            "sur": "Sur",
            "suwaiq": "Suwaiq",
            "taqah": "Taqah",
            "al-amarat": "Al Amarat",
            "al-azaiba": "Al Azaiba",
            "al-farfarah": "Al Farfarah",
            "almabbela": "Al Mawaleh",
            "al-mawaleh": "Al Mawaleh",
        },
    },
}


BASE_SLUG_CITY = {
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


def slug_to_city(slug: str, extra: dict[str, str] | None = None) -> str:
    special = {**BASE_SLUG_CITY, **(extra or {})}
    if slug in special:
        return special[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def city_from_slug(slug: str | None, slug_city: dict[str, str] | None = None) -> str | None:
    if not slug:
        return None
    s = slug.lower()
    mapping = {**BASE_SLUG_CITY, **(slug_city or {})}
    for key, city in sorted(mapping.items(), key=lambda kv: -len(kv[0])):
        if key in s:
            return city
    return None


def clean_city_fragment(raw: str | None) -> str | None:
    if not raw:
        return None
    s = re.sub(r"\s+", " ", raw).strip(" .")
    s = re.sub(
        r"^(?:la\s+ciudad\s+de|la\s+localidad\s+de|la\s+poblaci[oó]n\s+de|"
        r"el\s+municipio\s+de|sus\s+\d+\s+pistas\s+de\s+padel\s+de)\s+",
        "",
        s,
        flags=re.I,
    )
    s = re.sub(r"\s+", " ", s).strip(" .")
    if not s or len(s) > 60:
        return None
    if s.lower() in {"la ciudad", "la localidad", "este centro", "un centro", "localidad de israel"}:
        return None
    # Drop Spanish boilerplate when regex captured too much ("padel en Durban")
    s2 = re.sub(
        r"^(?:\d+\s+)?(?:pistas?\s+de\s+)?padel\s+en\s+",
        "",
        s,
        flags=re.I,
    ).strip()
    if s2:
        s = s2
    low = s.lower()
    if any(
        x in low
        for x in (
            "padel",
            "pista",
            "court",
            "instalacion",
            "instalación",
            "sede de",
            "disponib",
            "centros",
            "localizad",
        )
    ):
        return None
    return s


def fetch_index(term_id: int, tax: str = "europa"):
    posts = []
    page = 1
    while True:
        url = (
            "https://padellands.com/wp-json/wp/v2/pistas-de-padel"
            f"?{tax}={term_id}&per_page=100&page={page}"
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
    else:
        m = re.search(r"(\d+)\s+padel\s+courts?", desc, re.I)
        if m:
            courts = int(m.group(1))
    city_from_desc = None
    alias_re = "|".join(re.escape(a) for a in country_aliases)
    m3 = re.search(
        rf"(?:ubicad[ao]s?\s+en|situad[ao]s?\s+en|est[áa]\s+en|(?<![a-záéíóúñ])(?:en|in))\s+"
        rf"([^,]+?)(?:,\s*(?:Localidad\s+de\s+)?(?:{alias_re}))",
        desc,
        re.I,
    )
    if m3:
        city_from_desc = clean_city_fragment(m3.group(1))
    else:
        m2 = re.search(r"(?:en|in)\s+([^.,]+?)(?:,|\.|$)", desc, re.I)
        if m2:
            city_from_desc = clean_city_fragment(m2.group(1))
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
        if s not in skip and not s.startswith("_"):
            slugs.add(s)
    return slugs


def locality_map(
    by_slug: dict,
    region_slug: str,
    tax: str = "europa",
    slug_city: dict[str, str] | None = None,
) -> dict[int, str]:
    region_url = f"https://padellands.com/pistas-de-padel/{tax}/{region_slug}/"
    html = http_text(region_url)
    locs = sorted(set(re.findall(r"_localidad_pistas-([a-z0-9\-]+)/", html)))
    log(f"[locality] {len(locs)} localities")
    city_by_id: dict[int, str] = {}

    def one(city_slug: str):
        url = f"https://padellands.com/pistas-de-padel/{tax}/{region_slug}/_localidad_pistas-{city_slug}/"
        h = http_text(url)
        slugs = extract_slugs(h, region_slug)
        pages = [int(x) for x in re.findall(rf"_localidad_pistas-{re.escape(city_slug)}/page/(\d+)/", h)]
        for page in range(2, (max(pages) if pages else 1) + 1):
            slugs |= extract_slugs(http_text(f"{url}page/{page}/"), region_slug)
            time.sleep(0.15)
        return city_slug, slugs

    done = 0
    with ThreadPoolExecutor(max_workers=LOCALITY_WORKERS) as pool:
        futs = [pool.submit(one, s) for s in locs]
        for fut in as_completed(futs):
            try:
                city_slug, slugs = fut.result()
            except Exception as e:
                log(f"[locality] fail {e}")
                done += 1
                continue
            city = slug_to_city(city_slug, slug_city)
            for slug in slugs:
                meta = by_slug.get(slug)
                if meta:
                    city_by_id[int(meta["id"])] = city
            done += 1
            if done % 10 == 0 or done == len(locs):
                log(f"[locality] {done}/{len(locs)} mapped={len(city_by_id)}")
            time.sleep(0.02)
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
    city = clean_city_fragment(after_label(lines, "Localidad", "Location", "Ort"))
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


def fetch_by_slug(slug: str) -> dict | None:
    url = (
        "https://padellands.com/wp-json/wp/v2/pistas-de-padel"
        f"?slug={urllib.request.quote(slug)}&per_page=1"
        "&_fields=id,slug,title,link,featured_media,yoast_head_json"
    )
    data, _ = http_json(url)
    return data[0] if data else None


def run(cfg: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    key = cfg["key"]
    tax = cfg.get("tax") or "europa"
    out_path = OUT_DIR / f"{key}-padellands-clubs.json"
    index_path = OUT_DIR / f"{key}-padellands-index.json"
    term_id = int(cfg.get("europa_id") or 0)
    if term_id <= 0:
        out_path.write_text("[]")
        index_path.write_text("[]")
        log(f"[done] {key}: no taxonomy id — empty PL export")
        return

    posts = fetch_index(term_id, tax=tax)
    seen_slugs = {p.get("slug") for p in posts if p.get("slug")}
    for slug in cfg.get("extra_slugs") or ():
        if slug in seen_slugs:
            continue
        try:
            extra = fetch_by_slug(slug)
        except Exception as e:
            log(f"[extra] fail {slug}: {e}")
            continue
        if extra:
            posts.append(extra)
            seen_slugs.add(slug)
            log(f"[extra] +{slug}")
        else:
            log(f"[extra] miss {slug}")
    index = [parse_yoast(p, cfg["country_aliases"]) for p in posts]
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2))
    by_slug = {c["slug"]: c for c in index if c.get("slug")}
    log(f"[index] {len(index)} clubs withCityDesc={sum(1 for c in index if c.get('cityFromDesc'))}")

    city_by_id: dict[int, str] = {}
    if SKIP_LOCALITY:
        log("[locality] skipped (SKIP_LOCALITY=1)")
    else:
        try:
            city_by_id = locality_map(by_slug, cfg["region_slug"], tax=tax, slug_city=cfg.get("slug_city"))
        except Exception as e:
            log(f"[locality] aborted: {e}")

    out: dict[int, dict] = {}
    slug_city = cfg.get("slug_city") or {}
    if SKIP_DETAIL:
        log(f"[detail] skipped; assembling {len(index)} from index+locality+slug")
        for club in index:
            cid = int(club["id"])
            city = (
                city_by_id.get(cid)
                or club.get("cityFromDesc")
                or city_from_slug(club.get("slug"), slug_city)
            )
            if not city:
                continue
            out[cid] = {
                **club,
                "cityRaw": city,
                "address": city,
                "regionSlug": cfg["region_slug"],
                "regionName": cfg["region_name"],
                "sourceUrl": club.get("link") or f"https://padellands.com/pistas-de-padel/{club.get('slug')}/",
            }
    else:
        log(f"[detail] scraping {len(index)} clubs workers={DETAIL_WORKERS}")
        with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as pool:
            futs = [pool.submit(scrape_detail, c) for c in index]
            for fut in as_completed(futs):
                club = fut.result()
                cid = int(club["id"])
                city = (
                    city_by_id.get(cid)
                    or club.get("cityRaw")
                    or club.get("cityFromDesc")
                    or city_from_slug(club.get("slug"), slug_city)
                )
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
                time.sleep(0.05)

    rows = list(out.values())
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    log(
        f"[done] {len(rows)} withCity={sum(1 for c in rows if c.get('cityRaw'))} "
        f"withImg={sum(1 for c in rows if c.get('avatarUrl'))} → {out_path}"
    )


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COUNTRIES:
        print(f"Usage: {sys.argv[0]} <{'|'.join(COUNTRIES)}>", file=sys.stderr)
        print(f"Known: {', '.join(COUNTRIES)}", file=sys.stderr)
        sys.exit(2)
    run(COUNTRIES[sys.argv[1]])


if __name__ == "__main__":
    main()
