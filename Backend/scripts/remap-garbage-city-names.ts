/**
 * Extract real city name from PL boilerplate city names, remap clubs, delete empties.
 *
 *   DB_URL=... DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/remap-garbage-city-names.ts
 *   DRY_RUN=1 ...
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

const DRY_RUN = process.env.DRY_RUN === '1';

const BOILERPLATE_RE =
  /\b(?:localidad|poblaci[oó]n|padel|instalaciones|pistas?\s+de|court|situad|encuentran|para jugar|p[uú]blicas|instalacion)\b/i;

function extractCityName(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim();

  // "Londres. 3 padel courts in London" / "Chile. Padel court in La Estrella"
  let m = s.match(/\.\s*(?:\d+\s+)?(?:Padel|Two padel|padel)\s+courts?\s+in\s+(.+)$/i);
  if (m) return cleanFinal(m[1]);
  m = s.match(/\.?\s*Padel court in\s+(.+)$/i);
  if (m) return cleanFinal(m[1]);

  // Strip leading country duplication "Chile. ..."
  s = s.replace(/^[A-Za-zÀ-ÿ\s]+\.\s+/, '');

  const patterns: RegExp[] = [
    /^(?:la\s+)?localidad\s+de\s+(.+)$/i,
    /^(?:la\s+)?poblaci[oó]n\s+de\s+(.+)$/i,
    /^(?:la\s+)?ciudad\s+de\s+(.+)$/i,
    /^este\s+club\s+de\s+(.+)$/i,
    /^su\s+club\s+de\s+(.+)$/i,
    /^su\s+centro\s+de\s+(.+)$/i,
    /^su\s+sede\s+(?:de|situada\s+en)\s+(.+)$/i,
    /^sus\s+instalaciones\s+(?:de|en|con)\s+(?:una\s+pista\s+de\s+padel\s+en\s+|2\s+pistas\s+de\s+padel\s+en\s+)?(.+)$/i,
    /^padel\s+en\s+este\s+club\s+de\s+(.+)$/i,
    /^padel\s+situad[oa]s?\s+en\s+(?:la\s+(?:ciudad|poblaci[oó]n)\s+de\s+)?(.+)$/i,
    /^padel\s+que\s+(?:est[aá]\s+situado|se\s+(?:encuentran?|ubica))\s+en\s+(?:la\s+(?:ciudad|poblaci[oó]n)\s+de\s+)?(.+)$/i,
    /^padel\s+y\s+se\s+encuentra\s+en\s+(.+)$/i,
    /^padel\s+(?:para\s+jugar|p[uú]blicas|con\s+sede)\s+(?:en\s+)?(.+)$/i,
    /^padel\s+a\s+su\s+sede\s+en\s+(.+)$/i,
    /^tenis\s+y\s+padel\s+.+\s+est[aá]\s+situado\s+en\s+(.+)$/i,
    /^.+\s+(?:con|oferece|ofrecer[aá]s?|dispondr[aá]s?|podr[aá]s?\s+jugar\s+en\s+las?)\s+\d+\s+pistas?\s+de\s+padel\s+(?:en|de\s+su\s+sede\s+en)\s+(.+)$/i,
    /^.+\s+pistas?\s+de\s+padel\s+en\s+(.+)$/i,
  ];

  for (const re of patterns) {
    m = s.match(re);
    if (m?.[1]) {
      const out = cleanFinal(m[1]);
      if (out) return out;
    }
  }

  if (BOILERPLATE_RE.test(s) || /\b(?:sede|club|centro|instalaciones)\b/i.test(s)) {
    const parts = s.split(/\s+(?:en|de)\s+/i);
    if (parts.length >= 2) {
      const out = cleanFinal(parts[parts.length - 1]);
      if (out && !BOILERPLATE_RE.test(out)) return out;
    }
  }

  return null;
}

function cleanFinal(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/g, '');
  s = s.replace(/^(?:la\s+)?(?:ciudad|localidad|poblaci[oó]n)\s+de\s+/i, '').trim();
  if (!s || s.length < 2 || s.length > 60) return null;
  if (BOILERPLATE_RE.test(s)) return null;
  if (/^(?:su|sus|este|unas?)\s/i.test(s)) return null;
  return s;
}

async function findOrCreateCity(country: string, name: string): Promise<string> {
  const existing = await prisma.city.findFirst({
    where: { country, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (DRY_RUN) return `dry:${country}:${name}`;
  const created = await prisma.city.create({
    data: {
      name,
      country,
      timezone: 'UTC',
      isCorrect: false,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

async function main(): Promise<void> {
  const cities = await prisma.city.findMany({
    where: {
      OR: [
        { name: { contains: 'localidad', mode: 'insensitive' } },
        { name: { contains: 'población', mode: 'insensitive' } },
        { name: { contains: 'poblacion', mode: 'insensitive' } },
        { name: { contains: 'padel', mode: 'insensitive' } },
        { name: { contains: 'instalaciones', mode: 'insensitive' } },
        { name: { contains: 'Padel court', mode: 'insensitive' } },
        { name: { contains: 'este club', mode: 'insensitive' } },
        { name: { contains: 'su club', mode: 'insensitive' } },
        { name: { contains: 'su sede', mode: 'insensitive' } },
        { name: { contains: 'su centro', mode: 'insensitive' } },
        { name: { contains: 'sus instalaciones', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      country: true,
      _count: { select: { clubs: true } },
    },
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  });

  console.log(`[remap] candidates=${cities.length} dryRun=${DRY_RUN}`);

  let remapped = 0;
  let deleted = 0;
  let failed = 0;

  for (const city of cities) {
    const targetName = extractCityName(city.name);
    if (!targetName) {
      failed++;
      console.log(`[fail] ${city.country} / ${city.name}`);
      continue;
    }
    if (targetName.toLowerCase() === city.name.toLowerCase()) {
      continue;
    }

    const targetId = await findOrCreateCity(city.country, targetName);
    console.log(
      `[remap] ${city.country}: "${city.name}" -> "${targetName}" clubs=${city._count.clubs}`
    );

    if (!DRY_RUN) {
      await prisma.club.updateMany({
        where: { cityId: city.id },
        data: { cityId: targetId },
      });
      const leftover = await prisma.club.count({ where: { cityId: city.id } });
      if (leftover === 0) {
        await prisma.city.delete({ where: { id: city.id } }).catch(async () => {
          await prisma.city.update({
            where: { id: city.id },
            data: { isActive: false, isCorrect: false },
          });
        });
        deleted++;
      }
    }
    remapped++;
  }

  console.log(`[remap] done remapped=${remapped} deleted=${deleted} failed=${failed}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
