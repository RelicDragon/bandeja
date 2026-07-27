import { AdCampaignStatus, AdClickAction, AdPlacementKey } from '@prisma/client';
import prisma from '../../config/database';
import { mintAdClickToken } from './ad.token.util';
import { AD_LANDING_LIZA_BIRTHDAY_2026 } from './adLandingWish.constants';
import { createAdLandingWish } from './adLandingWish.service';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main() {
  const anon = await createAdLandingWish(AD_LANDING_LIZA_BIRTHDAY_2026, {
    name: 'Anon Friend',
    message: 'Happy birthday!',
    donationIntent: 'NONE',
    adToken: null,
    locale: 'en',
  });
  assert(anon.userId === null, 'anon userId null');
  assert(anon.campaignId === null, 'anon campaignId null');

  const broken = await createAdLandingWish(AD_LANDING_LIZA_BIRTHDAY_2026, {
    name: 'Broken Token',
    message: 'Still counts',
    donationIntent: 'RSD',
    adToken: 'not-a-valid-token',
    locale: 'ru',
  });
  assert(broken.userId === null, 'broken token → null user');
  assert(broken.donationIntent === 'RSD', 'donation RSD');

  const user = await prisma.user.findFirst({ select: { id: true } });
  const sponsor =
    (await prisma.adSponsor.findFirst()) ??
    (await prisma.adSponsor.create({ data: { name: `Wish QA ${Date.now()}` } }));
  if (!user) {
    console.log('adLandingWish: skip linked (no user)');
    return;
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      sponsorId: sponsor.id,
      name: `Wish util ${Date.now()}`,
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
    const token = await mintAdClickToken({ userId: user.id, campaignId: campaign.id });
    assert(Boolean(token), 'mint ok');

    const first = await createAdLandingWish(AD_LANDING_LIZA_BIRTHDAY_2026, {
      name: 'Linked One',
      message: 'Wish 1',
      donationIntent: 'RUB',
      adToken: token!,
      locale: 'rs',
    });
    assert(first.userId === user.id, 'linked user');
    assert(first.campaignId === campaign.id, 'linked campaign');

    const afterDonation = await prisma.adCampaign.findUnique({
      where: { id: campaign.id },
      select: { targeting: true },
    });
    const targeting = afterDonation?.targeting as { excludeUserIds?: string[] } | null;
    assert(
      Array.isArray(targeting?.excludeUserIds) && targeting!.excludeUserIds!.includes(user.id),
      'donation adds user to excludeUserIds'
    );

    const second = await createAdLandingWish(AD_LANDING_LIZA_BIRTHDAY_2026, {
      name: 'Linked Two',
      message: 'Wish 2',
      donationIntent: 'NONE',
      adToken: token!,
      locale: 'en',
    });
    assert(second.userId === user.id, 'second wish same user');
    assert(second.id !== first.id, 'multiple wishes allowed');

    const afterNone = await prisma.adCampaign.findUnique({
      where: { id: campaign.id },
      select: { targeting: true },
    });
    const targetingAfterNone = afterNone?.targeting as { excludeUserIds?: string[] } | null;
    assert(
      (targetingAfterNone?.excludeUserIds ?? []).filter((id) => id === user.id).length === 1,
      'NONE donation does not duplicate excludeUserIds'
    );
  } finally {
    await prisma.adLandingWish.deleteMany({
      where: {
        OR: [{ id: anon.id }, { id: broken.id }, { campaignId: campaign.id }],
      },
    });
    await prisma.adClickToken.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.adCampaign.delete({ where: { id: campaign.id } }).catch(() => undefined);
  }

  console.log('adLandingWish.service: ok');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
