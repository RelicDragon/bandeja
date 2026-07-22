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
    `Write a polished, confident explanation of why this player's rating changed after the game.`,
    `Audience: the player reading their own results. Tone: modern, clear, professional — not gushing, not sarcastic.`,
    `CRITICAL LANGUAGE RULE: Write the entire response in ${languageName} only (language code: ${language}).`,
    `Do not mix languages. Do not include English words if the target language is not English, except proper names and numeric values.`,
    `Structure: 2–4 short paragraphs. No bullet lists, no markdown headings, no emoji, no numbered steps.`,
    `Lead with the overall rating move and the main drivers (results vs opponents, score margins, reliability / settling if relevant).`,
    `Mention decisive sets/matches only when they meaningfully shaped the change.`,
    `If a placement rating floor capped a drop, explain that briefly and factually.`,
    `Do not invent scores, opponents, or rules not present in the data.`,
    `Do not mention that you are an AI or that this text was generated.`,
  ].join(' ');

  const user = [
    `Respond only in ${languageName} (${language}).`,
    'Explain this rating change using the structured match data below.',
    '',
    JSON.stringify(data, null, 2),
  ].join('\n');

  return { system, user };
}
