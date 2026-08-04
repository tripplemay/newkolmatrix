// M4.6-CTX F001 — 当前项目上下文注入
//
// 触发源：**生产实测**（M4+M4.5 上线后首轮真实对话）。用户在项目环节页问
// 「帮我看看这个项目该推进什么，然后分析下 ROI」，匹配 Agent 反问「请提供项目ID」。
// 根因：ctx.projectId 服务端已解析，但 buildLoopSystem 只拼 persona + 知识段 + 工具清单，
// 模型看不见它；而 13 个工具把 projectId 当模型入参 → 模型只能问用户。
//
// 【为什么之前的测试全绿却没抓到】mock-model 测试床里工具入参是**脚本写死**的
// （`input: { projectId: fx.id }`），模型从不需要「自己发现」projectId。
// 所以本文件不测「模型会不会填对入参」（那要真模型，属 L2），只测**装配层事实**：
// 项目页装配出来的 system 里，到底有没有这个项目标识和「不要索要」的指令。

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getPersona } from '../../src/lib/agent/registry';
import { buildLoopSystem } from '../../src/lib/agent/loop';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import { cleanupStep } from '../../scripts/test/cleanup-step';
import {
  NO_ASK_PROJECT_CLAUSE,
  PROJECT_CONTEXT_HEADING,
  findProjectByRef,
  projectContextSection,
} from '../../src/lib/agent/project-context';

const SLUG = `test-tenant-m46-ctx-${process.pid}`;
const PROJECT_NAME = `M4.6 上下文夹具项目 ${process.pid}`;

/**
 * 「不编造名字」的判据 —— **正向精确匹配**（S-M46-6 收口）。
 *
 * 【三版演进，值得留在这里】
 *   v1 `not.toContain('（')`：只挡带括号的写法 → 验收变异「编造名字但不带括号」绕过
 *   v2 占位名黑名单 + 括注正则：复验又用 `${id} 星辰出海计划` / `${id}【王者荣耀出海】`
 *      两种形态绕过 —— **黑名单原理上不可穷尽**，能想到多少种违法形态就只挡多少种
 *   v3（本版）正向全串匹配：段落必须**恰好等于**这一串。任何编造形态都会红。
 *
 * 规律：凡「不得编造 / 不得出现」类断言，优先写成「必须恰好等于」。
 */
function expectNoFabricatedName(section: string, projectId: string): void {
  expect(
    section,
    '降级段落必须与「有名字」版本只差那个括注——多一个字都算编造',
  ).toBe(
    [
      '',
      '',
      `${PROJECT_CONTEXT_HEADING}用户正在项目 ${projectId} 的页面上与你对话。`,
      NO_ASK_PROJECT_CLAUSE,
    ].join('\n'),
  );
}

let tenantId: string;
let projectId: string;

