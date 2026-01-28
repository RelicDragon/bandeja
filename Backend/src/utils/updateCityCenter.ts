import prisma from '../config/database';

export async function refreshCityFromClubs(cityId: string): Promise<void> {
  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: { isActive: true },
  });
  if (!city) return;

  const activeClubs = await prisma.club.findMany({
    where: { cityId, isActive: true },
    select: { latitude: true, longitude: true },
  });
  const clubsCount = activeClubs.length;
  const withCoords = activeClubs.filter(
    (c) => c.latitude != null && c.longitude != null
  );

  if (clubsCount === 0 || withCoords.length === 0) {
    await prisma.city.update({
      where: { id: cityId },
      data: {
        clubsCount,
        latitude: 0,
        longitude: 0,
        isCorrect: false,
      },
    });
    return;
  }

  const sumLat = withCoords.reduce((s, c) => s + (c.latitude ?? 0), 0);
  const sumLng = withCoords.reduce((s, c) => s + (c.longitude ?? 0), 0);
  const n = withCoords.length;
  await prisma.city.update({
    where: { id: cityId },
    data: {
      clubsCount,
      latitude: sumLat / n,
      longitude: sumLng / n,
      isCorrect: city.isActive,
    },
  });
}

export async function refreshAllCitiesFromClubs(): Promise<number> {
  const cities = await prisma.city.findMany({ select: { id: true } });
  for (const c of cities) {
    await refreshCityFromClubs(c.id);
  }
  return cities.length;
}
