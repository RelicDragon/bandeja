/**
 * Server-rendered previews (from → to) for the league-owner write tools
 * (`leagues.write.tools.ts`). Pure builders over rows the tools load; the only DB reads
 * are the club / court lookups the app's own picker would make.
 */
import { ParticipantStatus, RoundType, type Prisma } from '@prisma/client';
import type { AgentActionPreview, AgentActionPreviewLine } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { isValidTimeZone } from '../agentContext.service';
import { LEAGUE_FIXTURE_SELECT, leagueFixtureLabel } from '../dto/leagueSchedule.dto';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import { agentLeagueT } from '../i18n/agentLeagueI18n';
import { parseAgentDate } from './registry';
import { clip, GAME_WRITE_SELECT, gameTimezone, line } from './writeHelpers';

const DEFAULT_FIXTURE_MINUTES = 90;
const MAX_FIXTURE_MS = 24 * 60 * 60 * 1000;

export const FIXTURE_WRITE_SELECT = {
  ...LEAGUE_FIXTURE_SELECT,
  ...GAME_WRITE_SELECT,
  parent: { select: { name: true } },
} satisfies Prisma.GameSelect;

export type FixtureWriteRow = Prisma.GameGetPayload<{ select: typeof FIXTURE_WRITE_SELECT }>;

export type FixturePatch = {
  startTime?: string;
  endTime?: string;
  clubId?: string;
  courtId?: string | null;
};

export type FixtureChange = {
  /** Exactly the `PUT /games/:id` fields the league fixture editor sends. */
  body: Record<string, unknown>;
  lines: AgentActionPreviewLine[];
  warnings: string[];
  nextStart: Date;
  nextEnd: Date;
};

function roundLabel(locale: string, round: { orderIndex: number; roundType: RoundType } | null): string | null {
  if (!round) return null;
  const key = round.roundType === RoundType.PLAYOFF ? 'value.playoffRound' : 'value.round';
  return agentLeagueT(locale, key, { round: round.orderIndex + 1 });
}

export function fixtureTitle(fixture: FixtureWriteRow, locale: string): string {
  const label = leagueFixtureLabel(fixture) ?? roundLabel(locale, fixture.leagueRound) ?? agentT(locale, 'value.notSet');
  return agentLeagueT(locale, 'preview.fixture.title', { fixture: clip(label, 80) ?? label });
}

/**
 * Time / club / court change of a fixture, validated the way the league fixture editor
 * (`EditLeagueGameTeamsModal`) and `GameUpdateService` do. A court implies its club.
 */
