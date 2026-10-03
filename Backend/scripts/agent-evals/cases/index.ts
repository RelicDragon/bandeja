import type { EvalFixture } from '../fixtures';
import type { EvalCase } from '../types';
import { bookingCases, leagueCases, moneyCases, resultsCases, weatherCases, webCases } from './domain';
import { memoryCases, multiCases, safetyCases } from './memorySafety';
import { readCases } from './reads';
import { writeCases } from './writes';

export function buildEvalCases(fx: EvalFixture): EvalCase[] {
  const all = [readCases, writeCases, bookingCases, moneyCases, leagueCases, resultsCases, weatherCases, webCases, memoryCases, safetyCases, multiCases].flatMap((factory) => factory(fx));
  const seen = new Set<string>();
  for (const testCase of all) {
    if (seen.has(testCase.id)) throw new Error(`duplicate eval case id ${testCase.id}`);
    seen.add(testCase.id);
  }
  return all;
}
