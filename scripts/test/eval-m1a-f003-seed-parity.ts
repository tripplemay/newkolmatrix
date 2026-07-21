// [Evaluator 产物] M1-A-BRIEF F003 验收探针 — seed 落库结果 vs mock/projects.ts 逐字一致性 + D14 派生值 + D5/D6/D13 schema 断言。
//
// 用途：F003 acceptance 里「id/name/game/market/owner/cur 与 mock/projects.ts:36-81 逐字一致」
// 与「budget 串解析」「goal jsonb 填满」等条目，人眼对表不算实证，这里逐字段机器比对。
//
// 运行：node --env-file=.env --import tsx scripts/test/eval-m1a-f003-seed-parity.ts
//      （或 DATABASE_URL=... node --import tsx ...）

import { prisma } from '../../src/lib/db/prisma';
import { mockProjects } from '../../src/lib/data/mock/projects';
import { parseProjectGoal } from '../../src/lib/data/schemas/project';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** D14 明文派生值（spec §3 D14 逐字抄下，不从实现反推） */
const D14_TARGET_EXPOSURE: Record<string, number> = {
  xg: 3_000_000,
  lc: 2_000_000,
  aw: 1_500_000,
  mf: 1_250_000,
};

/** mock 的 budget 串期望解析结果 */
function parseBudgetString(s: string): { amount: number; currency: string } {
  const m = /^\$([\d,]+)$/.exec(s);
  if (!m) throw new Error(`无法解析 budget 串: ${s}`);
  return { amount: Number(m[1].replace(/,/g, '')), currency: 'USD' };
}

async function main(): Promise<void> {
  console.log('=== A. schema 层断言（D5 / D6 / D13）===');

  const projCols = await prisma.$queryRaw<{ column_name: string; is_nullable: string; column_default: string | null }[]>`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_name = 'Project' ORDER BY column_name`;
  const colMap = new Map(projCols.map((c) => [c.column_name, c]));

  for (const c of ['gameId', 'goal', 'budgetTotal', 'currency', 'market', 'cur', 'maxReached']) {
    check(`Project.${c} 存在`, colMap.has(c));
  }
  check('Project 不含 status 列（D5）', !colMap.has('status'));
  check('Project 不含 health 列（D6）', !colMap.has('health'));

  // expand-contract：本批新增列一律 nullable 或带默认
  for (const c of ['gameId', 'goal', 'budgetTotal', 'currency', 'market', 'cur', 'maxReached']) {
    const col = colMap.get(c);
    const ok = !!col && (col.is_nullable === 'YES' || col.column_default !== null);
    check(`Project.${c} nullable 或带默认（expand-contract）`, ok, col ? `nullable=${col.is_nullable} default=${col.column_default ?? 'NULL'}` : '缺列');
  }

  const oplogCols = await prisma.$queryRaw<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'OperationLog'`;
  const oplogMap = new Map(oplogCols.map((c) => [c.column_name, c]));
  check('OperationLog.projectId 存在且 nullable（D13）', oplogMap.get('projectId')?.is_nullable === 'YES');
  check('OperationLog.payloadJson 存在且 nullable（D13）', oplogMap.get('payloadJson')?.is_nullable === 'YES');
  check('OperationLog.ref 仍在且未被改造（语义不变）', oplogMap.has('ref'));

  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename IN ('OperationLog','Project')`;
  const idxNames = idx.map((i) => i.indexname);
  check('OperationLog projectId 索引存在', idxNames.includes('OperationLog_projectId_idx'), idxNames.join(', '));
  check('Project gameId 索引存在', idxNames.includes('Project_gameId_idx'));

  const stage = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Stage' ORDER BY e.enumsortorder`;
  const labels = stage.map((s) => s.enumlabel);
  check(
    'Stage enum 取值与 stage-routing.ts 逐字一致',
    JSON.stringify(labels) === JSON.stringify(['brief', 'match', 'reach', 'delivery', 'insight']),
    labels.join('|'),
  );

  const fk = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conname = 'Project_gameId_fkey'`;
  check('Project.gameId → Game.id 外键存在', fk.length === 1);

  console.log('\n=== B. seed 落库 vs mock/projects.ts 逐字比对 ===');

  const rows = await prisma.project.findMany({
    include: { game: { select: { name: true } } },
  });
  check('seed 项目共 4 条', rows.length === 4, `实际 ${rows.length}`);

  for (const m of mockProjects) {
    const row = rows.find((r) => r.slug === m.id);
    if (!row) {
      check(`[${m.id}] 落库`, false, '未找到该 slug');
      continue;
    }
    console.log(`  --- ${m.id} ---`);
    check(`[${m.id}] name 逐字一致`, row.name === m.name, `db=${row.name}`);
    check(`[${m.id}] game 逐字一致`, row.game?.name === m.game, `db=${row.game?.name ?? 'NULL'} mock=${m.game}`);
    check(`[${m.id}] market 逐字一致`, row.market === m.market, `db=${row.market ?? 'NULL'}`);
    check(`[${m.id}] owner 逐字一致`, row.owner === m.owner, `db=${row.owner ?? 'NULL'}`);
    check(`[${m.id}] cur 逐字一致`, row.cur === m.cur, `db=${row.cur}`);

    const budget = parseBudgetString(m.budget);
    check(
      `[${m.id}] budget 串无损解析`,
      row.budgetTotal !== null && Number(row.budgetTotal) === budget.amount,
      `mock='${m.budget}' → db=${row.budgetTotal?.toString() ?? 'NULL'}`,
    );
    check(`[${m.id}] currency=USD`, row.currency === 'USD', `db=${row.currency ?? 'NULL'}`);

    const goal = parseProjectGoal(row.goal);
    check(`[${m.id}] goal 通过 zod schema（形状合法且填满）`, goal !== null, JSON.stringify(row.goal));
    if (goal) {
      check(
        `[${m.id}] targetExposure = D14 明文值`,
        goal.targetExposure === D14_TARGET_EXPOSURE[m.id],
        `db=${goal.targetExposure} spec=${D14_TARGET_EXPOSURE[m.id]}`,
      );
      check(
        `[${m.id}] period 非空且 start < end`,
        goal.periodStart < goal.periodEnd,
        `${goal.periodStart} → ${goal.periodEnd}`,
      );
    }
    check(
      `[${m.id}] goal 不含预算字段（D6 单一真相）`,
      typeof row.goal === 'object' && row.goal !== null && !('budget' in (row.goal as object)) && !('budgetTotal' in (row.goal as object)),
    );
    check(`[${m.id}] gameId 非空（FK 不悬空）`, row.gameId !== null);
    check(`[${m.id}] D2 不变量 cur <= maxReached`, ['brief', 'match', 'reach', 'delivery', 'insight'].indexOf(row.cur) <= ['brief', 'match', 'reach', 'delivery', 'insight'].indexOf(row.maxReached), `cur=${row.cur} max=${row.maxReached}`);
  }

  console.log('\n=== C. health 未落库（D6）===');
  const rawRow = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "Project" LIMIT 1`;
  check('Project 行无 health 字段', rawRow.length > 0 && !('health' in rawRow[0]), Object.keys(rawRow[0] ?? {}).join(','));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (e) => {
    console.error('探针异常：', e);
    await prisma.$disconnect();
    process.exit(2);
  });
