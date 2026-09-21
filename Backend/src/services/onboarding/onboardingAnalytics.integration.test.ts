import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import prisma from '../../config/database';
import { patchOnboardingStep } from '../../controllers/onboarding.controller';
import type { AuthRequest } from '../../middleware/auth';
import { completeOnboarding } from './onboarding.service';

void (async () => {
  const user = await prisma.user.create({ data: { firstName: 'Onboarding analytics test' } });
  const app = express();
  app.use(express.json());
  app.patch('/onboarding', (req, _res, next) => {
    (req as AuthRequest).userId = user.id;
    next();
  }, patchOnboardingStep);
  const server = app.listen(0, '127.0.0.1');
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const send = async (step: string, event: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, event }),
      });
      assert.equal(response.status, 200, await response.text());
    };

    await send('city', 'onboarding_step_viewed');
    // Deliver previous-step analytics after the newer resume position.
    await send('profile', 'onboarding_step_completed');
    await send('level', 'onboarding_step_skipped');
    let stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.onboardingStep, 'city');
    for (const event of ['viewed', 'completed', 'skipped']) {
      assert.ok(logs.some((line) => line.includes(`onboarding_step_${event} `)));
    }

    await completeOnboarding(user.id);
    await send('notifications', 'onboarding_step_completed');
    stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.onboardingStep, null);
    assert.ok(stored.onboardingCompletedAt);
  } finally {
    console.log = originalLog;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
})().then(() => console.log('Onboarding analytics integration passed')).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
