// M4.5-AGENT-LOOP 验收证据打印器（Evaluator G2 组）
//
// 用途：把 tests/integration/m45-g2-evaluator-probe.test.ts 里的断言**实际观测值**打印出来，
// 供验收报告摘录——「断言绿」与「观测值是我以为的那个」是两件事，后者要肉眼可见。
//
// 前置：本地 Postgres（DATABASE_URL）。零外呼（mock model + fetch 哨兵）。
// 运行：node --env-file=.env --import tsx scripts/test/m45-g2-evidence.ts
// 夹具租户 test-tenant-m45-g2ev-<pid>，脚本结束自清（并行验收互不踩踏）。

import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { listPersonas, getPersona } from '../../src/lib/agent/registry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import { runScriptedLoop } from '../../tests/support/agent-loop-testbed';

const SLUG = `test-tenant-m45-g2ev-${process.pid}`;

const HONESTY_ANCHORS = [
  '工具真实返回成功',
  '当前版本还不支持',
  '建议就是建议',
  '不得虚构任务表',
];

async function main(): Promise<void> {
  getNativeToolNames();
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'M4.5 G2 证据夹具' },
  });
  const tenantId = tenant.id;
  const project = await prisma.project.create({
    data: { tenantId, name: 'G2 证据项目' },
  });
  const ctx: ToolContext = {
    tenantId,
    agentId: 'orchestrator',
    projectId: project.id,
    env: 'default',
  };

  try {
    console.log('\n=== [1] 逐人格步数预算实测（打不住的模型） ===');
    console.log(
      'persona        registry.maxSteps  loop.maxSteps  实际步数  finishReason  出网',
    );
    for (const p of listPersonas()) {
      const run = await runScriptedLoop({
        copilot: {
          route: '/admin',
          projectId: null,
          env: 'default',
          agentId: p.id,
        },
        ctx: { ...ctx, agentId: p.id },
        prompt: '一直干活别停',
        script: [],
        fallbackStep: {
          toolCalls: [{ toolName: 'get_kol_detail', input: {} }],
        },
      });
      console.log(
        `${p.id.padEnd(14)} ${String(p.maxSteps).padEnd(18)} ${String(
          run.loop.maxSteps,
        ).padEnd(14)} ${String(run.steps).padEnd(9)} ${String(
          run.finishReason,
        ).padEnd(13)} ${run.networkCalls.length}`,
      );
    }

    console.log('\n=== [2] 9 步长链（第 1 步接力 orchestrator→insight） ===');
    const shareCall = {
      toolCalls: [
        { toolName: 'create_share_link', input: { scope: 'quarterly' } },
      ],
    };
    const long = await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: null,
        env: 'default',
        agentId: 'orchestrator',
      },
      ctx,
      prompt: '这季度的东西交给洞察全部准备好',
      script: [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'g2ev-ref',
                summary: '请洞察接手做季度复盘',
              },
            },
          ],
        },
        ...Array.from({ length: 7 }, () => shareCall),
        { text: '7 份分享都已备好，全部停在你确认前。' },
      ],
    });
    console.log(`步数=${long.steps} finishReason=${long.finishReason}`);
    console.log(`工具序列=${JSON.stringify(long.toolNames)}`);
    console.log(
      `人格切换事件=${JSON.stringify(
        long.personaSwitches,
      )}（遥测 personaSwitches=${
        (await long.loop.telemetry)?.personaSwitches
      }, finalAgentId=${(await long.loop.telemetry)?.finalAgentId}）`,
    );
    long.systemPerStep.forEach((sys, i) => {
      const missing = HONESTY_ANCHORS.filter((a) => !sys.includes(a));
      const who = sys.includes(getPersona('insight').duty)
        ? 'insight'
        : sys.includes(getPersona('orchestrator').duty)
        ? 'orchestrator'
        : '?';
      console.log(
        `  step${i + 1} system: 当值=${who} 诚实锚点缺失=${
          missing.length === 0 ? '无' : missing.join(',')
        } 重读条款=${sys.includes('不要采信交接摘要') ? '有' : '无'} 长度=${
          sys.length
        }`,
      );
    });
    const pendings = long.toolOutputs.filter(
      (o) => (o.output as { status?: string })?.status === 'pending',
    );
    console.log(
      `pending 信封数=${
        pendings.length
      } / ShareLink 落库数=${await prisma.shareLink.count({
        where: { tenantId },
      })} / 出网=${long.networkCalls.length}`,
    );

    console.log('\n=== [3] 接力负面（隔离绕过尝试） ===');
    const chain = await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: null,
        env: 'default',
        agentId: 'orchestrator',
      },
      ctx,
      prompt: '一路转包 + 越权',
      script: [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'g2ev-chain',
                summary: '交给洞察',
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'delivery',
                artifactType: 'deal',
                artifactRef: 'g2ev-chain2',
                summary: '再转交付',
              },
            },
            { toolName: 'payout', input: { dealId: 'g2ev-no-such' } },
            { toolName: 'create_project', input: { name: '越权建项目' } },
          ],
        },
        { text: '结束。' },
      ],
    });
    console.log(`第 2 步（当值 insight）越权尝试的报错：`);
    for (const e of chain.toolErrors) {
      console.log(`  - ${e.toolName}: ${e.error.slice(0, 160)}`);
    }
    console.log(
      `Handoff 落行数=${await prisma.handoff.count({
        where: { tenantId },
      })}（期望 1：链式接力被拒）`,
    );
    console.log(
      `payout PendingAction=${await prisma.pendingAction.count({
        where: { tenantId, toolName: 'payout' },
      })} / Project 数=${await prisma.project.count({
        where: { tenantId },
      })}（期望 0 / 1）`,
    );
    console.log(
      `第 2 步模型可见工具=${JSON.stringify(chain.visibleToolsPerStep[1])}`,
    );

    console.log('\n=== [4] 接力后 pending 的归属人格（审计链路观察） ===');
    const pas = await prisma.pendingAction.findMany({
      where: { tenantId, toolName: 'create_share_link' },
      select: { id: true, agentId: true, toolName: true, status: true },
      take: 3,
    });
    for (const pa of pas) {
      console.log(
        `  PendingAction ${pa.toolName} status=${pa.status} agentId=${pa.agentId}` +
          `（当值人格是 insight，起始人格是 orchestrator）`,
      );
    }
    const telemetryRows = await prisma.operationLog.findMany({
      where: { tenantId, kind: 'auto' },
      select: { summary: true, payloadJson: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    for (const row of telemetryRows) {
      console.log(
        `  OperationLog(auto) ${row.summary} :: ${JSON.stringify(
          row.payloadJson,
        )}`,
      );
    }

    console.log('\n=== [5] 副作用核证（夹具租户内） ===');
    for (const [name, n] of [
      ['ShareLink', await prisma.shareLink.count({ where: { tenantId } })],
      [
        'PendingAction',
        await prisma.pendingAction.count({ where: { tenantId } }),
      ],
      ['Handoff', await prisma.handoff.count({ where: { tenantId } })],
      [
        'OperationLog',
        await prisma.operationLog.count({ where: { tenantId } }),
      ],
      ['Payout', await prisma.payout.count({ where: { tenantId } })],
    ] as Array<[string, number]>) {
      console.log(`  ${name.padEnd(14)} ${n}`);
    }
  } finally {
    await prisma.shareLink.deleteMany({ where: { tenantId } });
    await prisma.handoff.deleteMany({ where: { tenantId } });
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.pendingAction.deleteMany({ where: { tenantId } });
    await prisma.project.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    console.log('\n[清态] 夹具租户已删除');
    await prisma.$disconnect();
  }
}

void main();
