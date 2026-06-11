import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { enrichProfileUser } from '../user/userSportProfile.service';

export async function dismissBooktimeConnectHint(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { booktimeConnectHintDismissed: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) throw new ApiError(404, 'User not found');
  return enrichProfileUser(user);
}
