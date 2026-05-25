import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildBracketPlan, bracketPlanToGolden } from '../src/services/league/bracketStructure';

const outDir = path.join(__dirname, '..', 'src', 'services', 'league', '__fixtures__');
fs.mkdirSync(outDir, { recursive: true });

const ALL = Array.from({ length: 15 }, (_, i) => i + 2);

for (const n of ALL) {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const plan = buildBracketPlan(n, ids);
  const golden = bracketPlanToGolden(plan);
  fs.writeFileSync(
    path.join(outDir, `bracket-${n}.json`),
    `${JSON.stringify(golden, null, 2)}\n`
  );
}

console.log(`Wrote bracket-N.json for N in ${ALL.join(', ')}`);
