/**
 * Append Padel Lands clubs for Slovenia / Slovakia (dedupe by cityId + normalizedName).
 *
 *   DB_URL=... DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/seed-padellands-europa.ts slovenia
 *   DRY_RUN=1 ... slovakia
 */
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { resolveCityName, resolveCityCoords } from './lib/dr5hnCityResolver';
import { CityGroupService } from '../src/services/chat/cityGroup.service';
import { refreshAllCitiesFromClubs } from '../src/utils/updateCityCenter';

type CountryCfg = {
  key: string;
  country: string;
  countryCode: string;
  timezone: string;
  cityAliases: Record<string, string>;
};

const CONFIGS: Record<string, CountryCfg> = {
  slovenia: {
    key: 'slovenia',
    country: 'Slovenia',
    countryCode: 'SI',
    timezone: 'Europe/Ljubljana',
    cityAliases: {
      liubliana: 'Ljubljana',
      ljubljana: 'Ljubljana',
      laibach: 'Ljubljana',
    },
  },
  slovakia: {
    key: 'slovakia',
    country: 'Slovakia',
    countryCode: 'SK',
    timezone: 'Europe/Bratislava',
    cityAliases: {
      bratislava: 'Bratislava',
      pressburg: 'Bratislava',
      pozsony: 'Bratislava',
    },
  },
  uk: {
    key: 'uk',
    country: 'United Kingdom',
    countryCode: 'GB',
    timezone: 'Europe/London',
    cityAliases: {
      londres: 'London',
      london: 'London',
      edimburgo: 'Edinburgh',
      edinburgh: 'Edinburgh',
      manchester: 'Manchester',
      birmingham: 'Birmingham',
      liverpool: 'Liverpool',
      glasgow: 'Glasgow',
      cardiff: 'Cardiff',
      belfast: 'Belfast',
      bristol: 'Bristol',
      leeds: 'Leeds',
    },
  },
  ireland: {
    key: 'ireland',
    country: 'Ireland',
    countryCode: 'IE',
    timezone: 'Europe/Dublin',
    cityAliases: {
      dublin: 'Dublin',
      dublín: 'Dublin',
      cork: 'Cork',
      galway: 'Galway',
      limerick: 'Limerick',
      waterford: 'Waterford',
    },
  },
  belgium: {
    key: 'belgium',
    country: 'Belgium',
    countryCode: 'BE',
    timezone: 'Europe/Brussels',
    cityAliases: {
      bruselas: 'Brussels',
      bruxelles: 'Brussels',
      brussels: 'Brussels',
      brussel: 'Brussels',
      amberes: 'Antwerp',
      antwerp: 'Antwerp',
      antwerpen: 'Antwerp',
      anvers: 'Antwerp',
      gand: 'Ghent',
      gent: 'Ghent',
      ghent: 'Ghent',
      lieja: 'Liège',
      liege: 'Liège',
      'liège': 'Liège',
      brugge: 'Bruges',
      bruges: 'Bruges',
      brujas: 'Bruges',
      lovaina: 'Leuven',
      leuven: 'Leuven',
      louvain: 'Leuven',
      namur: 'Namur',
      namen: 'Namur',
      charleroi: 'Charleroi',
      mons: 'Mons',
      bergen: 'Mons',
      hasselt: 'Hasselt',
      kortrijk: 'Kortrijk',
      courtrai: 'Kortrijk',
      ostende: 'Ostend',
      oostende: 'Ostend',
      ostend: 'Ostend',
      mechelen: 'Mechelen',
      malinas: 'Mechelen',
      wavre: 'Wavre',
      waterloo: 'Waterloo',
      zaventem: 'Zaventem',
    },
  },
  andorra: {
    key: 'andorra',
    country: 'Andorra',
    countryCode: 'AD',
    timezone: 'Europe/Andorra',
    cityAliases: {
      'andorra la vella': 'Andorra la Vella',
      'escaldes-engordany': 'Escaldes-Engordany',
      'escaldes engordany': 'Escaldes-Engordany',
      encamp: 'Encamp',
      'la massana': 'La Massana',
      ordino: 'Ordino',
      canillo: 'Canillo',
      "sant julià de lòria": 'Sant Julià de Lòria',
      'sant julia de loria': 'Sant Julià de Lòria',
      'pas de la casa': 'Pas de la Casa',
    },
  },
  luxembourg: {
    key: 'luxembourg',
    country: 'Luxembourg',
    countryCode: 'LU',
    timezone: 'Europe/Luxembourg',
    cityAliases: {
      luxemburgo: 'Luxembourg',
      luxembourg: 'Luxembourg',
      'luxembourg city': 'Luxembourg',
      'esch-sur-alzette': 'Esch-sur-Alzette',
      'esch sur alzette': 'Esch-sur-Alzette',
      differdange: 'Differdange',
      dudelange: 'Dudelange',
    },
  },
  monaco: {
    key: 'monaco',
    country: 'Monaco',
    countryCode: 'MC',
    timezone: 'Europe/Monaco',
    cityAliases: {
      monaco: 'Monaco',
      'monte carlo': 'Monaco',
      montecarlo: 'Monaco',
    },
  },
  malta: {
    key: 'malta',
    country: 'Malta',
    countryCode: 'MT',
    timezone: 'Europe/Malta',
    cityAliases: {
      valletta: 'Valletta',
      sliema: 'Sliema',
      "st. julian's": "St. Julian's",
      "st julian's": "St. Julian's",
      'st julians': "St. Julian's",
      mosta: 'Mosta',
      birkirkara: 'Birkirkara',
      mdina: 'Mdina',
      victoria: 'Victoria',
      gozo: 'Victoria',
      marsaskala: 'Marsaskala',
      "st. paul's bay": "St. Paul's Bay",
      naxxar: 'Naxxar',
      gżira: 'Gżira',
      gzira: 'Gżira',
    },
  },
  liechtenstein: {
    key: 'liechtenstein',
    country: 'Liechtenstein',
    countryCode: 'LI',
    timezone: 'Europe/Vaduz',
    cityAliases: {
      vaduz: 'Vaduz',
      schaan: 'Schaan',
      triesen: 'Triesen',
      balzers: 'Balzers',
    },
  },
  sanmarino: {
    key: 'sanmarino',
    country: 'San Marino',
    countryCode: 'SM',
    timezone: 'Europe/San_Marino',
    cityAliases: {
      'san marino': 'San Marino',
      serravalle: 'Serravalle',
      'borgo maggiore': 'Borgo Maggiore',
      domagnano: 'Domagnano',
    },
  },
  iceland: {
    key: 'iceland',
    country: 'Iceland',
    countryCode: 'IS',
    timezone: 'Atlantic/Reykjavik',
    cityAliases: {
      reikiavik: 'Reykjavik',
      reykjavik: 'Reykjavik',
      reykjavík: 'Reykjavik',
      kópavogur: 'Kópavogur',
      kopavogur: 'Kópavogur',
      akureyri: 'Akureyri',
    },
  },
  uae: {
    key: 'uae',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    timezone: 'Asia/Dubai',
    cityAliases: {
      dubai: 'Dubai',
      'abu dhabi': 'Abu Dhabi',
      'abu-dhabi': 'Abu Dhabi',
      sharjah: 'Sharjah',
      ajman: 'Ajman',
      'ras al khaimah': 'Ras Al Khaimah',
      'ras al-khaimah': 'Ras Al Khaimah',
      fujairah: 'Fujairah',
      'al ain': 'Al Ain',
      'al-ain': 'Al Ain',
      'umm al quwain': 'Umm Al Quwain',
      'umm al qaywayn': 'Umm Al Quwain',
      'khor fakkan': 'Khor Fakkan',
      kalba: 'Kalba',
      'garhoud dubai': 'Dubai',
      'al salamah': 'Al Ain',
    },
  },
  kazakhstan: {
    key: 'kazakhstan',
    country: 'Kazakhstan',
    countryCode: 'KZ',
    timezone: 'Asia/Almaty',
    cityAliases: {
      almaty: 'Almaty',
      алматы: 'Almaty',
      astana: 'Astana',
      астана: 'Astana',
      'nur-sultan': 'Astana',
      nursultan: 'Astana',
    },
  },
  ukraine: {
    key: 'ukraine',
    country: 'Ukraine',
    countryCode: 'UA',
    timezone: 'Europe/Kyiv',
    cityAliases: {
      kiev: 'Kyiv',
      kyiv: 'Kyiv',
      київ: 'Kyiv',
      киев: 'Kyiv',
      odesa: 'Odesa',
      odessa: 'Odesa',
      lviv: 'Lviv',
      lvov: 'Lviv',
      kharkiv: 'Kharkiv',
      dnipro: 'Dnipro',
      dnipropetrovsk: 'Dnipro',
    },
  },
  belarus: {
    key: 'belarus',
    country: 'Belarus',
    countryCode: 'BY',
    timezone: 'Europe/Minsk',
    cityAliases: {
      minsk: 'Minsk',
      мінск: 'Minsk',
      минск: 'Minsk',
      gomel: 'Gomel',
      homiel: 'Gomel',
      brest: 'Brest',
      grodno: 'Grodno',
      hrodna: 'Grodno',
      vitebsk: 'Vitebsk',
      mogilev: 'Mogilev',
    },
  },
  israel: {
    key: 'israel',
    country: 'Israel',
    countryCode: 'IL',
    timezone: 'Asia/Jerusalem',
    cityAliases: {
      ashdood: 'Ashdod',
      ashdod: 'Ashdod',
      jerusalén: 'Jerusalem',
      jerusalen: 'Jerusalem',
      jerusalem: 'Jerusalem',
      "be´er sheva": "Be'er Sheva",
      "be'er sheva": "Be'er Sheva",
      'beer sheva': "Be'er Sheva",
      beersheba: "Be'er Sheva",
      herzliya: 'Herzliya',
      'ramat gan': 'Ramat Gan',
      netanya: 'Netanya',
      savyon: 'Savyon',
      rehovot: 'Rehovot',
      'kefar sava': 'Kfar Saba',
      'kfar saba': 'Kfar Saba',
      'tel aviv': 'Tel Aviv',
      'tel aviv-yafo': 'Tel Aviv',
      nesher: 'Nesher',
      haifa: 'Haifa',
    },
  },
  georgia: {
    key: 'georgia',
    country: 'Georgia',
    countryCode: 'GE',
    timezone: 'Asia/Tbilisi',
    cityAliases: {
      tbilisi: 'Tbilisi',
      tibilisi: 'Tbilisi',
      batumi: 'Batumi',
      kutaisi: 'Kutaisi',
      rustavi: 'Rustavi',
      "rust'avi": 'Rustavi',
      "rust’avi": 'Rustavi',
      mtskheta: 'Mtskheta',
      tskneti: 'Tbilisi',
    },
  },
  armenia: {
    key: 'armenia',
    country: 'Armenia',
    countryCode: 'AM',
    timezone: 'Asia/Yerevan',
    cityAliases: {
      yerevan: 'Yerevan',
      erevan: 'Yerevan',
      gyumri: 'Gyumri',
    },
  },
  southafrica: {
    key: 'southafrica',
    country: 'South Africa',
    countryCode: 'ZA',
    timezone: 'Africa/Johannesburg',
    cityAliases: {
      'ciudad del cabo': 'Cape Town',
      'cape town': 'Cape Town',
      'cape town (ciudad del cabo)': 'Cape Town',
      johannesburgo: 'Johannesburg',
      johannesburg: 'Johannesburg',
      'johannesburg (johannesburgo)': 'Johannesburg',
      'pretoria (pretoria)': 'Pretoria',
      'durban (durban)': 'Durban',
      pretoria: 'Pretoria',
      durban: 'Durban',
      sandton: 'Sandton',
      stellenbosch: 'Stellenbosch',
      bloemfontein: 'Bloemfontein',
      'port elizabeth': 'Gqeberha',
      gqeberha: 'Gqeberha',
      'east london': 'East London',
      randburg: 'Randburg',
      kimberley: 'Kimberley',
      hartswater: 'Hartswater',
      centurion: 'Centurion',
      fourways: 'Fourways',
      midrand: 'Midrand',
      umhlanga: 'Umhlanga',
      'somerset west': 'Somerset West',
      nelspruit: 'Mbombela',
      mbombela: 'Mbombela',
    },
  },
  saudi: {
    key: 'saudi',
    country: 'Saudi Arabia',
    countryCode: 'SA',
    timezone: 'Asia/Riyadh',
    cityAliases: {
      riyadh: 'Riyadh',
      jeddah: 'Jeddah',
      jaddah: 'Jeddah',
      dammam: 'Dammam',
      dhahran: 'Dhahran',
      'al khobar': 'Al Khobar',
      khobar: 'Al Khobar',
      'al hofuf': 'Al Hofuf',
      hofuf: 'Al Hofuf',
      'al jubail': 'Al Jubail',
      jubail: 'Al Jubail',
      'al kharj': 'Al Kharj',
      kharj: 'Al Kharj',
      madinah: 'Medina',
      'al madinah': 'Medina',
      medina: 'Medina',
      makkah: 'Mecca',
      mecca: 'Mecca',
      abha: 'Abha',
      'khamis mushait': 'Khamis Mushait',
      buraydah: 'Buraydah',
      buraidah: 'Buraydah',
      tabuk: 'Tabuk',
      yanbu: 'Yanbu',
      taif: 'Taif',
      jazan: 'Jazan',
      qatif: 'Al Qatif',
      'al qatif': 'Al Qatif',
      diriyah: 'Diriyah',
      hail: 'Hail',
      unaizah: 'Unaizah',
      unayzah: 'Unaizah',
      saihat: 'Saihat',
    },
  },
  oman: {
    key: 'oman',
    country: 'Oman',
    countryCode: 'OM',
    timezone: 'Asia/Muscat',
    cityAliases: {
      mascate: 'Muscat',
      muscat: 'Muscat',
      seeb: 'Seeb',
      sohar: 'Sohar',
      salalah: 'Salalah',
      barka: 'Barka',
      dhofar: 'Salalah',
      sur: 'Sur',
      suwaiq: 'Suwaiq',
      taqah: 'Taqah',
      'al amarat': 'Al Amarat',
      'al azaiba': 'Al Azaiba',
      almabbela: 'Al Mawaleh',
      'al mawaleh': 'Al Mawaleh',
    },
  }
};

