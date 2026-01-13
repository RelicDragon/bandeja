import prisma from './src/config/database';

async function checkPushTokens() {
  const userId = process.argv[2];

  if (!userId) {
    console.log('Usage: npx ts-node check-push-tokens.ts <userId>');
    console.log('\nOr run without userId to see all users with multiple platform tokens:\n');
    
    const usersWithMultipleDevices = await prisma.pushToken.groupBy({
      by: ['userId'],
      _count: {
        platform: true
      },
      having: {
        platform: {
          _count: {
            gt: 0
          }
        }
      }
    });

    console.log(`Found ${usersWithMultipleDevices.length} user(s) with push tokens\n`);

    for (const userGroup of usersWithMultipleDevices.slice(0, 10)) {
      const tokens = await prisma.pushToken.findMany({
        where: { userId: userGroup.userId },
        select: {
          platform: true,
          deviceId: true,
          updatedAt: true,
          token: true
        }
      });

      const user = await prisma.user.findUnique({
        where: { id: userGroup.userId },
        select: {
          firstName: true,
          lastName: true,
          phone: true
        }
      });

      const platforms = tokens.reduce((acc, t) => {
        acc[t.platform] = (acc[t.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(`User: ${user?.firstName} ${user?.lastName} (${userGroup.userId})`);
      console.log(`  Platforms: ${Object.entries(platforms).map(([p, c]) => `${p}=${c}`).join(', ')}`);
      console.log(`  Total tokens: ${tokens.length}`);
      
      if (platforms.IOS && platforms.ANDROID) {
        console.log('  ⚠️  HAS BOTH iOS AND ANDROID TOKENS');
      }
      console.log('');
    }

    console.log('\nTo check specific user: npx ts-node check-push-tokens.ts <userId>');
    process.exit(0);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      sendPushMessages: true,
      sendPushInvites: true,
      sendPushDirectMessages: true,
      sendPushReminders: true
    }
  });

  if (!user) {
    console.error(`User ${userId} not found`);
    process.exit(1);
  }

  console.log('=== User Info ===');
  console.log(`Name: ${user.firstName} ${user.lastName}`);
  console.log(`Phone: ${user.phone}`);
  console.log(`User ID: ${user.id}`);
  console.log('\n=== Push Notification Settings ===');
  console.log(`Send Push Messages: ${user.sendPushMessages}`);
  console.log(`Send Push Invites: ${user.sendPushInvites}`);
  console.log(`Send Push Direct Messages: ${user.sendPushDirectMessages}`);
  console.log(`Send Push Reminders: ${user.sendPushReminders}`);

  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' }
  });

  console.log(`\n=== Push Tokens (${tokens.length}) ===`);
  
  if (tokens.length === 0) {
    console.log('No push tokens found for this user');
  } else {
    const iosTokens = tokens.filter(t => t.platform === 'IOS');
    const androidTokens = tokens.filter(t => t.platform === 'ANDROID');
    const webTokens = tokens.filter(t => t.platform === 'WEB');

    console.log(`\niOS Tokens: ${iosTokens.length}`);
    iosTokens.forEach((token, i) => {
      console.log(`  ${i + 1}. Token: ${token.token.substring(0, 30)}...`);
      console.log(`     Device ID: ${token.deviceId || 'N/A'}`);
      console.log(`     Updated: ${token.updatedAt.toISOString()}`);
    });

    console.log(`\nAndroid Tokens: ${androidTokens.length}`);
    androidTokens.forEach((token, i) => {
      console.log(`  ${i + 1}. Token: ${token.token.substring(0, 30)}...`);
      console.log(`     Device ID: ${token.deviceId || 'N/A'}`);
      console.log(`     Updated: ${token.updatedAt.toISOString()}`);
    });

    console.log(`\nWeb Tokens: ${webTokens.length}`);
    webTokens.forEach((token, i) => {
      console.log(`  ${i + 1}. Token: ${token.token.substring(0, 30)}...`);
      console.log(`     Device ID: ${token.deviceId || 'N/A'}`);
      console.log(`     Updated: ${token.updatedAt.toISOString()}`);
    });

    if (iosTokens.length > 0 && androidTokens.length > 0) {
      console.log('\n⚠️  WARNING: User has BOTH iOS and Android tokens');
      console.log('   Both platforms should receive notifications');
    }
  }

  await prisma.$disconnect();
}

checkPushTokens().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
