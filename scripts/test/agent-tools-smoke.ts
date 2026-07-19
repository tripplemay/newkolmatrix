// AGENT-FOUNDATION F005 — 工具层 smoke（柱一，直调 executeTool，不经 HTTP）
//
// 证明：唯一执行入口 executeTool 经 zod 校验 + class 分流执行 search_kols / get_kol_detail；
// 未知工具 / 空入参 / outbound 门控 均按契约行为。
//
// 运行：npm run agent:smoke  （= node --env-file=.env --import tsx scripts/test/agent-tools-smoke.ts）
// 退出码：0 = 全部断言通过；1 = 任一失败。

import { executeTool, OutboundGateError } from '../../src/lib/agent/execute';
import { registerTool, getTool } from '../../src/lib/agent/tools/registry';
import { buildToolContext } from '../../src/lib/agent/context';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { prisma } from '../../src/lib/db/prisma';
import { z } from 'zod';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main(): Promise<void> {
  console.log('[agent-smoke] 工具层 executeTool 验证开始');
  const ctx = await buildToolContext();

  // 注册表 + 二分
  const names = getNativeToolNames();
  assert(names.includes('search_kols') && names.includes('get_kol_detail'), 'native 工具已注册');
  assert(getTool('search_kols')?.class === 'internal', 'search_kols class=internal');
  assert(getTool('search_kols')?.source === 'native', 'search_kols source=native');

  // search_kols
  const search = (await executeTool('search_kols', { query: '坦克世界 World of Tanks 游戏解说', topK: 5 }, ctx))
    .output as { count: number; kols: Array<{ id: string; displayName: string | null; similarity: number }> };
  assert(search.count > 0 && search.kols.length === search.count, `search_kols 返回 ${search.count} 条`);
  assert(
    search.kols.every((k, i) => i === 0 || search.kols[i - 1].similarity >= k.similarity),
    'search_kols 按 similarity 降序',
  );
  console.log(`  · top1: ${search.kols[0].displayName} (sim=${search.kols[0].similarity})`);

  // get_kol_detail
  const detail = (await executeTool('get_kol_detail', { idOrPublicId: search.kols[0].id }, ctx))
    .output as { found: boolean };
  assert(detail.found === true, 'get_kol_detail 命中 search 结果的 id');

  // zod 校验：空 query 应被拦
  let zodErr = false;
  try {
    await executeTool('search_kols', { query: '' }, ctx);
  } catch {
    zodErr = true;
  }
  assert(zodErr, 'executeTool 对非法入参（空 query）抛错（zod 校验生效）');

  // 未知工具
  let unknownErr = false;
  try {
    await executeTool('no_such_tool', {}, ctx);
  } catch {
    unknownErr = true;
  }
  assert(unknownErr, 'executeTool 对未知工具抛错');

  // outbound 门控：临时注册一个 outbound 工具，executeTool 应在执行副作用前抛 OutboundGateError
  let sideEffect = false;
  registerTool({
    name: '__smoke_outbound__',
    description: 'smoke 用临时 outbound 工具',
    class: 'outbound',
    source: 'native',
    inputSchema: z.object({}),
    execute: async () => {
      sideEffect = true;
      return {};
    },
  });
  let gated = false;
  try {
    await executeTool('__smoke_outbound__', {}, ctx);
  } catch (e) {
    gated = e instanceof OutboundGateError;
  }
  assert(gated, 'outbound 工具经 executeTool 被门控（抛 OutboundGateError）');
  assert(sideEffect === false, 'outbound 工具的副作用未被执行（门控在 execute 前）');

  console.log('[agent-smoke] ✅ 全部断言通过');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[agent-smoke] ❌ 失败：', err instanceof Error ? (err.stack ?? err.message) : err);
    await prisma.$disconnect();
    process.exit(1);
  });
