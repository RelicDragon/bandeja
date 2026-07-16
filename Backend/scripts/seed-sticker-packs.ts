/**
 * Official sticker pack seed (repo assets → DB + optional S3).
 *
 * Ops:
 *   1. npm run generate:sticker-assets   # download Fluent 3D → WebP; commit binaries
 *   2. npm run seed:sticker-packs        # upload + upsert on env with AWS
 *      npm run seed:sticker-packs -- --skip-upload   # CI/local without AWS
 *
 * Idempotent: upsert by pack/sticker slug; re-upload when contentHash changes;
 * stickers removed from manifest are set isActive=false (row kept).
 */
import { seedOfficialStickerPacks, listStickerPacks } from '../src/services/stickers';
import prisma from '../src/config/database';

async function main() {
  const skipUpload = process.argv.includes('--skip-upload');
  const result = await seedOfficialStickerPacks({ skipUpload });
  const packs = await listStickerPacks();
  console.log(
    JSON.stringify(
      {
        skipUpload,
        seeded: result.packs,
        catalog: packs.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          sport: p.sport,
          stickerCount: p.stickerCount,
          cover: p.coverSticker?.staticUrl ?? null,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
