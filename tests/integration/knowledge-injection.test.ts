// M1-D-KNOWLEDGE F005 — gameKnowledgeSection 取数链路集成测试（打真库，不打网关）。
//
// 覆盖：Project 三口径解析（id/publicId/slug，沿 compute-health D8 先例）· kinds 过滤 ·
// 链头恒取（superseded 旧行不进 prompt）· 缺失链路各环节 → 空串（D2 不打死对话主链路）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { gameKnowledgeSection } from '../../src/lib/agent/knowledge-context';
import { cleanupStep } from '../../scripts/test/cleanup-step';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import {
  scriptedGenerateModel,
  type SeenCall,
} from '../support/scripted-generate-model';
import { runSpecialistLoop } from '../../src/lib/agent/specialist-loop';
import type { ToolContext } from '../../src/lib/agent/tools/types';

let tenantId: string;
let gameId: string;
let projectId: string;
let projectPublicId: string;
let createdDevTenant = false;
const PROJECT_SLUG = `f005-inject-${process.pid}`;

// ── 第二租户（M4.8-HARDEN F002 跨租户负向面）──────────────────────────────
// 别家租户的项目必须**知识链路完整**（有 gameId + 有链头），否则「返回空串」
// 可能只是因为它本来就没知识——那是假通过。故这里灌一条独有内容的链头，
// 断言它在跨租户查询下一个字都不出现。
const OTHER_TENANT_SLUG = `test-tenant-m48-know-${process.pid}`;
const OTHER_PROJECT_SLUG = `m48-know-other-${process.pid}`;
const OTHER_GAME_NAME = `M4.8 别家租户游戏 ${process.pid}`;
const OTHER_KNOWLEDGE = `别家租户的受众切片 ${process.pid}（不得进任何 system 段）`;
let otherTenantId: string;
let otherGameId: string;
let otherProject: { id: string; publicId: string; slug: string | null };

beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (existing) {
    tenantId = existing.id;
  } else {
    const t = await prisma.tenant.create({
      data: { slug: 'dev', name: 'dev tenant（F005 集成测试夹具建）' },
    });
    tenantId = t.id;
    createdDevTenant = true;
  }

  const game = await prisma.game.create({
    data: { tenantId, name: 'F005 注入夹具游戏' },
  });
  gameId = game.id;

  const project = await prisma.project.create({
    data: { tenantId, slug: PROJECT_SLUG, name: 'F005 注入夹具项目', gameId },
  });
  projectId = project.id;
  projectPublicId = project.publicId;

  // 链头知识：audience（现行）+ selling_point（现行）+ 一条被取代的旧 audience（不得进 prompt）
  const newAud = await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: '硬核射击 58%（现行）',
      sourceMaterialIds: ['m-a'],
    },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: '旧受众切片（已取代）',
      sourceMaterialIds: ['m-old'],
      supersededById: newAud.id,
    },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'selling_point',
      content: '双武器切换（卖点）',
      sourceMaterialIds: ['m-a'],
    },
  });

  // 第二租户：游戏 + 链头 + 三口径齐全的项目（slug 显式给，publicId 走默认值）
  const otherTenant = await prisma.tenant.create({
    data: { slug: OTHER_TENANT_SLUG, name: `M4.8 知识跨租户夹具 ${process.pid}` },
  });
  otherTenantId = otherTenant.id;
  const otherGame = await prisma.game.create({
    data: { tenantId: otherTenantId, name: OTHER_GAME_NAME },
  });
  otherGameId = otherGame.id;
  const op = await prisma.project.create({
    data: {
      tenantId: otherTenantId,
      slug: OTHER_PROJECT_SLUG,
      name: 'M4.8 别家租户项目',
      gameId: otherGameId,
    },
  });
  otherProject = { id: op.id, publicId: op.publicId, slug: op.slug };
  await prisma.gameKnowledge.create({
    data: {
      tenantId: otherTenantId,
      gameId: otherGameId,
      kind: 'audience',
      content: OTHER_KNOWLEDGE,
      sourceMaterialIds: ['m-other'],
    },
  });
});

