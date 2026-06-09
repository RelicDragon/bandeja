import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import {
  isCreateTemplateCompatible,
  listTemplatesForParticipantSetup,
  minRosterForTemplate,
} from '@/sport/createTemplateParticipantFit';

const TT_PRESETS = ['POINTS_11', 'SINGLE_GAME_21', 'BEST_OF_3_11', 'BEST_OF_5_11', 'CUSTOM'] as const;

describe('createTemplateParticipantFit', () => {
  it('TT head-to-head templates require singles roster ≤ 4', () => {
    const open = CREATE_TEMPLATES.TT_OPEN_PLAY_11;
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, open, [...TT_PRESETS], {
        maxParticipants: 2,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(true);
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, open, [...TT_PRESETS], {
        maxParticipants: 12,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(false);
  });

  it('TT club RR needs at least 6 singles players', () => {
    const rr = CREATE_TEMPLATES.TT_CLUB_RR_11;
    expect(minRosterForTemplate(Sports.TABLE_TENNIS, rr)).toBe(6);
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, rr, [...TT_PRESETS], {
        maxParticipants: 8,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(true);
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, rr, [...TT_PRESETS], {
        maxParticipants: 4,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(false);
  });

  it('TT box league needs larger roster', () => {
    const box = CREATE_TEMPLATES.TT_BOX_BO3_11;
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, box, [...TT_PRESETS], {
        maxParticipants: 12,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(true);
    expect(
      isCreateTemplateCompatible(Sports.TABLE_TENNIS, box, [...TT_PRESETS], {
        maxParticipants: 4,
        playersPerMatch: 2,
        hasFixedTeams: false,
      }),
    ).toBe(false);
  });

  it('hides doubles padel templates when roster is singles-only', () => {
    const list = listTemplatesForParticipantSetup(Sports.PADEL, ['POINTS_24', 'CUSTOM'], {
      maxParticipants: 8,
      playersPerMatch: 2,
      hasFixedTeams: false,
    });
    expect(list.some((t) => t.id === 'PADEL_AMERICANO')).toBe(false);
    expect(list.some((t) => t.id === 'PADEL_SINGLES_AMERICANO_24')).toBe(true);
  });

  it('shows padel singles match templates for small 1v1 roster', () => {
    const presets = [
      'CLASSIC_BEST_OF_3',
      'CLASSIC_SINGLE_SET',
      'POINTS_24',
      'CUSTOM',
    ] as const;
    const list = listTemplatesForParticipantSetup(Sports.PADEL, [...presets], {
      maxParticipants: 2,
      playersPerMatch: 2,
      hasFixedTeams: false,
    });
    expect(list.map((t) => t.id)).toEqual(['PADEL_SINGLES_BO3', 'PADEL_SINGLES_SINGLE_SET']);
  });

  it('badminton Bo3 templates stay visible when doubles per match is selected', () => {
    const presets = [
      'POINTS_21',
      'POINTS_15',
      'BEST_OF_3_21',
      'BEST_OF_3_15',
      'CUSTOM',
    ] as const;
    const list = listTemplatesForParticipantSetup(Sports.BADMINTON, [...presets], {
      maxParticipants: 8,
      playersPerMatch: 4,
      hasFixedTeams: false,
    });
    expect(list.map((t) => t.id)).toEqual([
      'BADMINTON_AMERICANO_21',
      'BADMINTON_CLUB_3X21',
      'BADMINTON_CLUB_3X15',
    ]);
  });

  it('MIX_PAIRS requires doubles per match', () => {
    expect(
      isCreateTemplateCompatible(
        Sports.PADEL,
        CREATE_TEMPLATES.PADEL_AMERICANO,
        ['POINTS_24', 'CUSTOM'],
        {
          maxParticipants: 12,
          playersPerMatch: 2,
          hasFixedTeams: false,
          genderTeams: 'MIX_PAIRS',
        },
      ),
    ).toBe(false);
  });
});
