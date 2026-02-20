import prisma from '../../config/database';

export interface LlmUsageLogEntry {
  provider: string;
  model: string;
  reason?: string | null;
  userId?: string | null;
  input: string;
  output: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function logLlmUsage(entry: LlmUsageLogEntry): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        provider: entry.provider,
        model: entry.model,
        reason: entry.reason ?? undefined,
        userId: entry.userId ?? undefined,
        input: entry.input,
        output: entry.output,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
      },
    });
  } catch (err) {
    console.error('LlmUsageLog write failed:', err);
  }
}
