import prisma from './src/config/database';
import { calculateAndUpdateUserReliability, RELIABILITY_INCREMENT } from './src/services/results/rating.service';

async function getUserReliabilityStats(userId: string) {
  const gameOutcomes = await prisma.gameOutcome.aggregate({
    where: { userId },
    _sum: {
      wins: true,
      ties: true,
      losses: true,
    },
  });

  const matchesCount = (gameOutcomes._sum.wins || 0) + 
                       (gameOutcomes._sum.ties || 0) + 
                       (gameOutcomes._sum.losses || 0);

  const lundaEventsCount = await prisma.levelChangeEvent.count({
    where: {
      userId,
      eventType: 'LUNDA',
    },
  });

  const calculatedReliability = (matchesCount * RELIABILITY_INCREMENT) + 
                                (lundaEventsCount * RELIABILITY_INCREMENT * 8);
  
  const clampedReliability = Math.max(0.0, Math.min(100.0, calculatedReliability));

  return {
    matchesCount,
    lundaEventsCount,
    calculatedReliability: clampedReliability,
  };
}

async function updateAllUsersReliability(shouldUpdate: boolean = false) {
  try {
    const mode = shouldUpdate ? 'UPDATE' : 'PREVIEW';
    console.log(`🔄 Starting reliability calculation for all users (mode: ${mode})...\n`);
    
    const users = await prisma.user.findMany({
      select: { 
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        reliability: true,
      },
    });

    const totalUsers = users.length;
    console.log(`📊 Found ${totalUsers} users\n`);

    let processed = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const stats = await getUserReliabilityStats(user.id);
        const reliabilityBefore = user.reliability;
        
        if (shouldUpdate) {
          await calculateAndUpdateUserReliability(user.id);
        }
        
        const userDisplayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.phone || user.id;
        
        console.log(`[${processed + 1}/${totalUsers}] ${userDisplayName}`);
        console.log(`  Matches: ${stats.matchesCount}, Lunda games: ${stats.lundaEventsCount}`);
        console.log(`  Reliability: ${reliabilityBefore.toFixed(2)} → ${stats.calculatedReliability.toFixed(2)}${shouldUpdate ? ' (updated)' : ' (preview)'}`);
        console.log('');
        
        processed++;
      } catch (error) {
        errors++;
        const userDisplayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.phone || user.id;
        console.error(`❌ Error processing user ${userDisplayName} (${user.id}):`, error);
        console.log('');
      }
    }

    const action = shouldUpdate ? 'Updated' : 'Calculated';
    console.log(`\n✨ Completed! ${action}: ${processed}, Errors: ${errors}`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await prisma.$disconnect();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (globalThis as any).process?.exit(1);
    return;
  } finally {
    await prisma.$disconnect();
  }
}

const args = process.argv.slice(2);
const shouldUpdate = args.includes('--update') || args.includes('-u');

if (shouldUpdate) {
  console.log('⚠️  UPDATE MODE: Database will be modified\n');
} else {
  console.log('ℹ️  PREVIEW MODE: No database changes will be made\n');
  console.log('   Use --update or -u flag to actually update the database\n');
}

updateAllUsersReliability(shouldUpdate);
