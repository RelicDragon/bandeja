import fs from 'fs/promises';
import path from 'path';
import prisma from '../../config/database';
import { S3Service } from '../s3.service';
import {
  ANIMATED_ASSET_FILENAME,
  OFFICIAL_PACK_MANIFESTS,
  STATIC_ASSET_FILENAME,
  type PackManifest,
} from './stickerPackManifest';
import {
  contentHashOf,
  inspectWebp,
  publicUrlForKey,
  stickerAnimatedS3Key,
  stickerStaticS3Key,
  uploadStickerWebpAtKey,
} from './stickerAsset.service';

const ASSETS_ROOT = path.join(__dirname, '../../../assets/stickers');

export type SeedStickerPacksOptions = {
  /** When true, write CloudFront URLs without calling S3 (CI / local). */
  skipUpload?: boolean;
};

export type SeedStickerPacksResult = {
  packs: Array<{
    slug: string;
    id: string;
    stickerCount: number;
    uploaded: number;
    deactivated: number;
  }>;
};

async function readAssetOrThrow(packSlug: string, filename: string): Promise<Buffer> {
  const full = path.join(ASSETS_ROOT, packSlug, filename);
  try {
    return await fs.readFile(full);
  } catch {
    throw new Error(
      `Missing sticker asset ${packSlug}/${filename}. Run: npm run generate:sticker-assets`
    );
  }
}

function combinedContentHash(staticBuffer: Buffer, animatedBuffer: Buffer | null): string {
  if (!animatedBuffer) return contentHashOf(staticBuffer);
  return contentHashOf(Buffer.concat([staticBuffer, animatedBuffer]));
}

async function resolveUrls(params: {
  packSlug: string;
  stickerSlug: string;
  staticBuffer: Buffer;
  animatedBuffer: Buffer | null;
  skipUpload: boolean;
  prevContentHash: string | null;
  prevStaticUrl: string | null;
  prevAnimatedUrl: string | null;
  contentHash: string;
}): Promise<{ staticUrl: string; animatedUrl: string | null; uploaded: number }> {
  const staticKey = stickerStaticS3Key(params.packSlug, params.stickerSlug, params.contentHash);
  const animatedKey = params.animatedBuffer
    ? stickerAnimatedS3Key(params.packSlug, params.stickerSlug, params.contentHash)
    : null;
  const hashChanged = params.prevContentHash !== params.contentHash;
  const expectedStatic = publicUrlForKey(staticKey);
  const expectedAnimated = animatedKey ? publicUrlForKey(animatedKey) : null;

  if (params.skipUpload) {
    if (!hashChanged && params.prevStaticUrl) {
      return {
        staticUrl: params.prevStaticUrl,
        animatedUrl: params.animatedBuffer
          ? (params.prevAnimatedUrl ?? expectedAnimated)
          : null,
        uploaded: 0,
      };
    }
    return { staticUrl: expectedStatic, animatedUrl: expectedAnimated, uploaded: 0 };
  }

  let uploaded = 0;
  const unchanged =
    !hashChanged && params.prevContentHash != null && Boolean(params.prevStaticUrl);

  if (unchanged) {
    const [staticMissing, animMissing] = await Promise.all([
      S3Service.objectExists(staticKey).then((ok) => !ok),
      animatedKey
        ? S3Service.objectExists(animatedKey).then((ok) => !ok)
        : Promise.resolve(false),
    ]);

    if (!staticMissing && !animMissing) {
      // Prefer canonical hashed keys (busts CloudFront immutable cache on old paths).
      return {
        staticUrl: expectedStatic,
        animatedUrl: expectedAnimated,
        uploaded: 0,
      };
    }

    if (staticMissing) {
      await uploadStickerWebpAtKey({ key: staticKey, imageBuffer: params.staticBuffer });
      uploaded++;
    }
    if (animMissing && params.animatedBuffer && animatedKey) {
      await uploadStickerWebpAtKey({ key: animatedKey, imageBuffer: params.animatedBuffer });
      uploaded++;
    }

    return {
      staticUrl: expectedStatic,
      animatedUrl: expectedAnimated,
      uploaded,
    };
  }

  await uploadStickerWebpAtKey({ key: staticKey, imageBuffer: params.staticBuffer });
  uploaded++;
  if (params.animatedBuffer && animatedKey) {
    await uploadStickerWebpAtKey({ key: animatedKey, imageBuffer: params.animatedBuffer });
    uploaded++;
  }

  return { staticUrl: expectedStatic, animatedUrl: expectedAnimated, uploaded };
}