// ── 第二租户（M4.8-HARDEN F001 跨租户负向面）──────────────────────────────
// 跨租户断言必须有一个**真实存在、三口径齐全**的别家项目：否则「解析得 null」
// 可能只是因为 ref 本身是编的（假通过）。故 slug 显式给、publicId 由默认值生成，
// 三个口径逐一试。
const OTHER_SLUG = `test-tenant-m48-ctx-${process.pid}`;
const OTHER_PROJECT_NAME = `M4.8 别家租户项目 ${process.pid}`;
const OTHER_PROJECT_SLUG = `m48-other-proj-${process.pid}`;
let otherTenantId: string;
let otherProject: { id: string; publicId: string; slug: string | null };

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.6 CTX 夹具 ${process.pid}` },
  });
  tenantId = tenant.id;
  const project = await prisma.project.create({
    data: { tenantId, name: PROJECT_NAME },
  });
  projectId = project.id;

  const other = await prisma.tenant.create({
    data: { slug: OTHER_SLUG, name: `M4.8 跨租户夹具 ${process.pid}` },
  });
  otherTenantId = other.id;
  const op = await prisma.project.create({
    data: {
      tenantId: otherTenantId,
      name: OTHER_PROJECT_NAME,
      slug: OTHER_PROJECT_SLUG,
    },
  });
  otherProject = { id: op.id, publicId: op.publicId, slug: op.slug };
});

afterAll(async () => {
  // 【软引用无 FK】OperationLog / Handoff 对 Tenant 只有 @@index，删租户**不级联**。
  // 首轮验收 D3 实测：本文件两条 runScriptedLoop 用例每跑泄 2 行 OperationLog（遥测）
  // + 1 行 Handoff（接力）到「租户已不存在」的孤儿状态；而原 afterAll 只断言
  // tenant 残留 0 —— 给出「已清干净」的假信心。故逐表按 tenantId 清 + 逐表断言。
  //
  // 【M4.8 F001 扩】清理登记表纳入第二租户；并新增**按 projectId 的孤儿普查**：
  // 跨租户用例会以「主租户 tenantId + 别家 projectId」落遥测行，那种行按 tenantId
  // 清得掉，但一旦将来清理表漏一张，按 tenantId 的断言看不见它引用的别家项目。
  // 清理段本身用 cleanupStep 包（自身绝不再抛，否则会掩盖首因并跳过后续清理）。
  const tenantIds = [tenantId, otherTenantId].filter(Boolean);
  const projectIds = [projectId, otherProject?.id].filter(Boolean) as string[];
  await cleanupStep('handoff', () =>
    prisma.handoff.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await cleanupStep('operationLog', () =>
    prisma.operationLog.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await cleanupStep('pendingAction', () =>
    prisma.pendingAction.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await cleanupStep('project', () =>
    prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await cleanupStep('tenant', () =>
    prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
  );

  const [logs, handoffs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.handoff.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.pendingAction.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.project.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.tenant.count({ where: { slug: { in: [SLUG, OTHER_SLUG] } } }),
  ]);
  expect(
    { logs, handoffs, pas, projects, tenants },
    '夹具残留（含软引用表——只查 tenant 会漏掉孤儿行）',
  ).toEqual({ logs: 0, handoffs: 0, pas: 0, projects: 0, tenants: 0 });

  // 净增 0 的第二口径：任何**引用夹具项目**的软引用行都不许留（哪怕它挂在别的 tenantId 上）
  const [logsByProject, handoffsByProject, pasByProject] = await Promise.all([
    prisma.operationLog.count({ where: { projectId: { in: projectIds } } }),
    prisma.handoff.count({ where: { projectId: { in: projectIds } } }),
    prisma.pendingAction.count({ where: { projectId: { in: projectIds } } }),
  ]);
  expect(
    { logsByProject, handoffsByProject, pasByProject },
    '按 projectId 的孤儿普查（跨租户用例会写「主租户 tenantId + 别家 projectId」的行）',
  ).toEqual({ logsByProject: 0, handoffsByProject: 0, pasByProject: 0 });
});

describe('projectContextSection —— 段落内容', () => {
  it('指令句的语义锚点钉死：必须是「不要索要」而非「请确认」', () => {
    // 【为什么要钉字面量】其余断言全部引用 NO_ASK_PROJECT_CLAUSE 常量本身 ——
    // 改常量等于两边一起改，是同义反复。变异实测：把句子改成「请向用户确认项目 ID」
    // （语义完全反过来，缺陷原样复发）时，那些断言仍然全绿。
    // 所以这里钉语义核心的字面量，让「把指令改反」这件事必须翻红。
    expect(NO_ASK_PROJECT_CLAUSE).toContain('不要向用户索要');
    expect(
      NO_ASK_PROJECT_CLAUSE,
      '不得出现要求用户提供/确认项目 ID 的措辞——那正是本缺陷的表现',
    ).not.toMatch(/请(向用户)?(确认|提供|输入).{0,6}项目/);
  });

  it('含项目 id + 项目名 + 「不要向用户索要」指令', async () => {
    const section = await projectContextSection(projectId, tenantId);
    expect(section).toContain(PROJECT_CONTEXT_HEADING);
    expect(section, '必须含真实 projectId（工具入参要用它）').toContain(
      projectId,
    );
    expect(section, '有名字就写名字，便于模型在回话里指代').toContain(
      PROJECT_NAME,
    );
    expect(section).toContain(NO_ASK_PROJECT_CLAUSE);
  });

  it('项目查不到时降级为「只写 id，不编造名字」且不抛', async () => {
    const ghost = 'proj-does-not-exist-m46';
    const section = await projectContextSection(ghost, tenantId);
    // 段落照常注入——projectId 本身来自 ctx，不依赖 DB；查不到的只是名字。
    expect(section).toContain(ghost);
    expect(section).toContain(NO_ASK_PROJECT_CLAUSE);
    expectNoFabricatedName(section, ghost);
  });

  // ── DB 故障半边（首轮验收 D2）────────────────────────────────────────────
  // 【补的是什么洞】上面那条只覆盖「项目不存在」——findFirst 返回 null，**根本不进 catch**。
  // 验收变异实测：把 catch 改成 `return ''`（降级退化成什么都不说，缺陷复发）、
  // 或整块摘掉 try/catch（DB 故障直接把会话打死，正是 acceptance 明令禁止的），
  // 交付的 9 条用例**双双全绿**。即「取名失败…且不抛」这半边此前无任何断言。
  describe('取名失败（真 DB 故障）降级', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DB 抛错：段落照常注入、只写 id、不编造名字、不向外抛', async () => {
      vi.spyOn(prisma.project, 'findFirst').mockRejectedValue(
        new Error('m46 模拟 DB 故障'),
      );
      const section = await projectContextSection(projectId, tenantId);
      expect(section, '降级不得退化成「什么都不说」——那等于缺陷复发').toContain(
        PROJECT_CONTEXT_HEADING,
      );
      expect(section, 'projectId 来自 ctx，不依赖 DB，必须照常给').toContain(
        projectId,
      );
      expect(section).toContain(NO_ASK_PROJECT_CLAUSE);
      expectNoFabricatedName(section, projectId);
    });

    it('DB 抛错：整场会话照常收敛（增强性注入不得打死主链路，D2 纪律）', async () => {
      vi.spyOn(prisma.project, 'findFirst').mockRejectedValue(
        new Error('m46 模拟 DB 故障'),
      );
      const run = await runScriptedLoop({
        copilot: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'match',
        },
        ctx: { tenantId, agentId: 'match', projectId, env: 'default' },
        prompt: '这个项目该推进什么？',
        script: [{ text: '好的。' }],
      });
      expect(run.networkCalls, '零外呼').toEqual([]);
      expect(run.loop.system).toContain(projectId);
      expect(run.systemPerStep[0]).toContain(NO_ASK_PROJECT_CLAUSE);
    });
  });

  it('三口径解析：id / publicId / slug 任一都能认到同一个项目', async () => {
    const byId = await findProjectByRef(projectId, tenantId);
    expect(byId?.id).toBe(projectId);
    expect(byId?.name).toBe(PROJECT_NAME);
  });
});

// ── M4.8-HARDEN F001：租户作用域收口 ────────────────────────────────────────
// 【缺陷正身】`findProjectByRef` 原来**没有 tenantId 条件**，而 `copilot.projectId`
// 是客户端可控的（route 直接取 body.context.projectId，不校验归属）——M4.6 验收实测
// 可让 system 段吐出**另一个租户的项目名**。单租户 dev 下无实际影响，但这是「新代码
// 一律走这里」的可复用口径，任何持有 ctx 的调用方复用即静默丢租户隔离。
//
// 【断言强度】负向只写「返回 null / 段落不含别家名」是不够的——ref 打错字也会得到
// 同样的 null（假通过）。故每条负向都配一条**同 ref、别家租户下解析得到**的正向自证。
describe('跨租户作用域（M4.8-HARDEN F001）', () => {
  /** 三口径 ref 逐一试——收口漏一个口径（例如只给 id 加条件）也必须红。 */
  function otherRefs(): Array<{ kind: string; ref: string }> {
    return [
      { kind: 'id', ref: otherProject.id },
      { kind: 'publicId', ref: otherProject.publicId },
      { kind: 'slug', ref: otherProject.slug as string },
    ];
  }

  it('自证夹具：三个 ref 在**它自己的租户**下都解析得到（否则下面的 null 是假通过）', async () => {
    for (const { kind, ref } of otherRefs()) {
      const hit = await findProjectByRef(ref, otherTenantId);
      expect(hit?.id, `${kind} 口径在自己租户下应解析得到`).toBe(
        otherProject.id,
      );
      expect(hit?.name).toBe(OTHER_PROJECT_NAME);
    }
  });

  it('以主租户 tenantId 解析别家项目的三个口径 → 均 null（视同不存在）', async () => {
    for (const { kind, ref } of otherRefs()) {
      expect(
        await findProjectByRef(ref, tenantId),
        `${kind} 口径跨租户可解析 = 租户隔离缺口`,
      ).toBeNull();
    }
  });

  it('段落降级为 id-only：跨租户项目名一个字都不许出现（整段正向精确匹配）', async () => {
    for (const { kind, ref } of otherRefs()) {
      const section = await projectContextSection(ref, tenantId);
      expect(section, `${kind}：段落必须照常注入（不是整段消失）`).toContain(
        PROJECT_CONTEXT_HEADING,
      );
      expect(section, `${kind}：ref 本身来自 ctx，照常给`).toContain(ref);
      expect(
        section,
        `${kind}：别家租户的项目名进了 system 段 —— 缺陷正身`,
      ).not.toContain(OTHER_PROJECT_NAME);
      // 整段 toBe：任何形式的名字泄漏（含括注、占位、拼接）都会红
      expectNoFabricatedName(section, ref);
    }
  });

  it('真 loop 装配路径：模型实际收到的 system 里不含别家租户的项目名', async () => {
    // 断言对象是 systemPerStep（模型那一步真正收到的正文）——不是我们以为拼进去的。
    // ctx.tenantId = 主租户，copilot.projectId = 别家项目 id（正是客户端可伪造的形态）。
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${otherProject.id}`,
        projectId: otherProject.id,
        env: 'default',
        agentId: 'match',
      },
      ctx: {
        tenantId,
        agentId: 'match',
        projectId: otherProject.id,
        env: 'default',
      },
      prompt: '这个项目该推进什么？',
      script: [{ text: '好的。' }],
    });
    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(run.systemPerStep.length).toBeGreaterThan(0);
    expect(
      run.systemPerStep[0],
      '别家租户的项目名出现在模型收到的 system 里 —— 跨租户泄漏',
    ).not.toContain(OTHER_PROJECT_NAME);
    // 正面：段落本身仍在（防「整段没注入」造成的假通过）
    expect(run.systemPerStep[0]).toContain(PROJECT_CONTEXT_HEADING);
    expect(run.systemPerStep[0]).toContain(otherProject.id);
  });

  it('正向回归：同租户三口径照常返回名（收口不得把自家项目也挡掉）', async () => {
    const self = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, publicId: true, slug: true },
    });
    for (const ref of [self.id, self.publicId, self.slug].filter(
      Boolean,
    ) as string[]) {
      const hit = await findProjectByRef(ref, tenantId);
      expect(hit?.id, `自家租户的 ${ref} 应照常解析`).toBe(projectId);
      expect(hit?.name).toBe(PROJECT_NAME);
    }
  });
});

