import type { UserStats } from '@/api/users';

export type PublicPreferenceFlags = {
  preferredHandLeft?: boolean;
  preferredHandRight?: boolean;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
};

export function patchUserStatsPreferenceFlags(
  stats: UserStats,
  flags: PublicPreferenceFlags,
): UserStats {
  return {
    ...stats,
    user: {
      ...stats.user,
      ...(flags.preferredHandLeft !== undefined && { preferredHandLeft: flags.preferredHandLeft === true }),
      ...(flags.preferredHandRight !== undefined && { preferredHandRight: flags.preferredHandRight === true }),
      ...(flags.preferredCourtSideLeft !== undefined && {
        preferredCourtSideLeft: flags.preferredCourtSideLeft === true,
      }),
      ...(flags.preferredCourtSideRight !== undefined && {
        preferredCourtSideRight: flags.preferredCourtSideRight === true,
      }),
    },
  };
}
