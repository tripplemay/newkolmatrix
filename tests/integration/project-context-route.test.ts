// M4.6-CTX F001 fixing round1 — 真 route 路径核实（D1）
//
// 【为什么单独一个文件】本文件用 vi.mock 在模块层替换 chatModel / buildToolContext，
// 会影响整个文件的模块初始化；与 project-context-injection.test.ts 的服务层用例分开放，
// 免得 mock 语义外溢到那些不需要它的用例。
//
// 【补的是什么洞】首轮验收 D1：acceptance 明写「集成测经真 route 路径核实注入生效」，
// 但交付的 9 条用例**全部直接驱动 runAgentLoop**（服务层），无一经过
// `src/app/api/agent/route.ts` 的 POST —— 而把客户端 `body.context.projectId` 变成
// `copilot.projectId` 的正是 route 里的 `resolveContext`（未导出、零用例）。
// 判据：framework/patterns/testing-env-patterns.md §8「服务层测试 ≠ HTTP 链测试」，
// 以及仓内同族先例 m45-evaluator-loop-probe.test.ts（M4.5 F001 同样的问题）。
//
// 断言对象是**模型那一步实际收到的 system 正文**（读 mock provider 的 doStreamCalls），
// 不是我们以为拼进去的东西。零外呼（fetch 哨兵）、零真实副作用、夹具按 pid 隔离。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { prisma } from '../../src/lib/db/prisma';
import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';
import {
  NO_ASK_PROJECT_CLAUSE,
  PROJECT_CONTEXT_HEADING,
} from '../../src/lib/agent/project-context';
import {
  STAGE_HINT_HEADING,
  STAGE_HINT_NOT_A_LIMIT,
} from '../../src/lib/agent/stage-hint';
import { getPersona } from '../../src/lib/agent/registry';

/** vi.mock 工厂被提升到文件顶部 → 支点必须走 vi.hoisted。 */
const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as unknown[],
  models: [] as Array<{ doStreamCalls: unknown[] }>,
  /** 本次请求触发的遥测落库 promise（S-RV3-3 同步点，见下方 vi.mock 头注）。 */
  telemetryWrites: [] as Array<Promise<unknown>>,
  /** 其中已 settle 的条数——用来证明同步点真的等到了（而非「碰巧落得快」）。 */
  telemetrySettled: 0,
}));

/* ── 遥测落库同步点（S-RV3-3 携带，M4.8-HARDEN F001）───────────────────────
   遥测是 fire-and-forget：loop 的 onEnd 里 `void logLoopTelemetry(...)`，落库发生在
   POST 返回**之后**的几毫秒内。runScriptedLoop 已把等待下沉到测试床（`if
   (!opts.telemetryWriter) await loop.telemetry`），但本文件走的是**真 route POST**
   ——route 不暴露 loop.telemetry 句柄，那条下沉点覆盖不到。后果与 S-RV2-10 同族：
   afterAll 删租户跑赢落库 → 留一行 tenantId 指向已不存在租户的孤儿 OperationLog，
   而残留断言（跑在删除之后、落库之前）照样绿 —— 「已清干净」的假信心。

   做法：包一层 logLoopTelemetry **只做观测**（真实现照常执行，默认 writer 照常落库），
   把每次调用的 promise 收集起来，postAgent 返回前 await 干净。
   **镜像测试床的条件语义**：注入了自定义 writer 的调用不进队列（那种调用不落库，
   没有孤儿行可言；无条件等会把「writer 永不 resolve 也不阻塞会话」类用例变成死等）。 */
vi.mock('../../src/lib/agent/loop-telemetry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/loop-telemetry')>();
  return {
    ...actual,
    logLoopTelemetry: (
      ...args: Parameters<typeof actual.logLoopTelemetry>
    ): Promise<boolean> => {
      const p = actual.logLoopTelemetry(...args);
      // args[2] = 注入的 writer；缺省（走默认 writer 真落库）才需要等。
      if (args[2] === undefined) {
        seam.telemetryWrites.push(
          p.then((r) => {
            seam.telemetrySettled += 1;
            return r;
          }),
        );
      }
      return p;
    },
  };
});

