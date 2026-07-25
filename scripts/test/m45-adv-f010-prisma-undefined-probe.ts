// M4.5-AGENT-LOOP 对抗复核（F010 finding ①）——Prisma「数组内 undefined」机理探针
//
// 目的：不靠推理、不靠变异产品代码，直接证伪/证实 G5 §4.5 ① 声称的机理：
//   `deleteMany({ where: { gateLogId: { in: [undefined, undefined] } } })` 是否真的被 Prisma 拒绝。
//
// 只读纪律：全部用 findMany（与 deleteMany 共用同一套 args 校验管线），零写入、零删除。
// 另附对照组：空数组 / 全字符串数组 / 混入一个 undefined —— 定位拒绝的确切触发条件。
//
// 用法：node --env-file=.env --import tsx scripts/test/m45-adv-f010-prisma-undefined-probe.ts

import { prisma } from '../../src/lib/db/prisma';

type Case = { name: string; arr: unknown[] };

const cases: Case[] = [
  { name: '空数组 []（无 pending 时 createdPA 的形状）', arr: [] },
  { name: '全字符串 ["a","b"]（成功路径形状）', arr: ['a', 'b'] },
  { name: '全 undefined [undefined,undefined]（G5 声称的失败路径形状）', arr: [undefined, undefined] },
  { name: '混入一个 undefined ["a",undefined]', arr: ['a', undefined] },
];

async function main(): Promise<void> {
  console.log('[adv-f010/prisma-undefined] 只读探针（findMany，零写入）');
  for (const c of cases) {
    // shareLink.gateLogId 与 e2e finally 首句同字段同形状
    try {
      const rows = await prisma.shareLink.findMany({
        where: { gateLogId: { in: c.arr as string[] } },
        select: { id: true },
      });
      console.log(`  ✓ 通过（未抛错，命中 ${rows.length} 行） ← ${c.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-3).join(' | ') : String(e);
      console.log(`  ✗ 抛错 ← ${c.name}`);
      console.log(`      ${msg.slice(0, 300)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
