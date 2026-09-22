import type { GroupedInviteEntries, InviteListEntry } from '@/components/playerInvite/inviteEntries';

/** A group heading rendered inside the invite list (PRD 361). */
export interface InviteListHeaderRow {
  kind: 'header';
  id: 'played-with' | 'everyone';
  label: string;
  count: number;
}

export type InviteListRow = InviteListEntry | InviteListHeaderRow;

export function isInviteListHeaderRow(row: InviteListRow): row is InviteListHeaderRow {
  return row.kind === 'header';
}

/**
 * Flattens the grouped entries into list rows. With no Played-with rows the
 * output is exactly the plain list: no headings at all.
 */
export function buildInviteListRows(
  groups: GroupedInviteEntries,
  labels: { playedWith: string; everyone: string },
): InviteListRow[] {
  if (groups.playedWith.length === 0) return groups.everyone;
  const rows: InviteListRow[] = [
    { kind: 'header', id: 'played-with', label: labels.playedWith, count: groups.playedWith.length },
    ...groups.playedWith,
  ];
  if (groups.everyone.length > 0) {
    rows.push(
      { kind: 'header', id: 'everyone', label: labels.everyone, count: groups.everyone.length },
      ...groups.everyone,
    );
  }
  return rows;
}
