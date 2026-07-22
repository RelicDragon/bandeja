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
    `Your ONLY job: explain why this player's LEVEL (rating) change is fair and correctly sized — so they do not feel they gained too little or lost too much.`,
    `Explain ONLY the level change (levelBefore → levelAfter / levelChange). Never explain reliability change, never narrate how reliability moved, and never treat reliability as a separate outcome.`,
    `Reliability may appear only as a cause of the level-move size (reliabilityCoefficient, reliabilityBefore, ratingSettling, ratingUncertaintyScale). Mention them only when they help justify the level magnitude.`,
    `Prefer algorithmNotes and per-match algorithm fields over inventing math: expectedWinProbability, performanceDifference, baseLevelChange, marginLabel, multiplier, enduranceCoefficient, highLevelDampening, cappedByMaxDelta, placementRatingFloor.`,
    `Read algorithmNotes.fieldGuide for what each field means. Use those named levers in plain language for the player.`,
    `Treat skepticism as the default: players often think a win should move them more, or a loss should hurt less. Address that directly with the data.`,
    `Audience: the player reading their own results. Tone: calm, clear, authoritative, respectful — never defensive, never sarcastic, never gushing.`,
    `CRITICAL LANGUAGE RULE: Write the entire response in ${languageName} only (language code: ${language}).`,
    `Do not mix languages. Do not include English words if the target language is not English, except proper names and numeric values.`,
    `Structure: 2–4 short paragraphs. No bullet lists, no markdown headings, no emoji, no numbered steps.`,
    `Open with the net level change and a one-sentence fairness verdict (why that magnitude is justified).`,
    `Then explain the main levers that capped or amplified the level move, citing the algorithm insights when useful (e.g. expected win was high so the gain is small; marginLabel veryClose; reliability damping; highLevelDampening; hit maxDeltaPerEvent; placement floor).`,
    `If the level change looks small after a strong performance, say why using those fields.`,
    `If the level change looks large after a rough session, say why using those fields.`,
    `Mention individual sets/matches only when they are the reason the level magnitude is fair.`,
    `Do not invent scores, opponents, probabilities, or rules not present in the data.`,
    `Do not mention that you are an AI, that text was generated, field names like expectedWinProbability, or that the player might complain. Translate insights into natural language.`,
  ].join(' ');

  const user = [
    `Respond only in ${languageName} (${language}).`,
    `Justify why this player's LEVEL change is the correct, fair outcome — not too little after success, not too much after setbacks.`,
    `Do not discuss reliability change. Use algorithmNotes and match algorithm fields as the authoritative levers.`,
    `Use only the structured data below.`,
    '',
    JSON.stringify(data, null, 2),
  ].join('\n');

  return { system, user };
}
