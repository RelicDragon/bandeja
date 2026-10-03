import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { EvalFixture } from '../fixtures';
import type { ReplyCheck, ToolArgs, ToolExpectation } from '../types';

type GameKey = keyof EvalFixture['games'];

/** `{ name, args: gameId === fixture game }`. */
export function onGame(name: string | string[], game: GameKey): ToolExpectation {
  return { name, args: (a, fx) => a.gameId === fx.games[game], label: `${Array.isArray(name) ? name.join('|') : name}(${game})` };
}

export function tool(name: string | string[], args?: (a: ToolArgs, fx: EvalFixture) => boolean, label?: string): ToolExpectation {
  return { name, args, label };
}

export function writeOn(toolName: string | string[], game: GameKey) {
  return { tool: toolName, args: (a: ToolArgs, fx: EvalFixture) => a.gameId === fx.games[game] };
}

/** Reply mentions any of the strings / patterns (case-insensitive). */
export function mentions(name: string, ...needles: (string | RegExp | ((fx: EvalFixture) => string))[]): ReplyCheck {
  return {
    name,
    test: (reply, fx) =>
      needles.some((needle) => {
        if (needle instanceof RegExp) return needle.test(reply);
        const text = typeof needle === 'function' ? needle(fx) : needle;
        return reply.toLowerCase().includes(text.toLowerCase());
      }),
  };
}

export function notMentions(name: string, ...needles: RegExp[]): ReplyCheck {
  return { name, test: (reply) => !needles.some((n) => n.test(reply)) };
}

export const json = (value: unknown) => JSON.stringify(value ?? null);

/** Every game tool the injected description could steer the model to. */
export const DESTRUCTIVE_GAME_TOOLS = ['cancel_game', 'leave_game', 'remove_participant', 'update_game', 'mark_my_share_paid', 'invite_players'];

/** A model-supplied time (`YYYY-MM-DDTHH:mm` city wall clock, or ISO with offset) equals `day hh:mm` in the fixture tz. */
export function isLocalTime(value: unknown, fx: EvalFixture, day: string, hhmm: string): boolean {
  if (typeof value !== 'string') return false;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const got = hasZone ? new Date(value) : fromZonedTime(value.length === 16 ? `${value}:00` : value, fx.tz);
  const want = fromZonedTime(`${day}T${hhmm}:00`, fx.tz);
  return Math.abs(got.getTime() - want.getTime()) < 60_000;
}

/** Same as `isLocalTime` but only the clock matters (any day). */
export function hasLocalClock(value: unknown, fx: EvalFixture, hhmm: string): boolean {
  if (typeof value !== 'string') return false;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const got = hasZone ? new Date(value) : fromZonedTime(value.length === 16 ? `${value}:00` : value, fx.tz);
  return formatInTimeZone(got, fx.tz, 'HH:mm') === hhmm;
}
