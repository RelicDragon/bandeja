import { describe, expect, it } from 'vitest';
import { buildPerGroupBracketCreateGroup } from './playoffWizardCreatePayload.util';
import { bracketPlanOptionsFromWizardConfig } from './playoffWizardBracketPlan.util';
import { buildBracketPlan } from './bracketStructure';
import {
  applyPreviewReorderToPlan,
  buildBracketPreviewPositions,
  swapBracketPreviewPositions,
} from './bracketPreviewReorder.util';

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

  it('POST group uses participant order after bracket preview swap', () => {
    const baseline = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const plan = buildBracketPlan(8, baseline);
    const positions = buildBracketPreviewPositions(plan);
    const swapped = swapBracketPreviewPositions(positions, positions[0].key, positions[1].key);
    const previewPlan = applyPreviewReorderToPlan(plan, swapped);

    const payload = buildPerGroupBracketCreateGroup({
      leagueGroupId: 'g1',
      participantIds: previewPlan.orderedParticipantIds,
      customByeEnabled: false,
      customByeSeedRanks: [],
      customPlayInEnabled: false,
      playInSeedPairs: [],
    });

    expect(payload.participantIds).toEqual(previewPlan.orderedParticipantIds);
    expect(payload.participantIds[0]).toBe('p2');
    expect(payload.participantIds[1]).toBe('p1');
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