async function seedOnePack(
  pack: PackManifest,
  skipUpload: boolean
): Promise<{ id: string; stickerCount: number; uploaded: number; deactivated: number }> {
  const packRow = await prisma.stickerPack.upsert({
    where: { slug: pack.slug },
    create: {
      slug: pack.slug,
      title: pack.title,
      sport: pack.sport,
      isOfficial: true,
      isActive: true,
      sortOrder: pack.sortOrder,
    },
    update: {
      title: pack.title,
      sport: pack.sport,
      isOfficial: true,
      isActive: true,
      sortOrder: pack.sortOrder,
    },
  });

  let uploaded = 0;
  const seenSlugs = new Set<string>();
  let coverStickerId: string | null = null;

  const existingRows = await prisma.sticker.findMany({
    where: { packId: packRow.id },
    select: {
      id: true,
      slug: true,
      title: true,
      contentHash: true,
      staticUrl: true,
      animatedUrl: true,
    },
  });
  const slugTaken = new Set(existingRows.map((r) => r.slug));

  for (const item of pack.stickers) {
    if (slugTaken.has(item.slug)) continue;
    const legacy = existingRows.find(
      (r) =>
        r.slug !== item.slug &&
        (r.title ?? '').toLowerCase() === item.title.toLowerCase() &&
        !pack.stickers.some((m) => m.slug === r.slug)
    );
    if (!legacy) continue;
    await prisma.sticker.update({
      where: { id: legacy.id },
      data: { slug: item.slug },
    });
    slugTaken.add(item.slug);
    legacy.slug = item.slug;
  }

  for (const item of pack.stickers) {
    if (!slugTaken.has(item.slug)) continue;
    const dupes = existingRows.filter(
      (r) =>
        r.slug !== item.slug &&
        (r.title ?? '').toLowerCase() === item.title.toLowerCase()
    );
    if (dupes.length === 0) continue;
    await prisma.sticker.updateMany({
      where: { id: { in: dupes.map((d) => d.id) } },
      data: { isActive: false },
    });
  }

  // Parallel disk reads — seed wall time is mostly I/O + optional S3.
  const prepared = await Promise.all(
    pack.stickers.map(async (item, i) => {
      const staticBuffer = await readAssetOrThrow(pack.slug, STATIC_ASSET_FILENAME(item.slug));
      const animatedBuffer = item.animated
        ? await readAssetOrThrow(pack.slug, ANIMATED_ASSET_FILENAME(item.slug))
        : null;
      const inspected = await inspectWebp(staticBuffer);
      const contentHash = combinedContentHash(staticBuffer, animatedBuffer);
      return { item, i, staticBuffer, animatedBuffer, inspected, contentHash };
    })
  );

  for (const row of prepared) {
    const { item, i, staticBuffer, animatedBuffer, inspected, contentHash } = row;
    seenSlugs.add(item.slug);

    const existing = existingRows.find((r) => r.slug === item.slug) ?? null;

    const urls = await resolveUrls({
      packSlug: pack.slug,
      stickerSlug: item.slug,
      staticBuffer,
      animatedBuffer,
      skipUpload,
      prevContentHash: existing?.contentHash ?? null,
      prevStaticUrl: existing?.staticUrl ?? null,
      prevAnimatedUrl: existing?.animatedUrl ?? null,
      contentHash,
    });
    uploaded += urls.uploaded;

    const sticker = await prisma.sticker.upsert({
      where: { packId_slug: { packId: packRow.id, slug: item.slug } },
      create: {
        packId: packRow.id,
        slug: item.slug,
        emoji: item.emoji,
        title: item.title,
        staticUrl: urls.staticUrl,
        animatedUrl: urls.animatedUrl,
        width: inspected.width,
        height: inspected.height,
        contentHash,
        sortOrder: i,
        isActive: true,
      },
      update: {
        emoji: item.emoji,
        title: item.title,
        staticUrl: urls.staticUrl,
        animatedUrl: urls.animatedUrl,
        width: inspected.width,
        height: inspected.height,
        contentHash,
        sortOrder: i,
        isActive: true,
      },
    });

    if (item.slug === pack.coverSlug) coverStickerId = sticker.id;
    if (!coverStickerId && i === 0) coverStickerId = sticker.id;
  }

  const stale = await prisma.sticker.findMany({
    where: { packId: packRow.id, slug: { notIn: [...seenSlugs] }, isActive: true },
    select: { id: true },
  });
  let deactivated = 0;
  if (stale.length > 0) {
    const res = await prisma.sticker.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { isActive: false },
    });
    deactivated = res.count;
  }

  if (coverStickerId) {
    await prisma.stickerPack.update({
      where: { id: packRow.id },
      data: { coverStickerId },
    });
  }

  return {
    id: packRow.id,
    stickerCount: pack.stickers.length,
    uploaded,
    deactivated,
  };
}

/**
 * Idempotent official pack seed from repo assets.
 * Upserts by pack/sticker slug; re-uploads when contentHash changes; missing → isActive=false.
 */
export async function seedOfficialStickerPacks(
  opts: SeedStickerPacksOptions = {}
): Promise<SeedStickerPacksResult> {
  const skipUpload = opts.skipUpload === true;
  const packs: SeedStickerPacksResult['packs'] = [];

  for (const pack of OFFICIAL_PACK_MANIFESTS) {
    const result = await seedOnePack(pack, skipUpload);
    packs.push({
      slug: pack.slug,
      id: result.id,
      stickerCount: result.stickerCount,
      uploaded: result.uploaded,
      deactivated: result.deactivated,
    });
  }

  return { packs };
}
