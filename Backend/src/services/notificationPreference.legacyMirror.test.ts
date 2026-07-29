import assert from 'node:assert/strict';
import { NotificationChannelType } from '@prisma/client';
import prisma from '../config/database';
import { NotificationPreferenceService } from './notificationPreference.service';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      phone: `qa-pref-mirror-${suffix}`,
      firstName: 'Legacy',
    },
  });

  try {
    const [updated] = await NotificationPreferenceService.updateMany(user.id, [
      {
        channelType: NotificationChannelType.PUSH,
        sendPlayIntentNotifications: false,
      },
    ]);
    assert.equal(updated.sendPlayIntentNotifications, false);
    assert.equal(
      updated.sendPlayIntentSocialNotifications,
      false,
      'legacy clients mute both match and social when only the old field is sent',
    );

    const [split] = await NotificationPreferenceService.updateMany(user.id, [
      {
        channelType: NotificationChannelType.PUSH,
        sendPlayIntentNotifications: true,
        sendPlayIntentSocialNotifications: false,
      },
    ]);
    assert.equal(split.sendPlayIntentNotifications, true);
    assert.equal(
      split.sendPlayIntentSocialNotifications,
      false,
      'new clients keep social independent when both fields are sent',
    );
  } finally {
    await prisma.notificationPreference.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
})();
