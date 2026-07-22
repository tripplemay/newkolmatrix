// M2-A-MATCH F001 验收 — Evaluator 独立边界探测（单测之外）
import { parsePlanMetrics, parseDoubts, assertPlanKolReasons, matchPlanStatusSchema } from '../../src/lib/data/schemas/match';

// 1. 额外未知键（jsonb 演进容忍）
console.log('extra keys:', JSON.stringify(parsePlanMetrics({ reachTotal: 100, budgetUsd: null, risk: 'low', people: 3, futureField: 'x' })));
// 2. people 非整数 → 降级 null
console.log('people 3.5 →', parsePlanMetrics({ reachTotal: 1, budgetUsd: null, risk: null, people: 3.5 }));
// 3. people 负数 → 降级 null
console.log('people -1 →', parsePlanMetrics({ reachTotal: 1, budgetUsd: null, risk: null, people: -1 }));
// 4. reasons 非串条目 → 抛错
try { assertPlanKolReasons([42 as unknown as string]); console.log('reasons [42]: NOT thrown ✗'); } catch { console.log('reasons [42]: thrown ✓'); }
// 5. doubts 嵌套脏 → null
console.log('doubts [[..]] →', parseDoubts([['nested']]));
// 6. 枚举大小写敏感（Draft ≠ draft）
console.log('status Draft →', matchPlanStatusSchema.safeParse('Draft').success);