describe('buildLoopSystem —— 装配层事实（缺陷正身）', () => {
  it('项目页：system 含当前 projectId 且含「不要索要」条款', async () => {
    const persona = getPersona('match');
    const section = await projectContextSection(projectId, tenantId);
    const system = buildLoopSystem(persona, persona.tools, '', section);
    expect(
      system,
      '模型必须能从 system 里读到当前项目——否则只能反问用户（本缺陷正身）',
    ).toContain(projectId);
    expect(system).toContain(NO_ASK_PROJECT_CLAUSE);
    // 人格自身的身份/护栏不得被挤掉
    expect(system).toContain(persona.duty);
  });

  it('工作区层（无项目）：不注入该段，不注水', async () => {
    // 先钉常量非空——否则下面的 not.toContain('') 会恒失败，红得毫无意义
    //（变异测试实测踩到过：把常量置空，翻红的是本条而非目标条）。
    expect(NO_ASK_PROJECT_CLAUSE.length, '指令句不得为空').toBeGreaterThan(10);
    const persona = getPersona('orchestrator');
    const system = buildLoopSystem(persona, persona.tools, '', '');
    expect(system).not.toContain(PROJECT_CONTEXT_HEADING);
    expect(system).not.toContain(NO_ASK_PROJECT_CLAUSE);
  });

  it('接力后的目标人格同样看得见 —— 经真 loop 的 systemForAgent，不是手工拼', async () => {
    // 【这条测试写过一版假的】起初是自己调 buildLoopSystem 把 section 喂给几个人格，
    // 变异测试证明它是死的：把 loop.ts 里 systemForAgent(...) 的 projectSection 参数
    // 删掉，那版测试照样全绿——因为它压根没经过 loop.ts 那条路径。
    // 现在改为跑真接力，断言**模型在接力后那一步实际收到的 system**。
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: 'orchestrator',
      },
      ctx: { tenantId, agentId: 'orchestrator', projectId, env: 'default' },
      prompt: '让洞察接手算一下 ROI',
      script: [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'ctx-fixture',
                summary: '请洞察接手做 ROI 复盘',
              },
            },
          ],
        },
        { text: '已交接。' },
      ],
    });
    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(run.personaSwitches, '应发生一次接力').toHaveLength(1);
    expect(run.personaSwitches[0]).toMatchObject({
      from: 'orchestrator',
      to: 'insight',
    });
    expect(
      run.systemPerStep.length,
      '接力后应还有一步（否则下面的断言取不到目标）',
    ).toBeGreaterThan(1);
    // 接力后那一步的 system 已换成目标人格的——项目上下文必须跟着过去
    expect(
      run.systemPerStep[1],
      '接力后目标人格的 system 缺当前项目（缺陷会以「接手后又反问项目ID」的形式复发）',
    ).toContain(projectId);
    expect(run.systemPerStep[1]).toContain(NO_ASK_PROJECT_CLAUSE);
    // 确认第 2 步的 system 确实是切换过的（否则上面等于在测第 1 步）
    expect(run.systemPerStep[1]).not.toBe(run.systemPerStep[0]);
  });

  it('真 loop 装配路径：模型实际收到的 system 里就有当前项目（不只是函数级）', async () => {
    // 用测试床跑一次真 runAgentLoop，断言的是 systemPerStep ——
    // 即**模型那一步真正收到的 system 正文**，而非我们以为拼进去的东西。
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: 'match',
      },
      ctx: { tenantId, agentId: 'match', projectId, env: 'default' },
      prompt: '这个项目该推进什么？',
      script: [{ text: '好的。' }],
    });
    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(run.systemPerStep.length).toBeGreaterThan(0);
    expect(
      run.systemPerStep[0],
      '模型第一步收到的 system 里必须有当前项目标识',
    ).toContain(projectId);
    expect(run.systemPerStep[0]).toContain(NO_ASK_PROJECT_CLAUSE);
    // 装配产物同源（loop 返回的 system 与实际下发的一致）
    expect(run.loop.system).toContain(projectId);
  });

  it('装配顺序：项目上下文在人格 prompt 之后、工具清单之前', async () => {
    const persona = getPersona('match');
    const section = await projectContextSection(projectId, tenantId);
    const system = buildLoopSystem(persona, persona.tools, '', section);
    const iPersona = system.indexOf(persona.duty);
    const iProject = system.indexOf(PROJECT_CONTEXT_HEADING);
    const iTools = system.indexOf('你可调用的工具');
    expect(iPersona).toBeGreaterThanOrEqual(0);
    expect(iProject).toBeGreaterThan(iPersona);
    expect(iTools).toBeGreaterThan(iProject);
  });
});
