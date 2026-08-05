/**
 * Normalize legacy `.png` user avatars to the standard JPEG pipeline.
 *
 * Background: `processAvatar` always emits `_avatar.jpg` / `_avatar.tiny.jpg`
 * (hardcoded extensions), and the tiny-URL helper only matches `_avatar.jpg|jpeg`.
 * A handful of users uploaded before the JPEG pipeline existed and still have
 * `..._avatar.png` URLs — for them the tiny variant is never generated and the
 * helper returns null, so they never get a tiny avatar on the court pin.
 *
 * This script re-processes each PNG user from their stored original through the
 * same `ImageProcessor.processAvatar({ userTiny: true })` path used at upload
 * time, generating the standard original / 256 / tiny JPEG variants, updating
 * the DB, and deleting the legacy `.png` S3 objects. Mirrors the replace
 * sequence in `media.controller.ts#uploadAvatarForEntity`: persist first, then
 * delete the previous objects so a mid-failure leaves a live URL.
 *
 *   npx ts-node --transpile-only scripts/backfillNormalizeUserAvatarPng.ts
 *   npx ts-node --transpile-only scripts/backfillNormalizeUserAvatarPng.ts --dry-run
 *
 * Safe to re-run: users whose avatar no longer matches `_avatar.png` are skipped.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { ImageProcessor } from '../src/utils/imageProcessor';
import { S3Service } from '../src/services/s3.service';

const PNG_AVATAR_RE = /_avatar\.png$/i;

async function normalize(dryRun: boolean): Promise<void> {
  const users = await prisma.user.findMany({
    where: { avatar: { contains: '_avatar.png' } },
    select: { id: true, firstName: true, lastName: true, avatar: true, originalAvatar: true },
  });

  console.log(
    `Found ${users.length} user(s) with legacy .png avatars${dryRun ? ' [DRY RUN]' : ''}.`
  );

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const u of users) {
    const label = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.id;
    const previousAvatar = u.avatar;
    const previousOriginal = u.originalAvatar;

    if (!previousAvatar || !PNG_AVATAR_RE.test(previousAvatar.split('?')[0])) {
      console.log(`SKIP (not .png): ${label}`);
      skipped++;
      continue;
    }
    if (!previousOriginal) {
      console.log(`SKIP (no original to reprocess): ${label}`);
      skipped++;
      continue;
    }

    try {
      // Fetch the stored original (legacy .png) to feed the processor. Using
      // the original keeps quality loss to one generation instead of re-encoding
      // the already-cropped 256px avatar.
      const { buffer } = await S3Service.getObjectBuffer(previousOriginal);

      if (dryRun) {
        console.log(`DRY-RUN would normalize: ${label} (${u.id})`);
        skipped++;
        continue;
      }

      // Same path as a fresh user upload: original + 256 + tiny, all JPEG.
      const result = await ImageProcessor.processAvatar(
        buffer,
        `${u.id}-normalized.png`,
        { userTiny: true }
      );
      if (!result.avatarPath || !result.originalPath) {
        throw new Error('processAvatar returned missing paths');
      }

      await prisma.user.update({
        where: { id: u.id },
        data: { avatar: result.avatarPath, originalAvatar: result.originalPath },
      });
      console.log(`UPDATED: ${label} → ${result.avatarPath}`);
      processed++;

      // Now that the DB points at the new objects, delete the legacy .png ones.
      // The standard cleanup guard (`isOurCircularAvatarUrl`) would NOT match
      // the `.png` extension, so we delete explicitly and swallow per-object
      // failures (the DB is already correct; orphaned PNG is cosmetic).
      await safeDelete(previousAvatar);
      await safeDelete(previousOriginal);
    } catch (e) {
      console.error(`ERROR ${label} (${u.id}):`, e);
      errors++;
    }
  }

  console.log(
    JSON.stringify({ processed, skipped, errors, total: users.length }, null, 2)
  );
}

async function safeDelete(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const key = S3Service.extractS3Key(url);
    await S3Service.deleteFile(key);
  } catch (e) {
    console.warn(`  (cleanup) failed to delete ${url}:`, e);
  }
}

const dryRun = process.argv.includes('--dry-run');
normalize(dryRun).finally(() => prisma.$disconnect());