afterAll(async () => {
  // 【清理登记表】M4.8 F002 扩：第二租户的 tenant / game / gameKnowledge / project
  // 全部入表，逐表清 + 逐表断言残留 0。清理段用 cleanupStep 包——自身绝不再抛，
  // 否则会掩盖主流程首因并跳过后续清理（M4.5 F010 缺陷①同族）。
  await cleanupStep('gameKnowledge(主)', () =>
    prisma.gameKnowledge.deleteMany({ where: { gameId } }),
  );
  await cleanupStep('project(主)', () =>
    prisma.project.deleteMany({ where: { id: projectId } }),
  );
  await cleanupStep('game(主)', () =>
    prisma.game.deleteMany({ where: { id: gameId } }),
  );
  if (createdDevTenant) {
    await cleanupStep('tenant(主，本文件建的)', () =>
      prisma.tenant.deleteMany({ where: { id: tenantId } }),
    );
  }
  // 真 loop 用例会以第二租户身份落 Handoff / OperationLog / PendingAction ——
  // 这三张表对 Tenant 是**软引用无 FK**（删租户不级联），漏清即留孤儿行。
  await cleanupStep('handoff(第二租户)', () =>
    prisma.handoff.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('operationLog(第二租户)', () =>
    prisma.operationLog.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('pendingAction(第二租户)', () =>
    prisma.pendingAction.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('gameKnowledge(第二租户)', () =>
    prisma.gameKnowledge.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('project(第二租户)', () =>
    prisma.project.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('game(第二租户)', () =>
    prisma.game.deleteMany({ where: { tenantId: otherTenantId } }),
  );
  await cleanupStep('tenant(第二租户)', () =>
    prisma.tenant.deleteMany({ where: { id: otherTenantId } }),
  );

  const [
    oKnow,
    oProjects,
    oGames,
    oTenants,
    oLogs,
    oHandoffs,
    oPas,
    mKnow,
    mProjects,
    mGames,
  ] = await Promise.all([
    prisma.gameKnowledge.count({ where: { tenantId: otherTenantId } }),
    prisma.project.count({ where: { tenantId: otherTenantId } }),
    prisma.game.count({ where: { tenantId: otherTenantId } }),
    prisma.tenant.count({ where: { slug: OTHER_TENANT_SLUG } }),
    prisma.operationLog.count({ where: { tenantId: otherTenantId } }),
    prisma.handoff.count({ where: { tenantId: otherTenantId } }),
    prisma.pendingAction.count({ where: { tenantId: otherTenantId } }),
    prisma.gameKnowledge.count({ where: { gameId } }),
    prisma.project.count({ where: { slug: PROJECT_SLUG } }),
    prisma.game.count({ where: { id: gameId } }),
  ]);
  expect(
    {
      oKnow,
      oProjects,
      oGames,
      oTenants,
      oLogs,
      oHandoffs,
      oPas,
      mKnow,
      mProjects,
      mGames,
    },
    '夹具残留（两个租户逐表 + 软引用表；净增必须为 0）',
  ).toEqual({
    oKnow: 0,
    oProjects: 0,
    oGames: 0,
    oTenants: 0,
    oLogs: 0,
    oHandoffs: 0,
    oPas: 0,
    mKnow: 0,
    mProjects: 0,
    mGames: 0,
  });
  // 净增 0 的第二口径：引用夹具项目的软引用行不许留（哪怕挂在别的 tenantId 上）
  const fixtureProjectIds = [projectId, otherProject?.id].filter(
    Boolean,
  ) as string[];
  const [logsByProject, handoffsByProject, pasByProject] = await Promise.all([
    prisma.operationLog.count({ where: { projectId: { in: fixtureProjectIds } } }),
    prisma.handoff.count({ where: { projectId: { in: fixtureProjectIds } } }),
    prisma.pendingAction.count({
      where: { projectId: { in: fixtureProjectIds } },
    }),
  ]);
  expect(
    { logsByProject, handoffsByProject, pasByProject },
    '按 projectId 的孤儿普查（跨租户用例会写「A 租户 tenantId + B 租户 projectId」的行）',
  ).toEqual({ logsByProject: 0, handoffsByProject: 0, pasByProject: 0 });
  await prisma.$disconnect();
});

describe('gameKnowledgeSection（取数 + 过滤 + 降级）', () => {
  it('slug 口径 + kinds=[audience]：只含受众，排除卖点与被取代旧行', async () => {
    const s = await gameKnowledgeSection(PROJECT_SLUG, tenantId, ['audience']);
    expect(s).toContain('硬核射击 58%（现行）');
    expect(s).not.toContain('双武器切换'); // kinds 过滤
    expect(s).not.toContain('已取代'); // 链头恒取
    expect(s).toContain('F005 注入夹具游戏');
  });

  it('id / publicId 口径与 slug 等价（三口径 OR）', async () => {
    const byId = await gameKnowledgeSection(projectId, tenantId, ['audience']);
    const byPublic = await gameKnowledgeSection(projectPublicId, tenantId, ['audience']);
    expect(byId).toContain('硬核射击 58%（现行）');
    expect(byPublic).toContain('硬核射击 58%（现行）');
  });

  it('strategy 三类全量：卖点 + 受众都进段（红线无行则不出现标签行）', async () => {
    const s = await gameKnowledgeSection(PROJECT_SLUG, tenantId, [
      'selling_point',
      'audience',
      'compliance_redline',
    ]);
    expect(s).toContain('双武器切换（卖点）');
    expect(s).toContain('硬核射击 58%（现行）');
    expect(s).not.toContain('- 合规红线：'); // 无红线链头 → 无该行（不注水）
  });

  it('缺失链路各环节 → 空串：kinds 未声明 / 项目不存在 / 项目未关联游戏', async () => {
    expect(await gameKnowledgeSection(PROJECT_SLUG, tenantId, undefined)).toBe('');
    expect(await gameKnowledgeSection(PROJECT_SLUG, tenantId, [])).toBe('');
    expect(await gameKnowledgeSection('no-such-project', tenantId, ['audience'])).toBe('');

    const orphan = await prisma.project.create({
      data: { tenantId, slug: `${PROJECT_SLUG}-nogame`, name: '无游戏项目' },
    });
    try {
      expect(await gameKnowledgeSection(orphan.id, tenantId, ['audience'])).toBe('');
    } finally {
      await prisma.project.deleteMany({ where: { id: orphan.id } });
    }
  });
});

// ── M4.8-HARDEN F002：租户作用域收口 ────────────────────────────────────────
// 【缺陷正身】三口径解析原来无 tenantId 条件，而 projectId 一路来自客户端可控的
// `body.context.projectId` —— 别家租户的游戏知识（受众切片 / 卖点 / 合规红线）
// 会被拼进 system 段。跨租户 → `''`（与「无知识」同款：不注水、不抛错）。
describe('跨租户作用域（M4.8-HARDEN F002）', () => {
  function otherRefs(): Array<{ kind: string; ref: string }> {
    return [
      { kind: 'id', ref: otherProject.id },
      { kind: 'publicId', ref: otherProject.publicId },
      { kind: 'slug', ref: otherProject.slug as string },
    ];
  }

  it('自证夹具：别家项目在**它自己的租户**下确实渲染得出知识段（否则空串是假通过）', async () => {
    for (const { kind, ref } of otherRefs()) {
      const s = await gameKnowledgeSection(ref, otherTenantId, ['audience']);
      expect(s, `${kind} 口径在自己租户下应有知识段`).toContain(OTHER_KNOWLEDGE);
      expect(s).toContain(OTHER_GAME_NAME);
    }
  });

  it('跨租户三口径逐一 → 空串（不注水），且知识正文/游戏名一个字都不出现', async () => {
    for (const { kind, ref } of otherRefs()) {
      const s = await gameKnowledgeSection(ref, tenantId, ['audience']);
      expect(s, `${kind} 口径跨租户拿到了知识段 = 租户隔离缺口`).toBe('');
      // toBe('') 已覆盖，这两条是给失败信息用的语义锚点
      expect(s).not.toContain(OTHER_KNOWLEDGE);
      expect(s).not.toContain(OTHER_GAME_NAME);
    }
  });

  it('跨租户不抛错（增强性注入不得打死主链路，D2 纪律）', async () => {
    await expect(
      gameKnowledgeSection(otherProject.id, tenantId, [
        'selling_point',
        'audience',
        'compliance_redline',
      ]),
    ).resolves.toBe('');
  });

  it('正向回归：收口后自家租户三口径照常渲染（不得把自家也挡掉）', async () => {
    for (const ref of [projectId, projectPublicId, PROJECT_SLUG]) {
      expect(
        await gameKnowledgeSection(ref, tenantId, ['audience']),
        `自家租户的 ${ref} 应照常渲染知识段`,
      ).toContain('硬核射击 58%（现行）');
    }
  });
});

// ── 三个调用点的**行为级**钉（loop.ts:232 / loop.ts:262 / specialist-loop.ts:149）──
// 【为什么函数级断言不够】收口后 tsc 只保证每个调用点「传了个 string」，**传错**
// （例如传 projectId 当 tenantId）照样编译通过。上面那些用例直接调 gameKnowledgeSection，
// 一个字也测不到调用点的接线。这里断言**模型那一步实际收到的 system 正文**。
//
// 【为什么以第二租户作为「自家」】真 loop 会落 Handoff / OperationLog；把它们记在
// 第二租户名下，清理登记表就能连根拔掉。若用 dev 租户当自家，这些行会留在 dev 库里
//（本文件不删 dev 租户）——正是 M4.6 D3 记过的孤儿污染。
describe('知识段的三个调用点（真 loop 装配路径，M4.8-HARDEN F002）', () => {
  const ownLoopCopilot = () => ({
    route: `/admin/campaigns/${otherProject.id}`,
    projectId: otherProject.id,
    env: 'default' as const,
    agentId: 'match' as const,
  });

  it('前台主 loop（loop.ts:232）：自家知识进 system，别家知识进不来', async () => {
    const own = await runScriptedLoop({
      copilot: ownLoopCopilot(),
      ctx: {
        tenantId: otherTenantId,
        agentId: 'match',
        projectId: otherProject.id,
        env: 'default',
      },
      prompt: '这个项目该找什么样的创作者？',
      script: [{ text: '好的。' }],
      telemetryWriter: async () => {}, // 遥测不是被测对象，且不必往库里写行
    });
    expect(own.networkCalls, '零外呼').toEqual([]);
    expect(
      own.systemPerStep[0],
      '自家租户的知识段没进 system —— 调用点接线断了',
    ).toContain(OTHER_KNOWLEDGE);

    const cross = await runScriptedLoop({
      // ctx 是第二租户，projectId 却指向 dev 租户的项目（客户端可伪造的正是这个形态）
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: 'match',
      },
      ctx: {
        tenantId: otherTenantId,
        agentId: 'match',
        projectId,
        env: 'default',
      },
      prompt: '这个项目该找什么样的创作者？',
      script: [{ text: '好的。' }],
      telemetryWriter: async () => {},
    });
    expect(
      cross.systemPerStep[0],
      '别家租户的知识正文出现在模型收到的 system 里 —— 跨租户泄漏',
    ).not.toContain('硬核射击 58%（现行）');
    expect(cross.systemPerStep[0]).not.toContain('F005 注入夹具游戏');
  });

  it('接力后的目标人格（loop.ts:262）：自家知识重查得到，别家知识拿不到', async () => {
    /** 跑一次「orchestrator 接力给 match」的会话，返回接手那一步的 system。 */
    async function handoffRun(pid: string): Promise<string[]> {
      const run = await runScriptedLoop({
        copilot: {
          route: `/admin/campaigns/${pid}`,
          projectId: pid,
          env: 'default',
          agentId: 'orchestrator',
        },
        ctx: {
          tenantId: otherTenantId,
          agentId: 'orchestrator',
          projectId: pid,
          env: 'default',
        },
        prompt: '让匹配接手看看候选',
        script: [
          {
            toolCalls: [
              {
                toolName: 'handoff_to',
                input: {
                  toAgent: 'match',
                  artifactType: 'match_plan',
                  artifactRef: 'm48-know-fixture',
                  summary: '请匹配接手看候选',
                },
              },
            ],
          },
          { text: '已交接。' },
        ],
        telemetryWriter: async () => {},
      });
      expect(run.networkCalls, '零外呼').toEqual([]);
      expect(run.personaSwitches, '应发生一次接力').toHaveLength(1);
      expect(
        run.systemPerStep.length,
        '接力后应还有一步（否则下面的断言取不到目标）',
      ).toBeGreaterThan(1);
      // 第二步确实换过人格（否则等于在测第一步，假通过）
      expect(run.systemPerStep[1]).not.toBe(run.systemPerStep[0]);
      return run.systemPerStep;
    }

    // 自家项目：接手人格必须重查得到本租户知识（接线传错 tenantId 时这条会红）
    const own = await handoffRun(otherProject.id);
    expect(
      own[1],
      '接手人格没拿到自家知识段 —— systemForAgent 那条调用点接线断了',
    ).toContain(OTHER_KNOWLEDGE);

    // 别家项目：知识段必须为空，不得泄漏
    const cross = await handoffRun(projectId);
    expect(
      cross[1],
      '接手人格的知识段跨租户泄漏（systemForAgent 那条路径漏了 tenantId）',
    ).not.toContain('硬核射击 58%（现行）');
    expect(cross[1]).not.toContain('F005 注入夹具游戏');
  });

  it('专家子 loop（specialist-loop.ts:149）：自家知识在、别家知识不在', async () => {
    const ownSeen: SeenCall[] = [];
    await runSpecialistLoop({
      targetAgent: 'match',
      question: '有哪些候选组合？',
      ctx: {
        tenantId: otherTenantId,
        agentId: 'orchestrator',
        projectId: otherProject.id,
        env: 'default',
      } satisfies ToolContext,
      model: scriptedGenerateModel([{ text: '三组。' }], ownSeen),
    });
    expect(
      ownSeen[0].system,
      '自家租户的知识段没进子 loop 的 system —— 调用点接线断了',
    ).toContain(OTHER_KNOWLEDGE);

    const crossSeen: SeenCall[] = [];
    await runSpecialistLoop({
      targetAgent: 'match',
      question: '有哪些候选组合？',
      ctx: {
        tenantId: otherTenantId,
        agentId: 'orchestrator',
        projectId, // dev 租户的项目
        env: 'default',
      } satisfies ToolContext,
      model: scriptedGenerateModel([{ text: '三组。' }], crossSeen),
    });
    expect(
      crossSeen[0].system,
      '子 loop 把别家租户的知识拼进了 system —— 跨租户泄漏',
    ).not.toContain('硬核射击 58%（现行）');
    expect(crossSeen[0].system).not.toContain('F005 注入夹具游戏');
  });
});
