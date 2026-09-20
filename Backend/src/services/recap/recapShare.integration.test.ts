import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { S3Service } from '../s3.service';
import { STORY_TTL_MS } from '../story/story.constants';
import { MONTHLY_RECAP_PAYLOAD_VERSION, type MonthlyRecapPayload } from './recap.types';
import { resolveSharedSlides, shareRecapToFollowers } from './recapShare.service';

/**
 * PRD 353 — sharing a recap.
 *
 * Safe against `padelpulse_dev`: it creates one throwaway user, does its work
 * and deletes the user again (every recap/story row cascades off it). `sharp`
 * really renders, but `S3Service.uploadFile` is stubbed so the test never talks
 * to AWS — the URLs it returns are shaped exactly like CloudFront keys so the
 * story media validator would accept them.
 */

const MONTH_KEY = '2026-09';

function payload(): MonthlyRecapPayload {
  return {
    version: MONTHLY_RECAP_PAYLOAD_VERSION,
    monthKey: MONTH_KEY,
    monthStart: '2026-09-01T00:00:00.000Z',
    daysInMonth: 30,
    weekdayOffset: 1,
    variant: 'FULL',
    sports: [
      {
        sport: 'PADEL',
        games: 14,
        wins: 9,
        losses: 5,
        ties: 0,
        winRatePct: 64,
        playedDays: [2, 5, 9, 12, 19, 26],
        level: { before: 3.9, after: 4.1, delta: 0.2, points: [3.9, 4.0, 4.1] },
        partner: {
          userId: 'partner-id',
          firstName: 'Ana',
          lastName: null,
          avatar: null,
          wins: 5,
          games: 7,
        },
        club: { clubId: 'club-id', name: 'Padel Centar', avatar: null, games: 8 },
      },
    ],
    totals: {
      games: 14,
      wins: 9,
      losses: 5,
      ties: 0,
      winRatePct: 64,
      playedDays: [2, 5, 9, 12, 19, 26],
      clubs: 2,
      partners: 4,
    },
    streak: { weeks: 4, best: 6 },
    owner: { firstName: 'Mia', lastName: 'Ortiz', avatar: null, isPremium: false },
    slides: [
      { key: 'cover', kind: 'COVER', sport: null, sensitive: false },
      { key: 'games:PADEL', kind: 'GAMES', sport: 'PADEL', sensitive: false },
      { key: 'wins:PADEL', kind: 'WINS', sport: 'PADEL', sensitive: false },
      { key: 'level:PADEL', kind: 'LEVEL', sport: 'PADEL', sensitive: true },
      { key: 'partner:PADEL', kind: 'PARTNER', sport: 'PADEL', sensitive: false },
      { key: 'club:PADEL', kind: 'CLUB', sport: 'PADEL', sensitive: false },
      { key: 'streak', kind: 'STREAK', sport: null, sensitive: false },
      { key: 'outro', kind: 'OUTRO', sport: null, sensitive: false },
    ],
  };
}

// --- pure selection rules (no DB) -----------------------------------------

{
  const p = payload();
  assert.deepEqual(
    resolveSharedSlides(p, ['outro', 'cover']).map((slide) => slide.key),
    ['cover', 'outro'],
    'the payload order wins; the share sheet cannot reorder a reel',
  );
  assert.throws(
    () => resolveSharedSlides(p, ['not-a-slide']),
    /errors\.recap\.unknownSlide/,
  );
  assert.throws(() => resolveSharedSlides(p, []), /errors\.recap\.noSlidesSelected/);
}

async function main(): Promise<void> {
  const uploadOriginal = S3Service.uploadFile;
  const uploads: string[] = [];
  S3Service.uploadFile = async (_buffer: Buffer, key: string) => {
    uploads.push(key);
    return `https://cdn.example.test/${key}`;
  };

  const user = await prisma.user.create({
    data: {
      firstName: 'Recap',
      lastName: 'ShareTest',
      language: 'en',
    },
    select: { id: true },
  });

  try {
    const stored = payload();
    await prisma.monthlyRecap.create({
      data: {
        userId: user.id,
        monthKey: MONTH_KEY,
        payload: stored as unknown as Prisma.InputJsonValue,
      },
    });

    // An unshared recap never creates a story row.
    assert.equal(
      await prisma.userStory.count({ where: { userId: user.id } }),
      0,
      'generating a recap must not publish anything',
    );

    const selected = ['cover', 'games:PADEL', 'wins:PADEL', 'partner:PADEL', 'outro'];
    const before = Date.now();
    const result = await shareRecapToFollowers({
      userId: user.id,
      language: 'en',
      payload: stored,
      slideKeys: selected,
    });
    const after = Date.now();

    assert.deepEqual(result.sharedSlideKeys, selected);
    assert.equal(result.segmentKeys.length, selected.length);

    const stories = await prisma.userStory.findMany({
      where: { userId: user.id },
      include: { items: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    assert.equal(stories.length, 1, 'one story per share');
    assert.equal(
      stories[0].items.length,
      selected.length,
      'the segment count matches the selected slides exactly',
    );
    assert.deepEqual(
      stories[0].items.map((item) => item.clientUploadId),
      selected.map((key) => `recap:${MONTH_KEY}:${key}`),
      'each item is tagged with its slide so a re-share can supersede it',
    );

    const expiresAt = stories[0].expiresAt.getTime();
    assert.ok(
      expiresAt >= before + STORY_TTL_MS - 5_000 && expiresAt <= after + STORY_TTL_MS + 5_000,
      'the standard 24 h story TTL is applied',
    );

    const row = await prisma.monthlyRecap.findUniqueOrThrow({
      where: { userId_monthKey: { userId: user.id, monthKey: MONTH_KEY } },
      select: { sharedAt: true, sharedSlideKeys: true },
    });
    assert.ok(row.sharedAt, 'the recap is stamped as shared');
    assert.deepEqual(row.sharedSlideKeys, selected);

    assert.equal(uploads.length, selected.length * 2, 'one PNG plus one thumbnail per slide');
    assert.ok(
      uploads.every((key) => key.startsWith('uploads/stories/')),
      'recap slides live under the story media prefix so the validator accepts them',
    );

    // Re-sharing a narrower selection supersedes the previous reel.
    const reshared = await shareRecapToFollowers({
      userId: user.id,
      language: 'en',
      payload: stored,
      slideKeys: ['cover', 'outro'],
    });
    assert.notEqual(reshared.storyId, stories[0].id);
    const liveItems = await prisma.userStoryItem.count({
      where: { deletedAt: null, story: { userId: user.id } },
    });
    assert.equal(liveItems, 2, 'the superseded reel is soft-deleted');
  } finally {
    S3Service.uploadFile = uploadOriginal;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('✅ recapShare integration tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
