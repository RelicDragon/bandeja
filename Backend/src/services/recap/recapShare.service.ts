import crypto from 'crypto';
import { MessageType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { S3Service } from '../s3.service';
import { STORY_TTL_MS } from '../story/story.constants';
import { emitStoryNew } from '../story/story.events';
import { formatManualSegment } from '../story/story.feed.service';
import { MAX_CAPTION_LENGTH, normalizeCaption } from '../storyEngagement/storyEngagement.constants';
import type { MonthlyRecapPayload, RecapSlide } from './recap.types';
import { resolveRecapImageLanguage, type RecapImageLanguage } from './recapCopy';
import {
  RECAP_CARD_HEIGHT,
  RECAP_CARD_WIDTH,
  RECAP_SLIDE_HEIGHT,
  RECAP_SLIDE_WIDTH,
  recapSlideText,
  renderRecapSlideImage,
  renderRecapSlideThumbnail,
  renderRecapSummaryCard,
} from './recapSlideImage.renderer';

/**
 * PRD 353 — publishing a recap.
 *
 * Sharing is the *only* thing that ever creates a `UserStory` row for a recap:
 * an unshared recap lives entirely in `MonthlyRecap` and is visible to nobody
 * but its owner. The published items are ordinary `UserStoryItem`s carrying
 * server-rendered PNGs, so followers get the standard 24 h TTL, the standard
 * privacy rules and the standard likes/comments/replies for free.
 */

/** Cap so a pathological payload can never render hundreds of images. */
export const MAX_SHARED_RECAP_SLIDES = 12;

export type RecapShareResult = {
  storyId: string;
  sharedSlideKeys: string[];
  segmentKeys: string[];
  expiresAt: string;
};

/**
 * Deterministic per (user, month, slide).
 *
 * A random suffix would make every attempt write fresh objects: a share that
 * dies between the upload loop and its transaction would abandon them with no
 * row referencing them, and even a *successful* re-share would orphan the
 * previous month's images. Overwriting the same key instead makes the upload
 * idempotent — a retry costs a PUT and leaks nothing, and a re-share replaces
 * exactly the images whose story items it is about to soft-delete.
 *
 * The user id is hashed rather than embedded: these URLs are handed to
 * followers, and an object path is not a place to publish account ids.
 */
function slideFileBase(userId: string, monthKey: string, slideKey: string): string {
  const safeSlide = slideKey.replace(/[^a-zA-Z0-9]/g, '-');
  const owner = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16);
  return `recap-${owner}-${monthKey}-${safeSlide}`;
}

/**
 * Resolves the requested slide keys against the payload, preserving the
 * payload's slide order (the share sheet must never be able to reorder a reel)
 * and rejecting anything that is not a slide of this recap.
 */
export function resolveSharedSlides(
  payload: MonthlyRecapPayload,
  requestedKeys: string[],
): RecapSlide[] {
  const requested = new Set(requestedKeys);
  const known = new Set(payload.slides.map((slide) => slide.key));
  const unknown = requestedKeys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new ApiError(400, 'errors.recap.unknownSlide', true, { slideKeys: unknown });
  }
  const slides = payload.slides.filter((slide) => requested.has(slide.key));
  if (slides.length === 0) {
    throw new ApiError(400, 'errors.recap.noSlidesSelected');
  }
  if (slides.length > MAX_SHARED_RECAP_SLIDES) {
    throw new ApiError(400, 'errors.recap.tooManySlides');
  }
  return slides;
}

async function uploadSlideImage(
  userId: string,
  payload: MonthlyRecapPayload,
  slide: RecapSlide,
  language: RecapImageLanguage,
): Promise<{ mediaUrl: string; thumbnailUrl: string }> {
  const png = await renderRecapSlideImage(payload, slide, language);
  const thumbnail = await renderRecapSlideThumbnail(png);
  const base = slideFileBase(userId, payload.monthKey, slide.key);
  const [mediaUrl, thumbnailUrl] = await Promise.all([
    S3Service.uploadFile(png, `uploads/stories/originals/${base}.png`, 'image/png'),
    S3Service.uploadFile(thumbnail, `uploads/stories/thumbnails/${base}_thumb.jpg`, 'image/jpeg'),
  ]);
  return { mediaUrl, thumbnailUrl };
}

