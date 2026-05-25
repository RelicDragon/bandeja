import { describe, expect, it } from 'vitest';
import { buildPerGroupBracketCreateGroup } from './playoffWizardCreatePayload.util';
import { bracketPlanOptionsFromWizardConfig } from './playoffWizardBracketPlan.util';
import { buildBracketPlan } from './bracketStructure';

describe('playoffWizardCreatePayload.util (UX-B2)', () => {
  it('POST group matches preview plan order and custom options', () => {
    const previewOrder = ['p7', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const planOptions = bracketPlanOptionsFromWizardConfig({
      customByeEnabled: true,
      customByeSeedRanks: [4],
      customPlayInEnabled: true,
      playInSeedPairs: [[5, 6]],
    });
    const previewPlan = buildBracketPlan(7, previewOrder, planOptions);

    const payload = buildPerGroupBracketCreateGroup({
      leagueGroupId: 'g1',
      participantIds: previewOrder,
      customByeEnabled: true,
      customByeSeedRanks: [4],
      customPlayInEnabled: true,
      playInSeedPairs: [[5, 6]],
      includeThirdPlace: true,
    });

    expect(payload.participantIds).toEqual(previewPlan.orderedParticipantIds);
    expect(payload.customByeSeedRanks).toEqual([4]);
    expect(payload.customPlayInPairings).toEqual([{ seedA: 5, seedB: 6 }]);
    expect(payload.includeThirdPlace).toBe(true);
    expect(payload.leagueGroupId).toBe('g1');
  });

  it('per-group phase-4 flags are independent in payload (UX-B4)', () => {
    const groupA = buildPerGroupBracketCreateGroup({
      leagueGroupId: 'gA',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      customByeEnabled: false,
      customByeSeedRanks: [],
      customPlayInEnabled: false,
      playInSeedPairs: [],
      includeThirdPlace: true,
      includeConsolationBracket: false,
    });
    const groupB = buildPerGroupBracketCreateGroup({
      leagueGroupId: 'gB',
      participantIds: ['q1', 'q2', 'q3', 'q4'],
      customByeEnabled: false,
      customByeSeedRanks: [],
      customPlayInEnabled: false,
      playInSeedPairs: [],
      includeThirdPlace: false,
      includeConsolationBracket: true,
    });
    expect(groupA.includeThirdPlace).toBe(true);
    expect(groupA.includeConsolationBracket).toBeUndefined();
    expect(groupB.includeThirdPlace).toBeUndefined();
    expect(groupB.includeConsolationBracket).toBe(true);
  });
});
