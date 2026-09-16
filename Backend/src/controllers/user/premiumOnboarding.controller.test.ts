import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { getPremiumOnboarding, completePremiumOnboarding } from './premiumOnboarding.controller';

async function main() {
  const completedAt = new Date('2026-09-16T16:00:00Z');
  let premium = true;
  let completed: Date | null = null;
  let mainTheme = 'classic';
  const originalFind = prisma.user.findUnique;
  const originalUpdate = prisma.user.updateMany;
  prisma.user.findUnique = (async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
    assert.equal(where.id, 'signed-in-user');
    return Object.fromEntries(Object.entries({ isPremium: premium, premiumOnboardingCompletedAt: completed, mainTheme })
      .filter(([key]) => select[key]));
  }) as unknown as typeof prisma.user.findUnique;
  prisma.user.updateMany = (async ({ where, data }: { where: { id: string; isPremium: boolean; premiumOnboardingCompletedAt: null }; data: { premiumOnboardingCompletedAt: Date; mainTheme?: string } }) => {
    assert.deepEqual(where, { id: 'signed-in-user', isPremium: true, premiumOnboardingCompletedAt: null });
    const count = premium && !completed ? 1 : 0;
    if (count) {
      completed = completedAt;
      if (data.mainTheme) mainTheme = data.mainTheme;
    }
    return { count };
  }) as unknown as typeof prisma.user.updateMany;
  type Payload = { success: boolean; data: { isPremium: boolean; premiumOnboardingCompletedAt: Date | null; mainTheme: string } };
  const call = (handler: typeof getPremiumOnboarding) => new Promise<Payload>((resolve, reject) => {
    handler(
      { userId: 'signed-in-user', body: { userId: 'someone-else' } } as unknown as Request,
      { json: resolve } as unknown as Response,
      reject,
    );
  });
  try {
    assert.equal((await call(getPremiumOnboarding)).data.premiumOnboardingCompletedAt, null);
    const firstCompletion = await call(completePremiumOnboarding);
    assert.equal(firstCompletion.data.premiumOnboardingCompletedAt, completedAt);
    assert.equal(firstCompletion.data.mainTheme, 'premium');
    assert.equal(mainTheme, 'premium', 'First completion must save the Premium theme');
    mainTheme = 'classic';
    const replay = await call(completePremiumOnboarding);
    assert.equal(replay.data.premiumOnboardingCompletedAt, completedAt);
    assert.equal(replay.data.mainTheme, 'classic');
    assert.equal(mainTheme, 'classic', 'Repeated completion must preserve a later theme choice');
    premium = false;
    completed = null;
    assert.equal((await call(getPremiumOnboarding)).data.isPremium, false);
    await assert.rejects(call(completePremiumOnboarding), (error: unknown) => error instanceof ApiError && error.statusCode === 403);
    assert.equal(completed, null);
    assert.equal(mainTheme, 'classic');
    console.log('Premium onboarding: account scope, completion, replay, membership gate passed');
  } finally {
    prisma.user.findUnique = originalFind;
    prisma.user.updateMany = originalUpdate;
    await prisma.$disconnect();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
