import assert from 'node:assert/strict';
import { decidePinSlot, isValidShowcaseSlot } from '@bandeja/shared/achievements';
import { ApiError } from '../../utils/ApiError';
import {
  pinAchievementInstance,
  unpinAchievementInstance,
} from './achievementPin.service';

{
  assert.equal(isValidShowcaseSlot(0), true);
  assert.equal(isValidShowcaseSlot(2), true);
  assert.equal(isValidShowcaseSlot(3), false);
  assert.equal(isValidShowcaseSlot(-1), false);
}

{
  const empty = decidePinSlot({ existingPins: [], achievementId: 'a1' });
  assert.deepEqual(empty, { type: 'insert', slot: 0 });
}

{
  const already = decidePinSlot({
    existingPins: [{ slot: 1, achievementId: 'a1' }],
    achievementId: 'a1',
  });
  assert.deepEqual(already, { type: 'already', slot: 1 });
}

{
  const next = decidePinSlot({
    existingPins: [
      { slot: 0, achievementId: 'a1' },
      { slot: 2, achievementId: 'a3' },
    ],
    achievementId: 'a2',
  });
  assert.deepEqual(next, { type: 'insert', slot: 1 });
}

{
  const full = decidePinSlot({
    existingPins: [
      { slot: 0, achievementId: 'a1' },
      { slot: 1, achievementId: 'a2' },
      { slot: 2, achievementId: 'a3' },
    ],
    achievementId: 'a4',
  });
  assert.deepEqual(full, { type: 'full' });
}

type AchRow = {
  id: string;
  userId: string;
  isActive: boolean;
  definitionId: string;
};
type PinRow = { userId: string; slot: number; achievementId: string };

