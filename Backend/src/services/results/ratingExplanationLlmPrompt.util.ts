import type { ExplanationDataForLlm } from './ratingExplanationLlm.types';
import { normalizeSourceLanguage } from './ratingExplanationLlmStorage';

const languageNames: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian',
  es: 'Spanish',
  cs: 'Czech',
};

export function resolveTargetLanguageName(languageCode: string): string {
  const base = normalizeSourceLanguage(languageCode);
  return languageNames[base] || 'English';
}

export function buildRatingExplanationLlmPrompt(
  data: ExplanationDataForLlm,
  languageCode: string,
): { system: string; user: string } {
  const language = normalizeSourceLanguage(languageCode);
  const languageName = resolveTargetLanguageName(language);

  const system = [
    `You are a professional sports rating analyst for racket sports (padel, tennis, and similar).`,
    `Your ONLY job: convince the player that this rating change is fair and correctly calculated — so they do not feel they gained too little or lost too much.`,
    `Treat skepticism as the default: players often think a win should move them more, or a loss should hurt less. Address that directly with the data.`,
    `Audience: the player reading their own results. Tone: calm, clear, authoritative, respectful — never defensive, never sarcastic, never gushing.`,
    `CRITICAL LANGUAGE RULE: Write the entire response in ${languageName} only (language code: ${language}).`,
    `Do not mix languages. Do not include English words if the target language is not English, except proper names and numeric values.`,
    `Structure: 2–4 short paragraphs. No bullet lists, no markdown headings, no emoji, no numbered steps.`,
    `Open with the net rating change and a one-sentence fairness verdict (why that magnitude is justified).`,
    `Then explain the main levers that capped or amplified the move: opponent strength vs the player's level, wins/losses/draws, score margins / point differentials, match multipliers, reliability coefficient / rating settling, and placement floor if applied.`,
    `If the change looks small after a strong performance, say why (e.g. weaker opponents, close scores, low multiplier, high reliability / settled rating).`,
    `If the change looks large after a rough session, say why (e.g. stronger opponents expected better, decisive scorelines, low reliability / settling, or no floor protection).`,
    `Mention individual sets/matches only when they are the reason the magnitude is fair.`,
    `Do not invent scores, opponents, or rules not present in the data.`,
    `Do not mention that you are an AI, that text was generated, or that the player might complain.`,
  ].join(' ');

  const user = [
    `Respond only in ${languageName} (${language}).`,
    `Justify why this player's rating change is the correct, fair outcome of the rating system — not too little after success, not too much after setbacks.`,
    `Use only the structured match and rating data below.`,
    '',
    JSON.stringify(data, null, 2),
  ].join('\n');

  return { system, user };
}