export async function buildFixtureChange(
  fixture: FixtureWriteRow,
  patch: FixturePatch,
  locale: string,
  fallbackTimezone: string,
  now: Date,
): Promise<FixtureChange> {
  const body: Record<string, unknown> = {};
  const lines: AgentActionPreviewLine[] = [];
  const warnings: string[] = [];
  const notSet = agentT(locale, 'value.notSet');
  const noCourt = agentT(locale, 'value.noCourt');

  let targetClub: { id: string; name: string; timezone: string | null } | null = fixture.club
    ? { id: fixture.club.id, name: fixture.club.name, timezone: fixture.city?.timezone ?? null }
    : null;
  const loadClub = async (clubId: string) => {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, isActive: true, city: { select: { timezone: true } } },
    });
    if (!club || !club.isActive) throw new ApiError(404, 'Club not found');
    return { id: club.id, name: club.name, timezone: club.city.timezone };
  };
  const setClub = (club: { id: string; name: string; timezone: string | null }) => {
    targetClub = club;
    body.clubId = club.id;
    lines.push(line(agentT(locale, 'field.club'), fixture.club?.name ?? notSet, club.name));
  };

  if (patch.clubId !== undefined && patch.clubId !== fixture.club?.id) {
    setClub(await loadClub(patch.clubId));
  }
  if (patch.courtId !== undefined && patch.courtId !== (fixture.court?.id ?? null)) {
    if (patch.courtId === null) {
      body.courtId = null;
      lines.push(line(agentT(locale, 'field.court'), fixture.court?.name ?? null, noCourt));
    } else {
      const court = await prisma.court.findUnique({
        where: { id: patch.courtId },
        select: { id: true, name: true, clubId: true, isActive: true },
      });
      if (!court || !court.isActive) throw new ApiError(404, 'Court not found');
      const club: { id: string } | null = targetClub;
      if (club?.id !== court.clubId) {
        if (patch.clubId !== undefined) throw new ApiError(400, 'Court does not belong to the selected club');
        // Picking a court at another club moves the fixture to that club, as the app's picker does.
        setClub(await loadClub(court.clubId));
      }
      body.courtId = court.id;
      lines.push(line(agentT(locale, 'field.court'), fixture.court?.name ?? noCourt, court.name));
    }
  } else if ('clubId' in body && fixture.court && fixture.court.clubId !== body.clubId) {
    // `GameUpdateService` drops a court that belongs to another club.
    warnings.push(agentT(locale, 'warn.courtCleared'));
    lines.push(line(agentT(locale, 'field.court'), fixture.court.name, noCourt));
  }

  const resolvedClub: { timezone: string | null } | null = targetClub;
  const timezone = isValidTimeZone(resolvedClub?.timezone) ? resolvedClub!.timezone! : gameTimezone(fixture, fallbackTimezone);
  let nextStart = fixture.startTime;
  let nextEnd = fixture.endTime;
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    const start = patch.startTime !== undefined ? parseAgentDate(patch.startTime, timezone) : fixture.timeIsSet ? fixture.startTime : null;
    if (!start) throw new ApiError(400, fixture.timeIsSet ? 'startTime is not a valid date-time' : 'The fixture has no time yet: give startTime');
    let end: Date | null;
    if (patch.endTime !== undefined) {
      end = parseAgentDate(patch.endTime, timezone);
      if (!end) throw new ApiError(400, 'endTime is not a valid date-time');
    } else {
      const kept = fixture.endTime.getTime() - fixture.startTime.getTime();
      const duration = fixture.timeIsSet && kept > 0 && kept <= MAX_FIXTURE_MS ? kept : DEFAULT_FIXTURE_MINUTES * 60 * 1000;
      end = new Date(start.getTime() + duration);
    }
    if (!(start < end)) throw new ApiError(400, 'endTime must be after startTime');
    if (end.getTime() - start.getTime() > MAX_FIXTURE_MS) throw new ApiError(400, 'A fixture cannot last more than 24 hours');
    const startChanged = !fixture.timeIsSet || start.getTime() !== fixture.startTime.getTime();
    const endChanged = !fixture.timeIsSet || end.getTime() !== fixture.endTime.getTime();
    if (startChanged || endChanged) {
      // The fixture editor always sends both times plus `timeIsSet: true`.
      body.startTime = start.toISOString();
      body.endTime = end.toISOString();
      body.timeIsSet = true;
      nextStart = start;
      nextEnd = end;
      const before = (date: Date) => (fixture.timeIsSet ? formatAgentDateTime(date, timezone, locale) : notSet);
      if (startChanged) lines.push(line(agentT(locale, 'field.start'), before(fixture.startTime), formatAgentDateTime(start, timezone, locale)));
      if (endChanged) lines.push(line(agentT(locale, 'field.end'), before(fixture.endTime), formatAgentDateTime(end, timezone, locale)));
      if (start.getTime() < now.getTime()) warnings.push(agentT(locale, 'warn.past'));
    }
  }
  const round = roundLabel(locale, fixture.leagueRound);
  if (round && lines.length > 0) lines.unshift(line(agentLeagueT(locale, 'field.round'), null, round));
  return { body, lines, warnings, nextStart, nextEnd };
}

export type RoundAnnouncementFacts = {
  seasonTitle: string;
  round: { orderIndex: number; roundType: RoundType };
  fixtures: number;
  unscheduled: number;
  recipients: number;
};

export function buildRoundStartPreview(facts: RoundAnnouncementFacts, locale: string): AgentActionPreview {
  const warnings = [agentLeagueT(locale, 'warn.onlyOnce')];
  if (facts.unscheduled > 0) {
    warnings.unshift(agentLeagueT(locale, 'warn.unscheduledFixtures', { count: facts.unscheduled }));
  }
  return {
    title: agentLeagueT(locale, 'preview.roundStart.title', {
      round: facts.round.orderIndex + 1,
      season: clip(facts.seasonTitle, 60) ?? facts.seasonTitle,
    }),
    lines: [
      line(agentLeagueT(locale, 'field.round'), null, roundLabel(locale, facts.round)),
      line(agentLeagueT(locale, 'field.fixtures'), null, String(facts.fixtures)),
      line(agentLeagueT(locale, 'field.recipients'), null, String(facts.recipients)),
    ],
    warnings,
  };
}

/** Same audience as `LeagueBroadcastService`: PLAYING participants ∪ fixed-team players. */
export async function roundAnnouncementFacts(roundId: string) {
  const round = await prisma.leagueRound.findUnique({
    where: { id: roundId },
    select: {
      orderIndex: true,
      roundType: true,
      sentStartMessage: true,
      leagueSeasonId: true,
      games: {
        select: {
          timeIsSet: true,
          hasFixedTeams: true,
          participants: { where: { status: ParticipantStatus.PLAYING }, select: { userId: true } },
          fixedTeams: { select: { players: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!round) throw new ApiError(404, 'Round not found');
  const recipients = new Set<string>();
  for (const game of round.games) {
    for (const participant of game.participants) recipients.add(participant.userId);
    if (game.hasFixedTeams) {
      for (const team of game.fixedTeams) for (const player of team.players) recipients.add(player.userId);
    }
  }
  return {
    round,
    fixtures: round.games.length,
    unscheduled: round.games.filter((game) => !game.timeIsSet).length,
    recipients: recipients.size,
  };
}
