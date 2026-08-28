import assert from 'node:assert/strict';
import prisma from '../src/config/database';

const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
const telegramId = `audit-telegram-${suffix}`;
const codes = [suffix.slice(-6).padStart(6, '1'), `${Number(suffix.slice(-6)) + 1}`.slice(-6).padStart(6, '2')];
let userId: string | undefined;

type AuthPayload = {
  success: boolean;
  data?: {
    token?: string;
    user?: {
      id?: string;
      telegramId?: string;
      primarySport?: string;
      primarySportIsSet?: boolean;
      cityIsSet?: boolean;
      currentCityId?: string | null;
    };
  };
};

async function createOtp(code: string) {
  await prisma.telegramOtp.create({
    data: {
      code,
      telegramId,
      username: `audit_${suffix}`,
      firstName: 'Telegram',
      lastName: 'Audit',
      languageCode: 'en',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

async function verify(code: string): Promise<{ status: number; body: AuthPayload }> {
  const response = await fetch('http://127.0.0.1:3000/api/telegram/verify-otp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-version': '999.0.0',
      'x-client-platform': 'web',
      'x-e2e-test': '1',
    },
    body: JSON.stringify({ code, language: 'en' }),
  });
  return { status: response.status, body: (await response.json()) as AuthPayload };
}

async function run() {
  await createOtp(codes[0]!);
  const first = await verify(codes[0]!);
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.ok(first.body.data?.token);
  userId = first.body.data?.user?.id;
  assert.ok(userId);
  assert.equal(first.body.data?.user?.telegramId, telegramId);
  assert.equal(first.body.data?.user?.primarySport, 'PADEL');
  assert.equal(first.body.data?.user?.primarySportIsSet, false);
  assert.ok(first.body.data?.user?.currentCityId);

  const replay = await verify(codes[0]!);
  assert.equal(replay.status, 401);

  await prisma.user.update({
    where: { id: userId },
    data: { primarySportIsSet: true, cityIsSet: true },
  });
  await createOtp(codes[1]!);
  const second = await verify(codes[1]!);
  assert.equal(second.status, 200);
  assert.equal(second.body.data?.user?.id, userId);
  assert.equal(second.body.data?.user?.primarySportIsSet, true);
  assert.equal(second.body.data?.user?.cityIsSet, true);

  console.log('provider auth audit: Telegram new/existing/replay rejection passed');
  console.log('provider auth audit: new Telegram accounts require sport confirmation');
}

run()
  .finally(async () => {
    await prisma.telegramOtp.deleteMany({ where: { telegramId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
