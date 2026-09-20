import { describe, expect, it } from 'vitest';
import type { BasicUser } from '@/types';
import { giftRecipientName, rankGiftCandidates } from './giftCandidates';

function user(id: string, firstName: string, lastName = ''): BasicUser {
  return { id, firstName, lastName } as BasicUser;
}

describe('gift picker ordering', () => {
  const ana = user('1', 'Ana', 'Ruiz');
  const bo = user('2', 'Bo', 'Lind');
  const cy = user('3', 'Cy', 'Novak');

  it('puts followers before the people the giver follows', () => {
    expect(rankGiftCandidates([bo], [ana], '').map((u) => u.id)).toEqual(['2', '1']);
  });

  it('collapses somebody who is both a follower and followed', () => {
    const ranked = rankGiftCandidates([ana, bo], [ana, cy], '');
    expect(ranked.map((u) => u.id)).toEqual(['1', '2', '3']);
  });

  it('filters locally by full name, case-insensitively', () => {
    expect(rankGiftCandidates([ana, bo, cy], [], 'ru').map((u) => u.id)).toEqual(['1']);
    expect(rankGiftCandidates([ana, bo, cy], [], 'NOVAK').map((u) => u.id)).toEqual(['3']);
  });

  it('returns everybody for an empty or whitespace search', () => {
    expect(rankGiftCandidates([ana, bo], [], '   ')).toHaveLength(2);
  });

  it('returns nothing rather than throwing when nobody matches', () => {
    expect(rankGiftCandidates([ana], [], 'zzz')).toEqual([]);
  });

  it('builds the confirmation name without stray spaces', () => {
    expect(giftRecipientName(ana)).toBe('Ana Ruiz');
    expect(giftRecipientName(user('9', 'Ana'))).toBe('Ana');
  });
});
