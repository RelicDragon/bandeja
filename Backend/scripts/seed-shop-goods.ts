/**
 * PRD 355 — the opening shop catalogue.
 *
 * Ops:
 *   npm run seed:shop-goods              # upsert the catalogue
 *   npm run seed:shop-goods -- --dry-run # print what would change
 *
 * Without this the shop ships dark: `/shop` correctly renders "The shop opens
 * soon" until a row exists, and every `assetKey` has to match the CSS in
 * `Frontend/src/styles/collection.css` by hand. The keys below are exactly the
 * ones `Frontend/src/features/collection/collectionAssets.ts` paints — an item
 * whose key is not in that list renders as a plain avatar, which looks like a
 * bug rather than a cosmetic.
 *
 * Idempotent: upsert on the `(kind, assetKey)` unique, so re-running updates
 * prices and copy without duplicating rows or touching who owns what. Existing
 * placeholder rows (migrated with `isActive = false`) are left alone.
 */
import { GoodsKind } from '@prisma/client';
import prisma from '../src/config/database';

interface SeedItem {
  kind: GoodsKind;
  assetKey: string;
  name: string;
  description: string;
  price: number;
  sortOrder: number;
  isFeatured?: boolean;
  premiumOnly?: boolean;
}

const CATALOGUE: SeedItem[] = [
  // Frames — a gradient ring around the avatar, everywhere `PlayerAvatar` renders.
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-court', name: 'Court', description: 'The lines of a padel court, around your face.', price: 60, sortOrder: 10 },
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-mono', name: 'Mono', description: 'A quiet single-tone ring.', price: 60, sortOrder: 20 },
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-sunset', name: 'Sunset', description: 'Warm orange through to deep pink.', price: 120, sortOrder: 30 },
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-aurora', name: 'Aurora', description: 'Green and violet, slowly shifting.', price: 120, sortOrder: 40, isFeatured: true },
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-neon', name: 'Neon', description: 'Bright sky blue with a glow.', price: 150, sortOrder: 50, isFeatured: true },
  { kind: GoodsKind.PROFILE_FRAME, assetKey: 'frame-gold', name: 'Gold', description: 'For members only.', price: 200, sortOrder: 60, premiumOnly: true },

  // Name colours — everywhere a name renders; premium gold still wins.
  { kind: GoodsKind.NAME_COLOR, assetKey: 'name-ocean', name: 'Ocean', description: 'Deep blue.', price: 80, sortOrder: 10 },
  { kind: GoodsKind.NAME_COLOR, assetKey: 'name-mint', name: 'Mint', description: 'Cool green.', price: 80, sortOrder: 20 },
  { kind: GoodsKind.NAME_COLOR, assetKey: 'name-coral', name: 'Coral', description: 'Warm pink-red.', price: 80, sortOrder: 30 },
  { kind: GoodsKind.NAME_COLOR, assetKey: 'name-amber', name: 'Amber', description: 'Golden orange.', price: 100, sortOrder: 40 },
  { kind: GoodsKind.NAME_COLOR, assetKey: 'name-violet', name: 'Violet', description: 'Deep purple.', price: 100, sortOrder: 50, isFeatured: true },

  // Chat accents — the viewer's own outgoing bubbles only.
  { kind: GoodsKind.CHAT_ACCENT, assetKey: 'accent-mint', name: 'Mint bubbles', description: 'Your messages, in mint.', price: 90, sortOrder: 10 },
  { kind: GoodsKind.CHAT_ACCENT, assetKey: 'accent-sunset', name: 'Sunset bubbles', description: 'Your messages, in warm orange.', price: 90, sortOrder: 20 },
  { kind: GoodsKind.CHAT_ACCENT, assetKey: 'accent-violet', name: 'Violet bubbles', description: 'Your messages, in violet.', price: 110, sortOrder: 30 },
  { kind: GoodsKind.CHAT_ACCENT, assetKey: 'accent-neon', name: 'Neon bubbles', description: 'Your messages, in bright sky.', price: 130, sortOrder: 40, isFeatured: true },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const existing = await prisma.goods.findMany({
    where: { assetKey: { in: CATALOGUE.map((item) => item.assetKey) } },
    select: { id: true, kind: true, assetKey: true, price: true, isActive: true },
  });
  const byKey = new Map(existing.map((row) => [`${row.kind}:${row.assetKey}`, row]));

  const plan = CATALOGUE.map((item) => ({
    item,
    existing: byKey.get(`${item.kind}:${item.assetKey}`) ?? null,
  }));

  if (dryRun) {
    console.log(
      JSON.stringify(
        plan.map(({ item, existing: row }) => ({
          kind: item.kind,
          assetKey: item.assetKey,
          action: row ? 'update' : 'create',
          price: item.price,
          wasPrice: row?.price ?? null,
        })),
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let updated = 0;
  for (const { item, existing: row } of plan) {
    await prisma.goods.upsert({
      where: { kind_assetKey: { kind: item.kind, assetKey: item.assetKey } },
      create: {
        kind: item.kind,
        assetKey: item.assetKey,
        name: item.name,
        description: item.description,
        price: item.price,
        sortOrder: item.sortOrder,
        isActive: true,
        isFeatured: item.isFeatured ?? false,
        premiumOnly: item.premiumOnly ?? false,
      },
      update: {
        name: item.name,
        description: item.description,
        price: item.price,
        sortOrder: item.sortOrder,
        isActive: true,
        isFeatured: item.isFeatured ?? false,
        premiumOnly: item.premiumOnly ?? false,
      },
    });
    if (row) updated += 1;
    else created += 1;
  }

  const total = await prisma.goods.count({ where: { isActive: true } });
  console.log(`[seed:shop-goods] created=${created} updated=${updated} activeTotal=${total}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[seed:shop-goods] failed', error);
  await prisma.$disconnect();
  process.exit(1);
});
