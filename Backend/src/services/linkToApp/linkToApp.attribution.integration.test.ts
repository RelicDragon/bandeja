import assert from 'node:assert/strict';
import type { Request } from 'express';
import prisma from '../../config/database';
import { applyAuthAttribution, recordLinkToAppEvent } from './linkToApp.service';

function req(body: Record<string, unknown>, cookie?: string): Request {
  return {
    body,
    query: {},
    get(name: string) {
      const key = name.toLowerCase();
      if (key === 'cookie') return cookie;
      if (key === 'user-agent') return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';
      if (key === 'referer' || key === 'referrer') return 'https://bandeja.me/link-to-app';
      return undefined;
    },
  } as unknown as Request;
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const aid = `Aid${suffix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 13)}`;
  assert.ok(aid.length >= 8 && aid.length <= 32);

  const user = await prisma.user.create({
    data: { firstName: 'Utm', lastName: suffix },
  });
  const other = await prisma.user.create({
    data: { firstName: 'None', lastName: suffix },
  });

  try {
    await recordLinkToAppEvent({
      kind: 'view',
      query: { utm_source: 'qr', utm_medium: 'offline', utm_campaign: 'club-a', aid },
      userAgent: 'Mozilla/5.0 (iPhone)',
    });
    await recordLinkToAppEvent({
      kind: 'ios',
      query: { utm_source: 'qr', utm_campaign: 'club-a', aid },
      userAgent: 'Mozilla/5.0 (iPhone)',
    });

    await applyAuthAttribution(
      req({
        attribution: {
          aid,
          utmSource: 'qr',
          utmCampaign: 'club-a',
          choice: 'ios',
        },
      }),
      user.id,
      'register'
    );

    const stamped = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        attributionId: true,
        utmSource: true,
        utmCampaign: true,
        attributionChoice: true,
        attributionAuthKind: true,
      },
    });
    assert.equal(stamped?.attributionId, aid);
    assert.equal(stamped?.utmCampaign, 'club-a');
    assert.equal(stamped?.utmSource, 'qr');
    assert.equal(stamped?.attributionChoice, 'ios');
    assert.equal(stamped?.attributionAuthKind, 'register');

    await applyAuthAttribution(
      req({
        attribution: {
          aid,
          utmSource: 'other',
          utmCampaign: 'club-b',
          choice: 'web',
        },
      }),
      user.id,
      'login'
    );

    const stillFirst = await prisma.user.findUnique({
      where: { id: user.id },
      select: { utmCampaign: true, attributionAuthKind: true, attributionChoice: true },
    });
    assert.equal(stillFirst?.utmCampaign, 'club-a');
    assert.equal(stillFirst?.attributionAuthKind, 'register');

    const attribution = await prisma.linkToAppAttribution.findUnique({ where: { id: aid } });
    assert.equal(attribution?.utmCampaign, 'club-a');
    assert.equal(attribution?.convertedUserId, user.id);
    assert.equal(attribution?.convertedAuthKind, 'register');
    assert.equal(attribution?.lastChoice, 'web');

    await applyAuthAttribution(req({}, `bandeja_aid=${aid}`), other.id, 'login');
    const unmarked = await prisma.user.findUnique({
      where: { id: other.id },
      select: { attributionId: true, utmCampaign: true, attributionAuthKind: true },
    });
    assert.equal(unmarked?.attributionId, aid);
    assert.equal(unmarked?.utmCampaign, 'club-a');
    assert.equal(unmarked?.attributionAuthKind, 'login');

    const registerEvents = await prisma.linkToAppEvent.count({
      where: { attributionId: aid, kind: 'register', userId: user.id },
    });
    assert.equal(registerEvents, 1);

    await applyAuthAttribution(
      req({
        attribution: { aid, utmCampaign: 'club-a' },
      }),
      user.id,
      'login',
      { attachOnly: true }
    );
    const stillOneRegister = await prisma.linkToAppEvent.count({
      where: { attributionId: aid, kind: 'register', userId: user.id },
    });
    assert.equal(stillOneRegister, 1);

    console.log('linkToApp.attribution.integration.test.ts: ok');
  } finally {
    await prisma.linkToAppEvent.deleteMany({ where: { OR: [{ attributionId: aid }, { userId: { in: [user.id, other.id] } }] } });
    await prisma.user.updateMany({
      where: { id: { in: [user.id, other.id] } },
      data: { attributionId: null },
    });
    await prisma.linkToAppAttribution.deleteMany({ where: { id: aid } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
