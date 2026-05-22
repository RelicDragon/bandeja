function envEnabled(raw: string | undefined, defaultOn: boolean): boolean {
  if (raw === undefined || raw === '') return defaultOn;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return v === 'true' || v === '1' || v === 'yes';
}

/** When unset, questionnaire API is enabled (dev-friendly). Set to `false` to disable all sports. */
export function isQuestionnaireEngineEnabled(): boolean {
  return envEnabled(process.env.MULTISPORT_QUESTIONNAIRE_ENGINE, true);
}

/** @deprecated Use `isQuestionnaireEngineEnabled`. Kept for existing env / tests. */
export function isTennisQuestionnaireApiEnabled(): boolean {
  if (!isQuestionnaireEngineEnabled()) return false;
  return envEnabled(process.env.MULTISPORT_QUESTIONNAIRE_TENNIS, true);
}
