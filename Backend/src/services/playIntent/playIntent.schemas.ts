import {
  EntityType,
  GenderTeam,
  PlayIntentTimeOfDay,
  Sport,
} from '@prisma/client';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(128);
const sport = z.nativeEnum(Sport);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z
  .string()
  .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
  .nullable();
const level = z.number().finite().min(0).max(10).nullable();

export const playIntentIdParamsSchema = z
  .object({ id: identifier })
  .strict();

export const playIntentOptionalScopeQuerySchema = z
  .object({
    cityId: identifier.optional(),
    sport: sport.optional(),
  })
  .strict();

export const createPlayIntentBodySchema = z
  .object({
    cityId: identifier.optional(),
    sport: sport.optional(),
    entityType: z
      .enum([EntityType.GAME, EntityType.BAR])
      .optional(),
    dayOffsets: z.array(z.number().int().min(0).max(2)).max(3).optional(),
    dateKeys: z.array(dateKey).max(3).optional(),
    timeOfDay: z.nativeEnum(PlayIntentTimeOfDay).optional(),
    timeOfDays: z
      .array(z.nativeEnum(PlayIntentTimeOfDay))
      .min(1)
      .max(4)
      .optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    clubIds: z.array(identifier).max(100).optional(),
    minLevel: level.optional(),
    maxLevel: level.optional(),
    genderTeams: z.nativeEnum(GenderTeam).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.dayOffsets?.length &&
      input.dateKeys?.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateKeys'],
        message: 'Use dayOffsets or dateKeys, not both',
      });
    }
    if (input.timeOfDay === PlayIntentTimeOfDay.CUSTOM) {
      if (!input.startTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startTime'],
          message: 'Start time is required for a custom window',
        });
      }
      if (!input.endTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endTime'],
          message: 'End time is required for a custom window',
        });
      }
    }
    const selectedTimes = input.timeOfDays ?? [];
    if (new Set(selectedTimes).size !== selectedTimes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeOfDays'],
        message: 'Time periods must be unique',
      });
    }
    if (
      selectedTimes.length > 1 &&
      (selectedTimes.includes(PlayIntentTimeOfDay.ANYTIME) ||
        selectedTimes.includes(PlayIntentTimeOfDay.CUSTOM))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeOfDays'],
        message: 'playIntent.anytimeCustomExclusive',
      });
    }
    if (selectedTimes.includes(PlayIntentTimeOfDay.CUSTOM)) {
      if (!input.startTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startTime'],
          message: 'playIntent.customStartRequired',
        });
      }
      if (!input.endTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endTime'],
          message: 'playIntent.customEndRequired',
        });
      }
    }
  });

export const proposalIdParamsSchema = z
  .object({ id: identifier })
  .strict();

export const removeProposalMemberBodySchema = z
  .object({ userId: identifier })
  .strict();

export const addProposalMemberBodySchema = z
  .object({
    userId: identifier,
    intentId: identifier,
  })
  .strict();

export type ValidatedCreatePlayIntentInput = z.infer<
  typeof createPlayIntentBodySchema
>;
export type ValidatedPlayIntentScopeQuery = z.infer<
  typeof playIntentOptionalScopeQuerySchema
>;
export type ValidatedPlayIntentIdParams = z.infer<
  typeof playIntentIdParamsSchema
>;
export type ValidatedProposalIdParams = z.infer<
  typeof proposalIdParamsSchema
>;
export type ValidatedRemoveProposalMemberInput = z.infer<
  typeof removeProposalMemberBodySchema
>;
export type ValidatedAddProposalMemberInput = z.infer<
  typeof addProposalMemberBodySchema
>;
