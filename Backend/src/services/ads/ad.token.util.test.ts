import { AdCampaignStatus, AdClickAction, AdPlacementKey } from '@prisma/client';
import prisma from '../../config/database';
import {
  AD_CLICK_TOKEN_TTL_MS,
  hashAdClickToken,
  mintAdClickToken,
  purgeExpiredAdClickTokens,
  revokeAdClickToken,
  verifyAdClickToken,
} from './ad.token.util';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main() {
  assert((await verifyAdClickToken(null)) === null, 'null rejected');
  assert((await verifyAdClickToken('')) === null, 'empty rejected');
  assert((await verifyAdClickToken('short')) === null, 'short rejected');
  assert((await verifyAdClickToken('not-a-token-value-xxx')) === null, 'garbage rejected');

  const user = await prisma.user.findFirst({ select: { id: true } });
  const sponsor =
    (await prisma.adSponsor.findFirst()) ??
    (await prisma.adSponsor.create({ data: { name: `AdToken QA ${Date.now()}` } }));
  if (!user) {
    console.log('ad.token.util: skip mint (no user)');
    return;
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      sponsorId: sponsor.id,
      name: `AdToken util ${Date.now()}`,
      status: AdCampaignStatus.DRAFT,
      targeting: { cityIds: ['x'] },
      placements: { create: [{ placement: AdPlacementKey.home_hero }] },
      creatives: {
        create: [
          {
            locale: 'en',
            imageUrl: 'https://example.test/a.webp',
            clickUrl: '/x',
            clickAction: AdClickAction.OPEN_URL,
          },
        ],
      },
    },
  });

  try {
    const userId = user.id;
    const token = await mintAdClickToken({ userId, campaignId: campaign.id });
    assert(!token.includes(userId), 'cuid not in opaque token');
    assert(/^[A-Za-z0-9_-]+$/.test(token), 'url-safe token');

    const row = await prisma.adClickToken.findUnique({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
    });
    assert(!!row, 'row created');
    assert(row!.tokenHash === hashAdClickToken(token), 'hash stored');
    assert(row!.tokenCipher.length > 20, 'cipher stored');
    assert(row!.expiresAt.getTime() - Date.now() > AD_CLICK_TOKEN_TTL_MS - 60_000, 'full TTL');

    assert((await verifyAdClickToken(token))?.userId === userId, 'verify userId');
    assert((await verifyAdClickToken(token))?.campaignId === campaign.id, 'verify campaignId');

    const again = await mintAdClickToken({ userId, campaignId: campaign.id });
    assert(again === token, 'same user+campaign → same token (stable)');

    const parallel = await Promise.all([
      mintAdClickToken({ userId, campaignId: campaign.id }),
      mintAdClickToken({ userId, campaignId: campaign.id }),
      mintAdClickToken({ userId, campaignId: campaign.id }),
    ]);
    assert(parallel.every((t) => t === token), 'concurrent mint returns same token');

    assert((await verifyAdClickToken(`${token}x`)) === null, 'tampered rejected');

    await revokeAdClickToken({ userId, campaignId: campaign.id });
    assert((await verifyAdClickToken(token)) === null, 'revoked rejected');
    const afterRevoke = await mintAdClickToken({ userId, campaignId: campaign.id });
    assert(afterRevoke !== token, 'revoked → new token');
    assert((await verifyAdClickToken(afterRevoke))?.userId === userId, 'new after revoke ok');
    assert((await verifyAdClickToken(token)) === null, 'old revoked stays dead');

    await prisma.adClickToken.update({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert((await verifyAdClickToken(afterRevoke)) === null, 'expired rejected');
    const renewed = await mintAdClickToken({ userId, campaignId: campaign.id });
    assert(renewed !== afterRevoke, 'expired → new token');
    assert((await verifyAdClickToken(renewed))?.userId === userId, 'renewed verifies');

    await prisma.adClickToken.update({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const purged = await purgeExpiredAdClickTokens();
    assert(purged >= 1, 'purge removes expired');
    assert((await verifyAdClickToken(renewed)) === null, 'purged token gone');
  } finally {
    await prisma.adCampaign.delete({ where: { id: campaign.id } }).catch(() => undefined);
  }

  console.log('ad.token.util: ok');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
