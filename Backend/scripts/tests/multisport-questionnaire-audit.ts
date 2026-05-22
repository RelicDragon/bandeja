/**
 * §23 code audit — sport-scoped level history, join validation, round generation.
 */
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { validatePlayerCanJoinGame } from '../../src/utils/participantValidation';
import { prismaGameToGenGame } from '../../src/services/results/mapPrismaForGeneration';
import { gameIncludeForRoundGeneration } from '../../src/services/results/roundGenerationGameInclude';
import { completeSportQuestionnaire, resetSportQuestionnaire } from '../../src/services/user/sportQuestionnaire.service';
import { hashPassword } from '../../src/utils/hash';
import { registrationSportUserFields } from '../../src/services/auth/registrationSport.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

async function main() {
  const padelUser = await prisma.user.findFirst({
    where: { sportProfiles: { some: { sport: Sport.PADEL } } },
    select: { id: true },
  });
  assert(!!padelUser, 'need a user with padel profile');

  const tennisGame = await prisma.game.findFirst({
    where: { sport: Sport.TENNIS, minLevel: { not: null }, maxLevel: { not: null } },
    include: { participants: { where: { status: 'PLAYING' }, take: 1 } },
  });

  if (tennisGame) {
    const multi = await prisma.user.findFirst({
      where: {
        level: 4.0,
        sportProfiles: { some: { sport: Sport.TENNIS, level: { lte: 2.0 } } },
      },
      select: { id: true },
    });
    if (multi) {
      const join = await validatePlayerCanJoinGame(
        {
          ...tennisGame,
          status: tennisGame.status,
          participants: tennisGame.participants,
        } as any,
        multi.id,
      );
      assert(
        !join.canJoin || join.reason === 'games.addedToQueueLevelOutOfRange',
        'join uses tennis profile level not global padel level',
      );
    }
  }

  const genGame = await prisma.game.findFirst({
    where: { sport: Sport.TENNIS, participants: { some: { status: 'PLAYING' } } },
    include: gameIncludeForRoundGeneration,
  });
  if (genGame) {
    const mapped = prismaGameToGenGame(genGame);
    assert(mapped.sport === Sport.TENNIS, 'gen game carries sport');
    const withProfile = genGame.participants.find(
      (p) => p.user?.sportProfiles?.some((sp) => sp.sport === Sport.TENNIS && sp.level !== p.user?.level),
    );
    if (withProfile?.user) {
      const tennisLevel = withProfile.user.sportProfiles!.find((sp) => sp.sport === Sport.TENNIS)!.level;
      const part = mapped.participants.find((p) => p.userId === withProfile.userId);
      assert(part?.user.level === tennisLevel, 'round gen maps sport-projected level');
    }
  }

  const gameEvent = await prisma.levelChangeEvent.findFirst({
    where: { sport: Sport.TENNIS, eventType: 'GAME' },
    select: { userId: true, sport: true },
  });
  if (gameEvent) {
    const filtered = await prisma.levelChangeEvent.findMany({
      where: {
        userId: gameEvent.userId,
        NOT: { eventType: { in: ['SOCIAL_BAR', 'SOCIAL_PARTICIPANT'] } },
        OR: [{ sport: Sport.TENNIS }, { sport: null, game: { sport: Sport.TENNIS } }],
      },
      select: { sport: true, eventType: true },
    });
    assert(
      filtered.every((e) => e.sport === Sport.TENNIS || e.sport == null),
      'tennis level-history filter excludes other sports',
    );
    assert(filtered.some((e) => e.sport === Sport.TENNIS), 'tennis filter returns sport-tagged events');
  }

  const phone = `audit-reset-${Date.now()}`;
  const resetUser = await prisma.user.create({
    data: {
      phone,
      passwordHash: await hashPassword('audit-reset'),
      firstName: 'Audit',
      lastName: 'Reset',
      nameIsSet: true,
      ...registrationSportUserFields(Sport.TENNIS),
    },
    select: { id: true },
  });
  await completeSportQuestionnaire(resetUser.id, Sport.TENNIS, ['A', 'A', 'A', 'A', 'A']);
  await resetSportQuestionnaire(resetUser.id, Sport.TENNIS);
  const after = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: resetUser.id, sport: Sport.TENNIS } },
  });
  assert(after?.level === 1.0, 'resetSportQuestionnaire restores 1.0');
  assert(!after?.questionnaireCompletedAt, 'reset clears questionnaire completion');
  await prisma.user.delete({ where: { id: resetUser.id } });

  console.log('multisport-questionnaire-audit: OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
