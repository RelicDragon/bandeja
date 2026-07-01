import prisma from '../../config/database';

export async function lookupBugGroupChannelIds(bugIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(bugIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map();

  const rows = await prisma.bug.findMany({
    where: { id: { in: unique } },
    select: { id: true, groupChannelId: true },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.groupChannelId) map.set(row.id, row.groupChannelId);
  }
  return map;
}
