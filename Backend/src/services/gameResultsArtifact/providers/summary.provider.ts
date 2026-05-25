import { getAiService } from '../../ai/ai.service';
import { LLM_REASON } from '../../ai/llmReasons';
import { generateResultsSummary } from '../resultsSummary.service';

export class SummaryProvider {
  static isConfigured(): boolean {
    return getAiService().isConfigured();
  }

  static async generate(game: any, language: string): Promise<string> {
    return generateResultsSummary(game, language, {
      reason: LLM_REASON.RESULTS_ARTIFACTS,
    });
  }
}
