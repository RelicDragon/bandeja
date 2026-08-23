export function myGamesParticipantWhere(userId: string) {
  return {
    some: {
      userId,
      status: { not: 'INVITED' as const },
    },
  };
}
