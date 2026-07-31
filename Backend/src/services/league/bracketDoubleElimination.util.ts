export function grandFinalResetRequired(params: {
  firstFinalWinnerId: string | null;
  winnersChampionId: string | null;
  losersChampionId: string | null;
}): boolean {
  const { firstFinalWinnerId, winnersChampionId, losersChampionId } = params;
  return Boolean(
    firstFinalWinnerId &&
      winnersChampionId &&
      losersChampionId &&
      winnersChampionId !== losersChampionId &&
      firstFinalWinnerId === losersChampionId
  );
}

export function championshipResolvedByFirstGrandFinal(params: {
  firstFinalWinnerId: string | null;
  winnersChampionId: string | null;
}): boolean {
  return Boolean(
    params.firstFinalWinnerId &&
      params.winnersChampionId &&
      params.firstFinalWinnerId === params.winnersChampionId
  );
}
