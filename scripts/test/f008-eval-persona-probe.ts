// M4-INSIGHT F008 — Evaluator 探针：人格子集真实暴露 create_share_link + outbound 集合快照
import { personaToolSubset } from '../../src/lib/agent/persona-router';
import { listPersonas } from '../../src/lib/agent/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';

getNativeToolNames();
const insight = listPersonas().find((p) => p.id === 'insight')!;
const subset = personaToolSubset(insight);
console.log('insight 人格工具子集 =', subset);
console.log('含 create_share_link =', subset.includes('create_share_link'));
const t = getTool('create_share_link');
console.log('class =', t?.class, '| source =', t?.source, '| buildHarm =', typeof t?.buildHarm);
console.log(
  'outbound 集合 =',
  getNativeToolNames().filter((n) => getTool(n)?.class === 'outbound'),
);