const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_CITY_GROUP = process.env.SKIP_CITY_GROUP === '1';

type PlClub = {
  id: number;
  name: string;
  slug?: string;
  address?: string | null;
  phone?: string | null;
  cityRaw?: string | null;
  courtsNumber?: number | null;
  avatarUrl?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string;
  description?: string;
  error?: string;
};

function cleanCity(raw: string, aliases: Record<string, string>): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return aliases[trimmed.toLowerCase()] || trimmed;
}

async function getOrCreateCity(
  cfg: CountryCfg,
  cityRaw: string,
  cache: Map<string, { id: string; lat: number | null; lon: number | null }>
): Promise<{ id: string; lat: number | null; lon: number | null; created: boolean }> {
  const resolved = resolveCityName(cfg.country, cfg.countryCode, cityRaw) || cityRaw;
  const name = cleanCity(resolved, cfg.cityAliases);
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, created: false };

  const existing = await prisma.city.findFirst({
    where: { name, country: cfg.country },
    select: { id: true, latitude: true, longitude: true },
  });
  if (existing) {
    const row = { id: existing.id, lat: existing.latitude, lon: existing.longitude };
    cache.set(key, row);
    return { ...row, created: false };
  }

  if (DRY_RUN) {
    const coords = resolveCityCoords(cfg.country, cfg.countryCode, name);
    const fake = {
      id: `dry-${key}`,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
    };
    cache.set(key, fake);
    return { ...fake, created: true };
  }

  const coords = resolveCityCoords(cfg.country, cfg.countryCode, name);
  const city = await prisma.city.create({
    data: {
      name,
      country: cfg.country,
      timezone: cfg.timezone,
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
      // /cities API only returns isCorrect=true — imported clubs must be visible
      isCorrect: true,
    },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!SKIP_CITY_GROUP) {
    try {
      await CityGroupService.ensureCityGroupExists(city.id);
    } catch (e) {
      console.warn(`[${cfg.key}-pl] cityGroup skip for ${name}:`, (e as Error)?.message || e);
    }
  }
  const row = { id: city.id, lat: city.latitude, lon: city.longitude };
  cache.set(key, row);
  return { ...row, created: true };
}

