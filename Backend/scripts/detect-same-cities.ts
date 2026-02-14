import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/config/database';

const SHARED_GEO_DIR = path.join(__dirname, '..', '..', 'shared', 'geo');

function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  let prevRow = Array.from({ length: bn + 1 }, (_, j) => j);
  for (let i = 1; i <= an; i++) {
    const currRow = [i];
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(prevRow[j - 1] + cost, prevRow[j] + 1, currRow[j - 1] + 1);
    }
    prevRow = currRow;
  }
  return prevRow[bn];
}

function normalize(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function sameLocation(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
  thresholdDeg = 0.01
): boolean {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return false;
  return Math.abs(lat1 - lat2) <= thresholdDeg && Math.abs(lon1 - lon2) <= thresholdDeg;
}

function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (n1 === n2) return 1;
  const maxLen = Math.max(n1.length, n2.length, 1);
  const dist = levenshtein(n1, n2);
  return 1 - dist / maxLen;
}

interface SameCityGroup {
  canonicalId: string;
  canonicalName: string;
  country: string;
  aliasIds: string[];
  aliasNames: string[];
}

async function main() {
  const cities = await prisma.city.findMany({
    where: { isCorrect: true },
    select: {
      id: true,
      name: true,
      country: true,
      latitude: true,
      longitude: true,
    },
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  });

  const byCountry = new Map<string, typeof cities>();
  for (const c of cities) {
    const list = byCountry.get(c.country) ?? [];
    list.push(c);
    byCountry.set(c.country, list);
  }

  const groups: SameCityGroup[] = [];
  const assigned = new Set<string>();

  for (const [, list] of byCountry) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (assigned.has(a.id)) continue;
      const aliases: { id: string; name: string }[] = [];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (assigned.has(b.id)) continue;
        const byCoord =
          a.latitude != null &&
          a.longitude != null &&
          b.latitude != null &&
          b.longitude != null &&
          sameLocation(a.latitude, a.longitude, b.latitude, b.longitude);
        const sim = nameSimilarity(a.name, b.name);
        if (byCoord || sim >= 0.85) {
          aliases.push({ id: b.id, name: b.name });
          assigned.add(b.id);
        }
      }
      if (aliases.length > 0) {
        assigned.add(a.id);
        groups.push({
          canonicalId: a.id,
          canonicalName: a.name,
          country: a.country,
          aliasIds: aliases.map((x) => x.id),
          aliasNames: aliases.map((x) => x.name),
        });
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalCities: cities.length,
    sameCityGroups: groups,
    byCanonicalId: {} as Record<string, { aliasIds: string[]; aliasNames: string[] }>,
  };
  for (const g of groups) {
    output.byCanonicalId[g.canonicalId] = {
      aliasIds: g.aliasIds,
      aliasNames: g.aliasNames,
    };
  }

  if (!fs.existsSync(SHARED_GEO_DIR)) {
    fs.mkdirSync(SHARED_GEO_DIR, { recursive: true });
  }

  const outPath = path.join(SHARED_GEO_DIR, 'city-same-as.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log('Same-city groups:', groups.length);
  console.log('Written to', outPath);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
