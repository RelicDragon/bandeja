import { ApiError } from '../../utils/ApiError';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON, LlmReason } from '../ai/llmReasons';
import { TranslationService } from '../chat/translation.service';
import { buildResultsSummaryPrompt } from './resultsSummaryPrompt.util';

const languageNames: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian',
  es: 'Spanish',
  cs: 'Czech',
};

export async function generateResultsSummary(
  game: any,
  language: string,
  options?: { reason?: LlmReason; initiatedByUserId?: string }
): Promise<string> {
  const ai = getAiService();
  if (!ai.isConfigured()) {
    throw new ApiError(503, 'AI service is not configured');
  }

  const languageCode = TranslationService.extractLanguageCode(language);
  const targetLanguageName = languageNames[languageCode] || 'English';
  const prompt = await buildResultsSummaryPrompt(game, language);
  const reason = options?.reason ?? LLM_REASON.TELEGRAM_RESULTS;

  try {
    return await ai.createCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a friendly sports commentator. Write summaries in ${targetLanguageName} in an informal, fun way for a group of friends.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      reason,
      userId: options?.initiatedByUserId,
    });
  } catch (error: unknown) {
    console.error('AI summary generation error:', error);
    throw new ApiError(503, 'Failed to generate summary. Please try again later.');
  }
}