async function seedCountry(cfg: CountryCfg): Promise<void> {
  const dataPath = path.join(__dirname, 'data', `${cfg.key}-padellands-clubs.json`);
  if (!fs.existsSync(dataPath)) throw new Error(`Missing ${dataPath}`);
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as PlClub[];
  const clubs = raw.filter((c) => c?.name && c?.cityRaw && !c.error);
  console.log(`[${cfg.key}-pl] loaded ${raw.length}, usable ${clubs.length}, dryRun=${DRY_RUN}`);

  const existing = await prisma.club.findMany({
    where: { city: { country: cfg.country } },
    select: {
      id: true,
      normalizedName: true,
      cityId: true,
      city: { select: { name: true } },
    },
  });
  const byCityNorm = new Set(existing.map((c) => `${c.cityId}|${c.normalizedName}`));
  const byCityNameNorm = new Set(
    existing.map((c) => `${c.city.name.toLowerCase()}|${c.normalizedName}`)
  );
  console.log(`[${cfg.key}-pl] existing ${cfg.country} clubs ${existing.length}`);

  const cityCache = new Map<string, { id: string; lat: number | null; lon: number | null }>();
  let citiesCreated = 0;
  let clubsCreated = 0;
  let skippedDupe = 0;
  let skippedBad = 0;

  for (const pl of clubs) {
    const cityRaw = cleanCity(String(pl.cityRaw), cfg.cityAliases);
    if (!cityRaw) {
      skippedBad++;
      continue;
    }
    const name = String(pl.name).trim();
    const normalized = normalizeClubName(name);
    if (!normalized) {
      skippedBad++;
      continue;
    }

    const city = await getOrCreateCity(cfg, cityRaw, cityCache);
    if (city.created) citiesCreated++;

    const resolvedCity = cleanCity(
      resolveCityName(cfg.country, cfg.countryCode, cityRaw) || cityRaw,
      cfg.cityAliases
    );
    const keyId = `${city.id}|${normalized}`;
    const keyName = `${resolvedCity.toLowerCase()}|${normalized}`;
    if (byCityNorm.has(keyId) || byCityNameNorm.has(keyName)) {
      skippedDupe++;
      continue;
    }

    const address = (pl.address || cityRaw).trim() || cityRaw;
    const lat =
      typeof pl.latitude === 'number' && Number.isFinite(pl.latitude) ? pl.latitude : city.lat;
    const lon =
      typeof pl.longitude === 'number' && Number.isFinite(pl.longitude) ? pl.longitude : city.lon;
    const avatar = (pl.avatarUrl || '').trim() || null;
    const phone = (pl.phone || '').trim() || null;
    const website = (pl.website || '').trim() || null;
    const courtsNumber =
      typeof pl.courtsNumber === 'number' && Number.isFinite(pl.courtsNumber)
        ? Math.max(0, Math.floor(pl.courtsNumber))
        : 0;

    const meta = {
      source: 'padellands',
      padellandsId: pl.id,
      slug: pl.slug,
      sourceUrl: pl.sourceUrl,
      description: pl.description,
    } as Prisma.InputJsonValue;

    if (DRY_RUN) {
      clubsCreated++;
      byCityNorm.add(keyId);
      byCityNameNorm.add(keyName);
      continue;
    }

    await prisma.club.create({
      data: {
        name,
        normalizedName: normalized,
        address,
        cityId: city.id,
        phone,
        website,
        avatar,
        latitude: lat,
        longitude: lon,
        courtsNumber,
        sports: ['PADEL'],
        ptMeta: meta,
      } as Prisma.ClubUncheckedCreateInput,
    });
    clubsCreated++;
    byCityNorm.add(keyId);
    byCityNameNorm.add(keyName);
  }

  let citiesRefreshed = 0;
  if (!DRY_RUN && process.env.SKIP_CITY_REFRESH !== '1') {
    citiesRefreshed = await refreshAllCitiesFromClubs();
  } else if (!DRY_RUN) {
    console.log(`[${cfg.key}-pl] skipping refreshAllCitiesFromClubs (SKIP_CITY_REFRESH=1)`);
  }

  console.log(
    `[${cfg.key}-pl] done created=${clubsCreated} citiesCreated=${citiesCreated} skippedDupe=${skippedDupe} skippedBad=${skippedBad} citiesRefreshed=${citiesRefreshed}`
  );
}

async function main(): Promise<void> {
  const key = (process.argv[2] || '').toLowerCase();
  const cfg = CONFIGS[key];
  if (!cfg) {
    console.error(`Usage: seed-padellands-europa.ts <${Object.keys(CONFIGS).join('|')}>`);
    process.exit(2);
  }
  await seedCountry(cfg);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
