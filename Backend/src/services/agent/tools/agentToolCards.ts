/**
 * Rich result cards (plan §16.6 slice 9e): the optional `card` a read tool attaches for the app
 * (`tool.finished.card`, `tool_result.card`) and the `card` of an action preview. Built from
 * server data only; never part of the model-facing JSON (`data`).
 *
 * Pure helpers live here so they can be unit tested; each tool builds its own card from them.
 */
import type {
  AgentToolCard,
  AgentWeatherCardHour,
  AgentWeatherVerdict,
} from '@bandeja/shared/agentContract';
import { classifyWeatherRisk, type WeatherRiskHour, type WeatherRiskSeverity } from '../../weather/weatherRisk';
import type { AgentToolResult } from './registry';

/** A tool result with its rich card. The run loop copies `card` to the event and the block. */
export type AgentToolResultWithCard = AgentToolResult & { card?: AgentToolCard };

export function withToolCard(result: AgentToolResult, card: AgentToolCard | null | undefined): AgentToolResultWithCard {
  return card ? { ...result, card } : result;
}

/** Strips the card from what the model sees (a preview is echoed back to the model). */
export function previewForModel<T extends { card?: unknown; linesInCard?: unknown }>(preview: T): Omit<T, 'card' | 'linesInCard'> {
  const rest: Partial<T> = { ...preview };
  delete rest.card;
  delete rest.linesInCard;
  return rest as Omit<T, 'card' | 'linesInCard'>;
}

// --- weather -----------------------------------------------------------------------------------

/** Padel hours for a day card (local): 06:00 through 23:00. */
export const WEATHER_CARD_FIRST_HOUR = 6;
export const WEATHER_CARD_LAST_HOUR = 23;
/** A best window shorter than this is no hint. */
const BEST_WINDOW_MIN_HOURS = 2;

export function isPlayableHour(hour: WeatherRiskHour): boolean {
  return classifyWeatherRisk([hour]).severity === 'none';
}

export function verdictForSeverity(severity: WeatherRiskSeverity): Exclude<AgentWeatherVerdict, 'indoor'> {
  if (severity === 'none') return 'good';
  if (severity === 'likely') return 'risky';
  return 'bad';
}

/**
 * Longest run of consecutive playable hours (≥ 2 h). `end` is the hour after the run's last
 * hour (`HH:mm`, "24:00" after 23:00). null when no run is long enough or every hour is
 * playable (the verdict already says "good").
 */
export function bestPlayableWindow(hours: readonly AgentWeatherCardHour[]): { start: string; end: string } | null {
  let best: { from: number; to: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= hours.length; i += 1) {
    const playable = i < hours.length && hours[i].playable;
    if (playable && runStart < 0) runStart = i;
    if (!playable && runStart >= 0) {
      if (!best || i - runStart > best.to - best.from) best = { from: runStart, to: i };
      runStart = -1;
    }
  }
  if (!best || best.to - best.from < BEST_WINDOW_MIN_HOURS || best.to - best.from === hours.length) return null;
  const last = hours[best.to - 1].time;
  const [h, m] = last.split(':').map(Number);
  const end = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { start: hours[best.from].time, end };
}
