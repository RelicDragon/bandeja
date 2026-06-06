import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SPORTS, Sports } from '@shared/sport';
import {
  CREATE_TEMPLATES as FE_SHARED_CREATE_TEMPLATES,
  type CreateTemplateId,
} from '@shared/createTemplates';
import { CREATE_TEMPLATES as FE_CREATE_TEMPLATES } from '@/sport/createFlow';

const BE_SHARED_PATH = join(
  process.cwd(),
  '../Backend/src/shared/createTemplates.ts',
);

const CORE_TEMPLATE_FIELDS = [
  'sport',
  'tier',
  'scoringPreset',
  'gameType',
  'matchGenerationType',
  'playersPerMatch',
  'suggestedMaxParticipants',
  'suggestedCourts',
  'affectsRating',
  'matchTimerEnabled',
  'matchTimedCapMinutes',
  'hasGoldenPoint',
  'expectedDurationLabelKey',
] as const;

function pickCoreFields(tpl: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CORE_TEMPLATE_FIELDS) {
    if (tpl[key] !== undefined) out[key] = tpl[key];
  }
  return out;
}

function normalizeSharedModuleSource(src: string): string {
  return src.replace(/^\/\*\* Canonical create templates[^\n]*\n/, '');
}

describe('create template registry parity', () => {
  it('Frontend and Backend shared/createTemplates.ts modules match (except sync comment)', () => {
    const fe = readFileSync(join(process.cwd(), 'shared/createTemplates.ts'), 'utf8');
    const be = readFileSync(BE_SHARED_PATH, 'utf8');
    expect(normalizeSharedModuleSource(fe)).toBe(normalizeSharedModuleSource(be));
  });

  it('shared registry covers every sport with matching template IDs', () => {
    for (const sport of ALL_SPORTS) {
      const ids = Object.values(FE_SHARED_CREATE_TEMPLATES)
        .filter((t) => t.sport === sport)
        .map((t) => t.id)
        .sort();
      expect(ids.length, `${sport} should have templates`).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(FE_SHARED_CREATE_TEMPLATES) as CreateTemplateId[])(
    'FE createFlow core fields match shared for %s',
    (id) => {
      const shared = FE_SHARED_CREATE_TEMPLATES[id];
      const fe = FE_CREATE_TEMPLATES[id];
      expect(pickCoreFields(fe as Record<string, unknown>)).toEqual(
        pickCoreFields(shared as Record<string, unknown>),
      );
    },
  );

  it('legacy padel template IDs remain FE-only', () => {
    const legacy = ['PADEL_BEST_OF_3', 'PADEL_SINGLE_SET', 'PADEL_AMERICANO', 'PADEL_TIMED'] as const;
    for (const id of legacy) {
      expect(FE_CREATE_TEMPLATES[id]?.id).toBe(id);
      expect(FE_SHARED_CREATE_TEMPLATES[id as CreateTemplateId]).toBeUndefined();
    }
  });

  it('all implemented sports have at least one shared template', () => {
    const sportsWithTemplates = new Set(
      Object.values(FE_SHARED_CREATE_TEMPLATES).map((t) => t.sport),
    );
    for (const sport of ALL_SPORTS) {
      expect(sportsWithTemplates.has(sport)).toBe(true);
    }
    expect(sportsWithTemplates.has(Sports.PADEL)).toBe(true);
    expect(sportsWithTemplates.has(Sports.TENNIS)).toBe(true);
    expect(sportsWithTemplates.has(Sports.TABLE_TENNIS)).toBe(true);
    expect(sportsWithTemplates.has(Sports.BADMINTON)).toBe(true);
    expect(sportsWithTemplates.has(Sports.PICKLEBALL)).toBe(true);
    expect(sportsWithTemplates.has(Sports.SQUASH)).toBe(true);
  });
});