/**
 * Renders the selected slides, publishes them as one story and stamps the
 * recap as shared.
 *
 * Re-sharing the same month replaces the selection: the previous story items
 * are soft-deleted first so a follower never sees two reels of one month.
 */
export async function shareRecapToFollowers(options: {
  userId: string;
  language: string | null;
  payload: MonthlyRecapPayload;
  slideKeys: string[];
}): Promise<RecapShareResult> {
  const slides = resolveSharedSlides(options.payload, options.slideKeys);
  const language = resolveRecapImageLanguage(options.language);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STORY_TTL_MS);

  const rendered: Array<{
    slide: RecapSlide;
    mediaUrl: string;
    thumbnailUrl: string;
    caption: string | null;
  }> = [];
  for (const slide of slides) {
    const urls = await uploadSlideImage(options.userId, options.payload, slide, language);
    const text = recapSlideText(options.payload, slide, language);
    rendered.push({
      slide,
      ...urls,
      caption: normalizeCaption(`${text.eyebrow} · ${text.headline}`, MAX_CAPTION_LENGTH),
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    // A re-share supersedes the previous reel for the same month. `updateMany`
    // cannot filter on a relation, so the owning story is resolved first.
    const superseded = await tx.userStoryItem.findMany({
      where: {
        deletedAt: null,
        clientUploadId: { startsWith: recapUploadIdPrefix(options.payload.monthKey) },
        story: { userId: options.userId, expiresAt: { gt: now } },
      },
      select: { id: true },
    });
    if (superseded.length > 0) {
      await tx.userStoryItem.updateMany({
        where: { id: { in: superseded.map((item) => item.id) } },
        data: { deletedAt: now },
      });
    }

    const story = await tx.userStory.create({
      data: { userId: options.userId, expiresAt },
    });

    const maxOrder = await tx.userStoryItem.aggregate({
      where: { storyId: story.id, deletedAt: null },
      _max: { sortOrder: true },
    });
    let sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const items = [];
    for (const entry of rendered) {
      items.push(
        await tx.userStoryItem.create({
          data: {
            storyId: story.id,
            mediaUrl: entry.mediaUrl,
            thumbnailUrl: entry.thumbnailUrl,
            messageType: MessageType.IMAGE,
            width: RECAP_SLIDE_WIDTH,
            height: RECAP_SLIDE_HEIGHT,
            caption: entry.caption,
            clientUploadId: `${recapUploadIdPrefix(options.payload.monthKey)}${entry.slide.key}`,
            sortOrder: sortOrder++,
          },
        }),
      );
    }

    await tx.monthlyRecap.update({
      where: {
        userId_monthKey: { userId: options.userId, monthKey: options.payload.monthKey },
      },
      data: {
        sharedAt: now,
        sharedSlideKeys: slides.map((slide) => slide.key),
      },
    });

    return { story, items };
  });

  const segments = created.items.map((item) => formatManualSegment(item));
  for (const segment of segments) {
    await emitStoryNew(options.userId, segment);
  }

  return {
    storyId: created.story.id,
    sharedSlideKeys: slides.map((slide) => slide.key),
    segmentKeys: segments.map((segment) => segment.key),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * `clientUploadId` doubles as the recap provenance marker: `UserStoryItem` has
 * no source column, and `(storyId, clientUploadId)` is already unique, so one
 * month can never publish the same slide twice inside one story.
 */
export function recapUploadIdPrefix(monthKey: string): string {
  return `recap:${monthKey}:`;
}

export type RecapExportResult = {
  imageUrl: string;
  width: number;
  height: number;
};

/** The `recap-card` template — one summary image for the native share sheet. */
export async function exportRecapSummaryCard(options: {
  userId: string;
  language: string | null;
  payload: MonthlyRecapPayload;
}): Promise<RecapExportResult> {
  const language = resolveRecapImageLanguage(options.language);
  const png = await renderRecapSummaryCard(options.payload, language);
  const key = `uploads/recaps/cards/recap-${options.payload.monthKey}-${crypto.randomUUID()}.png`;
  const imageUrl = await S3Service.uploadFile(png, key, 'image/png');
  return { imageUrl, width: RECAP_CARD_WIDTH, height: RECAP_CARD_HEIGHT };
}