function makeFakeDb(seed: { achievements: AchRow[]; pins: PinRow[] }) {
  const achievements = [...seed.achievements];
  const pins = [...seed.pins];

  const db = {
    userAchievement: {
      findFirst: async (args: {
        where: { id: string; userId: string; isActive: boolean };
        select: { id: true; definitionId?: true };
      }) => {
        const row = achievements.find(
          (a) =>
            a.id === args.where.id &&
            a.userId === args.where.userId &&
            a.isActive === args.where.isActive,
        );
        return row ? { id: row.id, definitionId: row.definitionId } : null;
      },
    },
    userAchievementPin: {
      findMany: async (args: {
        where: { userId: string };
        orderBy?: { slot: 'asc' };
        include?: { achievement: { select: { id: true; isActive: true; definitionId: true } } };
      }) => {
        const rows = pins
          .filter((p) => p.userId === args.where.userId)
          .slice()
          .sort((a, b) => a.slot - b.slot);
        if (args.include?.achievement) {
          return rows.map((p) => {
            const achievement = achievements.find((a) => a.id === p.achievementId) ?? null;
            return {
              ...p,
              achievement: achievement
                ? {
                    id: achievement.id,
                    isActive: achievement.isActive,
                    definitionId: achievement.definitionId,
                  }
                : null,
            };
          });
        }
        return rows.map((p) => ({ ...p }));
      },
      findFirst: async (args: {
        where: { userId: string; achievementId: string };
        select: { slot: true };
      }) => {
        const row = pins.find(
          (p) =>
            p.userId === args.where.userId && p.achievementId === args.where.achievementId,
        );
        return row ? { slot: row.slot } : null;
      },
      create: async (args: { data: PinRow }) => {
        pins.push({ ...args.data });
        return args.data;
      },
      delete: async (args: { where: { userId_slot: { userId: string; slot: number } } }) => {
        const idx = pins.findIndex(
          (p) =>
            p.userId === args.where.userId_slot.userId &&
            p.slot === args.where.userId_slot.slot,
        );
        if (idx < 0) throw new Error('pin missing');
        const [removed] = pins.splice(idx, 1);
        return removed;
      },
      deleteMany: async (args: {
        where: { userId: string; achievementId: { in: string[] } };
      }) => {
        const set = new Set(args.where.achievementId.in);
        let count = 0;
        for (let i = pins.length - 1; i >= 0; i -= 1) {
          if (pins[i].userId === args.where.userId && set.has(pins[i].achievementId)) {
            pins.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    _pins: pins,
  };

  return db;
}

async function runAsyncPinTests() {
  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_first_win' },
      ],
      pins: [],
    });
    const result = await pinAchievementInstance({
      userId: 'u1',
      achievementId: 'ach-1',
      tx: db as never,
    });
    assert.deepEqual(result, {
      slot: 0,
      achievementId: 'ach-1',
      alreadyPinned: false,
    });
    assert.equal(db._pins.length, 1);
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_first_win' },
      ],
      pins: [{ userId: 'u1', slot: 0, achievementId: 'ach-1' }],
    });
    const result = await pinAchievementInstance({
      userId: 'u1',
      achievementId: 'ach-1',
      tx: db as never,
    });
    assert.deepEqual(result, {
      slot: 0,
      achievementId: 'ach-1',
      alreadyPinned: true,
    });
    assert.equal(db._pins.length, 1);
  }

  {
    // Ghost (inactive) pin must be purged and not block a new pin.
    const db = makeFakeDb({
      achievements: [
        { id: 'ghost', userId: 'u1', isActive: false, definitionId: 'habit_first_win' },
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_games_10' },
        { id: 'ach-2', userId: 'u1', isActive: true, definitionId: 'habit_streak_4' },
        { id: 'ach-3', userId: 'u1', isActive: true, definitionId: 'habit_streak_8' },
      ],
      pins: [
        { userId: 'u1', slot: 0, achievementId: 'ghost' },
        { userId: 'u1', slot: 1, achievementId: 'ach-1' },
        { userId: 'u1', slot: 2, achievementId: 'ach-2' },
      ],
    });
    const result = await pinAchievementInstance({
      userId: 'u1',
      achievementId: 'ach-3',
      tx: db as never,
    });
    assert.equal(result.slot, 0);
    assert.equal(result.alreadyPinned, false);
    assert.ok(!db._pins.some((p) => p.achievementId === 'ghost'));
    assert.ok(db._pins.some((p) => p.achievementId === 'ach-3' && p.slot === 0));
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_first_win' },
        { id: 'ach-2', userId: 'u1', isActive: true, definitionId: 'habit_games_10' },
        { id: 'ach-3', userId: 'u1', isActive: true, definitionId: 'habit_streak_4' },
        { id: 'ach-4', userId: 'u1', isActive: true, definitionId: 'habit_streak_8' },
      ],
      pins: [
        { userId: 'u1', slot: 0, achievementId: 'ach-1' },
        { userId: 'u1', slot: 1, achievementId: 'ach-2' },
        { userId: 'u1', slot: 2, achievementId: 'ach-3' },
      ],
    });
    await assert.rejects(
      () =>
        pinAchievementInstance({
          userId: 'u1',
          achievementId: 'ach-4',
          tx: db as never,
        }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.statusCode === 409 &&
        err.data?.code === 'trophy.pinsFull',
    );
    assert.equal(db._pins.length, 3);
    assert.ok(db._pins.every((p) => p.achievementId !== 'ach-4'));
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-other', userId: 'u2', isActive: true, definitionId: 'habit_first_win' },
      ],
      pins: [],
    });
    await assert.rejects(
      () =>
        pinAchievementInstance({
          userId: 'u1',
          achievementId: 'ach-other',
          tx: db as never,
        }),
      (err: unknown) => err instanceof ApiError && err.statusCode === 404,
    );
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: false, definitionId: 'habit_first_win' },
      ],
      pins: [],
    });
    await assert.rejects(
      () =>
        pinAchievementInstance({
          userId: 'u1',
          achievementId: 'ach-1',
          tx: db as never,
        }),
      (err: unknown) => err instanceof ApiError && err.statusCode === 404,
    );
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_first_win' },
      ],
      pins: [{ userId: 'u1', slot: 1, achievementId: 'ach-1' }],
    });
    const result = await unpinAchievementInstance({
      userId: 'u1',
      achievementId: 'ach-1',
      tx: db as never,
    });
    assert.deepEqual(result, { removed: true, achievementId: 'ach-1' });
    assert.equal(db._pins.length, 0);
  }

  {
    const db = makeFakeDb({
      achievements: [
        { id: 'ach-1', userId: 'u1', isActive: true, definitionId: 'habit_first_win' },
      ],
      pins: [],
    });
    const result = await unpinAchievementInstance({
      userId: 'u1',
      achievementId: 'ach-1',
      tx: db as never,
    });
    assert.deepEqual(result, { removed: false, achievementId: 'ach-1' });
  }
}

void runAsyncPinTests().then(() => {
  console.log('achievementPin.service.test.ts: ok');
});