// route → runAgentLoop 不带 model / ctx（那正是真实请求路径），故从模块层替换。
// 被测对象仍是产品的 route + loop 装配本体。
vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return {
    ...actual,
    chatModel: () => {
      const m = scriptedModel(seam.script as ScriptedStep[], {
        text: '（脚本用尽）',
      });
      seam.models.push(m as unknown as { doStreamCalls: unknown[] });
      return m;
    },
  };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/context')>();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { POST } from '../../src/app/api/agent/route';

const FIXTURE_SLUG = `test-tenant-m46-route-${process.pid}`;
const PROJECT_NAME = `m46-route-项目-${process.pid}`;

let tenantId: string;
let projectId: string;

/** 取一次 provider 调用实际收到的 system 正文。 */
function systemOf(call: unknown): string {
  const prompt = (call as { prompt: LanguageModelV4CallOptions['prompt'] })
    .prompt;
  const first = prompt.find((m) => m.role === 'system');
  if (!first) return '';
  const content = (first as { content: unknown }).content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

async function postAgent(body: unknown, script: ScriptedStep[]) {
  seam.script = script;
  seam.models = [];
  seam.telemetryWrites = [];
  seam.telemetrySettled = 0;
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text(); // 读完 = 流走完
    // 遥测落库同步点：流走完 ≠ 遥测已落库（fire-and-forget）。等干净再让用例往下走，
    // 否则 afterAll 的删除会与落库赛跑（详见文件顶部 vi.mock 头注）。
    // logLoopTelemetry 内部 catch 落库异常后仍 resolve，故此处不会挂死。
    await Promise.all(seam.telemetryWrites);
    // pending 必须在**同步点之后、返回之前**这一刻量：这正是用例继续往下跑
    // （乃至 afterAll 开删）的时刻。摘掉上面那句 await，此处即量到未落库的条数。
    return {
      telemetryWrites: seam.telemetryWrites.length,
      pendingTelemetry: seam.telemetryWrites.length - seam.telemetrySettled,
      status: res.status,
      agentIdHeader: res.headers.get('X-Agent-Id'),
      text,
      systems: (seam.models[0]?.doStreamCalls ?? []).map(systemOf),
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: `M4.6 route 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: PROJECT_NAME },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: 'orchestrator',
    projectId,
    env: 'default',
  } satisfies ToolContext;
});

afterAll(async () => {
  // 【软引用无 FK】OperationLog / Handoff 对 Tenant 只有 @@index，删租户**不级联**——
  // 漏清即留孤儿行（首轮验收 D3 实测：每跑泄 2 log + 1 handoff）。故逐表按 tenantId 清，
  // 并断言残留为 0（只断言 tenant 残留 = 假信心）。
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, handoffs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.handoff.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: FIXTURE_SLUG } }),
  ]);
  expect(
    { logs, handoffs, pas, projects, tenants },
    '夹具残留（含软引用表）',
  ).toEqual({ logs: 0, handoffs: 0, pas: 0, projects: 0, tenants: 0 });
});

describe('真 route POST /api/agent —— 项目上下文注入（D1）', () => {
  // ── S-RV3-3 携带（M4.8-HARDEN F001）────────────────────────────────────
  // 光有 postAgent 里那句 await 是「注释级保证」——这条让同步点一旦丢失就有东西会红。
  //
  // 【断言对象为什么是 pendingTelemetry 而不是 OperationLog 行数】先写的是
  // 「返回后行数 > 返回前」，实测**摘掉那句 await 照样 3/3 全绿**——插入本来就常常
  // 赢过后面那个 count，行数断言测不出同步点在不在（正是断言强度分级里「看似行为级、
  // 实则测了别的东西」那一类）。改成钉**同步点自身的机械事实**：postAgent 返回时刻，
  // 本请求收集到的遥测 promise 必须全部已 settle，pending 恒为 0。
  it('遥测同步点：postAgent 返回时本请求的遥测落库已 settle（S-RV3-3）', async () => {
    const before = await prisma.operationLog.count({ where: { tenantId } });
    const r = await postAgent(
      {
        prompt: '遥测同步点探针',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
        },
      },
      [{ text: '好的。' }],
    );
    expect(r.status).toBe(200);
    expect(
      r.telemetryWrites,
      '本请求应有一次走默认 writer 的遥测落库（无则同步点无从谈起，也说明观测缝没接上）',
    ).toBeGreaterThan(0);
    expect(
      r.pendingTelemetry,
      'postAgent 返回时仍有遥测未落库 → afterAll 删租户会与它赛跑（留 tenantId 指向已删租户的孤儿行）',
    ).toBe(0);
    const after = await prisma.operationLog.count({ where: { tenantId } });
    expect(after, '遥测行确实落到库里（不是被静默吞掉）').toBeGreaterThan(before);
  });

  it('项目页请求：模型第一步实际收到的 system 含 projectId + 项目名 + 不要索要条款', async () => {
    const r = await postAgent(
      {
        prompt: '这个项目该推进什么？',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'match',
        },
      },
      [{ text: '好的。' }],
    );
    expect(r.status).toBe(200);
    expect(r.networkCalls, '零外呼').toEqual([]);
    // 【M4.7 F003 有意变更】受理人格恒为前台——页面/客户端不再能指定谁来回答
    // （本批根因：页面路由决定发言权 → 环节人格拒答并让用户自己去找别的 Agent）。
    // 本断言由"等于客户端指定的人格"改为"恒为前台"，**强度提高而非放宽**：
    // 它现在守的是"客户端指定的 agentId 一律不采信"这条新红线。
    expect(r.agentIdHeader).toBe(FRONT_DESK_AGENT_ID);
    expect(r.systems.length).toBeGreaterThan(0);
    expect(
      r.systems[0],
      '经真 route（resolveContext）后，模型仍必须看得见当前项目',
    ).toContain(projectId);
    expect(r.systems[0]).toContain(PROJECT_CONTEXT_HEADING);
    expect(r.systems[0]).toContain(PROJECT_NAME);
    expect(r.systems[0]).toContain(NO_ASK_PROJECT_CLAUSE);
  });

  it('工作区层请求（body 不带 projectId）：真 route 也不注水', async () => {
    seam.ctx = {
      tenantId,
      agentId: 'orchestrator',
      projectId: null,
      env: 'default',
    } satisfies ToolContext;
    try {
      const r = await postAgent(
        { prompt: '今天有什么要办的？', context: { route: '/admin' } },
        [{ text: '好的。' }],
      );
      expect(r.status).toBe(200);
      expect(r.systems[0]).not.toContain(PROJECT_CONTEXT_HEADING);
      expect(r.systems[0]).not.toContain(NO_ASK_PROJECT_CLAUSE);
      // 人格段本体仍在（证明不是整个 system 空了导致的假通过）
      expect(r.systems[0].length).toBeGreaterThan(50);
    } finally {
      seam.ctx = {
        tenantId,
        agentId: 'orchestrator',
        projectId,
        env: 'default',
      } satisfies ToolContext;
    }
  });

  it('真 route 上发生接力：接手后那一步的 system 仍带当前项目', async () => {
    const r = await postAgent(
      {
        prompt: '让洞察接手算 ROI',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'orchestrator',
        },
      },
      [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'route-fixture',
                summary: '请洞察接手做 ROI 复盘',
              },
            },
          ],
        },
        { text: '已交接。' },
      ],
    );
    expect(r.status).toBe(200);
    expect(r.networkCalls, '零外呼').toEqual([]);
    expect(
      r.systems.length,
      '接力后应还有一步（否则下面断言取不到目标）',
    ).toBeGreaterThan(1);
    expect(r.systems[1], '接手后的 system 缺当前项目').toContain(projectId);
    expect(r.systems[1]).toContain(NO_ASK_PROJECT_CLAUSE);
    expect(r.systems[1], '第二步 system 应已换人格').not.toBe(r.systems[0]);
  });

  // ── M4.7 F003：路由降级为线索 ───────────────────────────────────────────
  it('🔑 环节页发起的会话，受理人格仍是前台（本批根因的正面断言）', async () => {
    const r = await postAgent(
      {
        prompt: '帮我看看这个项目该推进什么，然后分析下 ROI',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          // 客户端刻意指定环节人格——服务端一律不采信
          agentId: 'match',
          stage: 'match',
        },
      },
      [{ text: '好的。' }],
    );
    expect(r.status).toBe(200);
    expect(r.agentIdHeader, '受理人格恒为前台').toBe(FRONT_DESK_AGENT_ID);
    // system 是前台的，不是匹配专家的
    expect(r.systems[0]).toContain(getPersona(FRONT_DESK_AGENT_ID).isolation);
    expect(
      r.systems[0],
      '前台必须看得见 consult_specialist——否则它又只能拒答',
    ).toContain('consult_specialist');
  });

  it('线索段**整段**正向精确匹配（追加一句相反指令也必须红）', async () => {
    // 【首轮验收 OBS-4】原先只钉「含某句」+ 一条否定式正则。实测绕过：在常量末尾
    // 追加「不过本环节以外的事情，请告诉用户切换到相应的助手那里再提问，你这边不
    // 作答。」——本批要根治的缺陷原样复发，而本文件 15/15 全绿。
    // 黑名单式否定断言不可穷尽（仓内已第七次踩），**整段 toBe 才是根治**：
    // 段落多一个字都会红，无论追加的是什么措辞。
    // 【期望值必须是字面量】第一版我把期望串用 STAGE_HINT_HEADING /
    // STAGE_HINT_NOT_A_LIMIT 拼出来——改常量等于两边一起改，**又是同义反复**，
    // 那条绕过照样全绿。这是同一类错误在本会话的第七次。字面量才有鉴别力。
    const { stageHintSection } = await import(
      '../../src/lib/agent/stage-hint'
    );
    expect(stageHintSection('match')).toBe(
      '\n\n【当前位置】用户正在「Match」环节页上。\n' +
        '这只是用户当前所在的位置，用来判断他关心什么；它**不限制**你能做什么——需要别的专业判断时，照常咨询对应专家。',
    );
  });

  it('线索段的语义锚点钉死：必须是「不限制」而非「只处理本环节」', () => {
    // 【为什么要钉字面量】其余断言全部引用 STAGE_HINT_NOT_A_LIMIT 常量本身——
    // 改常量等于两边一起改，是同义反复。变异实测（MUT-C）：把这句改成
    // 「请只处理该环节范围内的问题，其他事让用户去找对应专家」——**本批要根治的
    // 缺陷原样复发**——那些断言仍然全绿。M4.6 已经栽过一次，这里不再重蹈。
    expect(STAGE_HINT_NOT_A_LIMIT).toContain('不限制');
    expect(STAGE_HINT_NOT_A_LIMIT).toContain('照常咨询对应专家');
    expect(
      STAGE_HINT_NOT_A_LIMIT,
      '不得出现把用户推去别处的措辞——那正是本批要消灭的体验',
    ).not.toMatch(/只(处理|负责|做).{0,10}环节|去找对应专家(?!。?$)|自行前往/);
  });

  it('环节作为线索进 system，且明写「不限制你能做什么」', async () => {
    const r = await postAgent(
      {
        prompt: 'x',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          stage: 'match',
        },
      },
      [{ text: '好的。' }],
    );
    expect(r.systems[0]).toContain(STAGE_HINT_HEADING);
    // 正向精确匹配那句「线索不是权限」——它一旦丢失或被改反，模型很可能又把
    // 页面读成权限边界（M4.6 教训：否定式断言不可穷尽）
    expect(r.systems[0]).toContain(STAGE_HINT_NOT_A_LIMIT);
  });

  it('不在环节页 → 不注入线索段（不注水，同项目段纪律）', async () => {
    const r = await postAgent(
      { prompt: 'x', context: { route: `/admin/campaigns/${projectId}`, projectId } },
      [{ text: '好的。' }],
    );
    expect(r.systems[0]).not.toContain(STAGE_HINT_HEADING);
    expect(r.systems[0].length, '人格段本体仍在（防整体为空的假通过）').toBeGreaterThan(50);
  });

  it('非法 stage 值不注水（客户端乱传不该产生段落）', async () => {
    const r = await postAgent(
      {
        prompt: 'x',
        context: { route: '/admin', stage: 'not-a-stage' },
      },
      [{ text: '好的。' }],
    );
    expect(r.systems[0]).not.toContain(STAGE_HINT_HEADING);
  });
});
