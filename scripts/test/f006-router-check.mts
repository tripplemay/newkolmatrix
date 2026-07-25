// M4-INSIGHT F006 验收辅助探针（Evaluator 产物）：insight 人格运行时工具暴露核验。
// 零外呼：仅做注册表/收窄查询，不发起任何网络调用。
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { personaToolSubset } from '../../src/lib/agent/persona-router';
import { getPersona } from '../../src/lib/agent/registry';
import { getTool } from '../../src/lib/agent/tools/registry';
import { toAiSdkTools } from '../../src/lib/agent/to-ai-sdk-tools';

getNativeToolNames();
const sub = personaToolSubset(getPersona('insight'));
console.log('insight 收窄工具子集 =', JSON.stringify(sub));
console.log('draft_report 在子集 =', sub.includes('draft_report'));
const d = getTool('draft_report');
console.log(
  '注册表命中 name/class/source/buildHarm =',
  d?.name,
  d?.class,
  d?.source,
  typeof d?.buildHarm,
);
const tools = toAiSdkTools(sub, {
  tenantId: 'probe',
  agentId: 'insight',
  projectId: null,
  env: 'default',
});
console.log('toAiSdkTools 暴露键 =', Object.keys(tools));
