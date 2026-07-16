/**
 * Hard acceptance checks for #305 official sticker pack seed.
 * Usage: cd Backend && npx ts-node -r dotenv/config --transpile-only scripts/verify-sticker-seed-305.ts
 */
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';
import {
  getStickerById,
  getStickerPackById,
  listStickerPacks,
  seedOfficialStickerPacks,
  stickerStaticS3Key,
  STICKER_STORAGE_PREFIX,
  OFFICIAL_PACK_MANIFESTS,
} from '../src/services/stickers';
import prisma from '../src/config/database';

const ASSETS_ROOT = path.join(__dirname, '../assets/stickers');

async function assertAssetsOnDisk() {
  for (const pack of OFFICIAL_PACK_MANIFESTS) {
    for (const s of pack.stickers) {
      const staticPath = path.join(ASSETS_ROOT, pack.slug, `${s.slug}.webp`);
      await fs.access(staticPath);
      if (s.animated) {
        await fs.access(path.join(ASSETS_ROOT, pack.slug, `${s.slug}.anim.webp`));
      }
    }
  }
  console.log('PASS assets on disk');
}

async function assertAssetsTrackedInGit() {
  const { spawnSync } = await import('node:child_process');
  const repoRoot = path.join(__dirname, '../..');
  const listed = spawnSync('git', ['ls-files', 'Backend/assets/stickers'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.strictEqual(listed.status, 0, listed.stderr);
  const files = listed.stdout.split('\n').filter(Boolean);
  assert.ok(files.length >= 26, `expected ≥26 tracked assets, got ${files.length}`);
  console.log(`PASS assets tracked in git (${files.length})`);
}

async function assertCatalog() {
  const before = await prisma.stickerPack.count();
  const packs = await listStickerPacks();
  const after = await prisma.stickerPack.count();
  assert.strictEqual(before, after, 'list must not create packs');

  const reactions = packs.find((p) => p.slug === 'reactions');
  const padel = packs.find((p) => p.slug === 'padel');
  assert.ok(reactions);
  assert.ok(padel);
  assert.strictEqual(reactions!.sport, null);
  assert.strictEqual(padel!.sport, 'PADEL');
  assert.strictEqual(reactions!.stickerCount, 8);
  assert.strictEqual(padel!.stickerCount, 14);

  for (const p of [reactions!, padel!]) {
    assert.ok(p.coverSticker?.staticUrl.includes('/uploads/stickers/packs/'));
    const head = await fetch(p.coverSticker!.staticUrl, { method: 'HEAD' });
    assert.strictEqual(head.status, 200, `cover ${p.slug} HTTP ${head.status}`);
  }

  const detail = await getStickerPackById(padel!.id);
  assert.strictEqual(detail.stickers.length, 14);
  assert.ok(detail.stickers.every((s) => s.isActive));

  console.log('PASS catalog sports/counts/CF');
}

async function assertInactiveHydrate() {
  const inactive = await prisma.sticker.findFirst({
    where: { isActive: false },
    select: { id: true },
  });
  assert.ok(inactive, 'need inactive row');
  const dto = await getStickerById(inactive!.id);
  assert.strictEqual(dto.isActive, false);
  console.log('PASS getStickerById inactive');
}

async function assertDeactivateMissing() {
  const reactions = await prisma.stickerPack.findUniqueOrThrow({ where: { slug: 'reactions' } });
  const probe = await prisma.sticker.create({
    data: {
      packId: reactions.id,
      slug: `__verify_probe_${Date.now()}`,
      emoji: '❓',
      title: 'Probe',
      staticUrl: 'https://example.com/x.webp',
      contentHash: 'probe',
      sortOrder: 99,
      isActive: true,
    },
  });
  await seedOfficialStickerPacks({ skipUpload: true });
  const after = await prisma.sticker.findUniqueOrThrow({ where: { id: probe.id } });
  assert.strictEqual(after.isActive, false);
  await prisma.sticker.delete({ where: { id: probe.id } });
  console.log('PASS deactivate missing slug');
}

async function assertIdempotentSkipUpload() {
  const t0 = Date.now();
  const a = await seedOfficialStickerPacks({ skipUpload: true });
  const t1 = Date.now();
  const b = await seedOfficialStickerPacks({ skipUpload: true });
  const t2 = Date.now();
  assert.ok(a.packs.every((p) => p.uploaded === 0));
  assert.ok(b.packs.every((p) => p.uploaded === 0 && p.deactivated === 0));
  const urls1 = await prisma.sticker.findMany({
    where: { isActive: true },
    select: { slug: true, staticUrl: true, contentHash: true },
    orderBy: { slug: 'asc' },
  });
  const urls2 = await prisma.sticker.findMany({
    where: { isActive: true },
    select: { slug: true, staticUrl: true, contentHash: true },
    orderBy: { slug: 'asc' },
  });
  assert.deepStrictEqual(urls1, urls2);
  console.log(
    `PASS idempotent skip-upload (${t1 - t0}ms then ${t2 - t1}ms)`
  );
}

async function assertKeys() {
  assert.strictEqual(STICKER_STORAGE_PREFIX, 'uploads/stickers/');
  assert.strictEqual(
    stickerStaticS3Key('reactions', 'ball'),
    'uploads/stickers/packs/reactions/ball.webp'
  );
  console.log('PASS s3 key shape');
}

async function assertNoRuntimeSvgInSeed() {
  const seedSrc = await fs.readFile(
    path.join(__dirname, '../src/services/stickers/stickerSeed.service.ts'),
    'utf8'
  );
  assert.ok(!seedSrc.includes('renderPlaceholder'));
  assert.ok(!seedSrc.includes('<svg'));
  assert.ok(!seedSrc.includes('ensureOfficial'));
  const catalogSrc = await fs.readFile(
    path.join(__dirname, '../src/services/stickers/stickerCatalog.service.ts'),
    'utf8'
  );
  assert.ok(!catalogSrc.includes('ensureOfficial'));
  assert.ok(!catalogSrc.includes('renderPlaceholder'));
  console.log('PASS seed/catalog no SVG ensure');
}

async function main() {
  await assertKeys();
  await assertAssetsOnDisk();
  await assertAssetsTrackedInGit();
  await assertNoRuntimeSvgInSeed();
  await assertCatalog();
  await assertInactiveHydrate();
  await assertDeactivateMissing();
  await assertIdempotentSkipUpload();
  console.log('ALL #305 CHECKS PASSED');
}

main()
  .catch((err) => {
    console.error('FAIL', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
