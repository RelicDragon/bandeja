import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { AdminMarketCategoryService } from '../../src/services/admin/marketCategory.service';

const TEST_PREFIX = 'ms-p6-marketplace-';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testSchemaSource(): void {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  assert(/model MarketItemCategory[\s\S]*?sport\s+Sport\?/.test(schema), 'MarketItemCategory has optional sport');
}

function testPublicApiSource(): void {
  const controllerPath = join(__dirname, '../../src/controllers/marketItem.controller.ts');
  const src = readFileSync(controllerPath, 'utf8');
  assert(src.includes('req.query.sport'), 'getMarketCategories reads sport query param');
  assert(src.includes('AdminMarketCategoryService.listActive'), 'public categories use listActive filter');
  assert(src.includes('Invalid sport'), 'invalid sport query rejected');
}

async function testCategorySportFilter(): Promise<void> {
  const tennis = await AdminMarketCategoryService.create({
    name: `${TEST_PREFIX}tennis`,
    sport: Sport.TENNIS,
  });
  const generic = await AdminMarketCategoryService.create({
    name: `${TEST_PREFIX}generic`,
    sport: null,
  });

  try {
    const tennisScoped = await AdminMarketCategoryService.listActive(Sport.TENNIS);
    const tennisIds = new Set(tennisScoped.map((c) => c.id));
    assert(tennisIds.has(tennis.id), 'TENNIS filter includes tennis-specific category');
    assert(tennisIds.has(generic.id), 'TENNIS filter includes generic (null sport) category');

    const padelScoped = await AdminMarketCategoryService.listActive(Sport.PADEL);
    const padelIds = new Set(padelScoped.map((c) => c.id));
    assert(padelIds.has(generic.id), 'PADEL filter includes generic category');
    assert(!padelIds.has(tennis.id), 'PADEL filter excludes tennis-only category');

    const allActive = await AdminMarketCategoryService.listActive();
    const allIds = new Set(allActive.map((c) => c.id));
    assert(allIds.has(tennis.id), 'unfiltered list includes sport-specific category');
    assert(allIds.has(generic.id), 'unfiltered list includes generic category');
  } finally {
    await prisma.marketItemCategory.deleteMany({
      where: { id: { in: [tennis.id, generic.id] } },
    });
  }
}

async function main(): Promise<void> {
  testSchemaSource();
  testPublicApiSource();
  await testCategorySportFilter();
  console.log('multisport-phase6-marketplace: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
