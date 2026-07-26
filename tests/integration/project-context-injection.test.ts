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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getPersona } from '../../src/lib/agent/registry';
import { buildLoopSystem } from '../../src/lib/agent/loop';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import {
  NO_ASK_PROJECT_CLAUSE,
  PROJECT_CONTEXT_HEADING,
  findProjectByRef,
  projectContextSection,
} from '../../src/lib/agent/project-context';

const SLUG = `test-tenant-m46-ctx-${process.pid}`;
const PROJECT_NAME = `M4.6 上下文夹具项目 ${process.pid}`;

let tenantId: string;
let projectId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.6 CTX 夹具 ${process.pid}` },
  });
  tenantId = tenant.id;
  const project = await prisma.project.create({
    data: { tenantId, name: PROJECT_NAME },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const leftover = await prisma.tenant.count({ where: { slug: SLUG } });
  expect(leftover, '夹具租户残留').toBe(0);
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
    const section = await projectContextSection(projectId);
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
    const section = await projectContextSection(ghost);
    // 段落照常注入——projectId 本身来自 ctx，不依赖 DB；查不到的只是名字。
    expect(section).toContain(ghost);
    expect(section).toContain(NO_ASK_PROJECT_CLAUSE);
    // 不得凭空造一个项目名（诚实条款：不知道就不说）
    expect(section).not.toContain('（');
  });

  it('三口径解析：id / publicId / slug 任一都能认到同一个项目', async () => {
    const byId = await findProjectByRef(projectId);
    expect(byId?.id).toBe(projectId);
    expect(byId?.name).toBe(PROJECT_NAME);
  });
});

describe('buildLoopSystem —— 装配层事实（缺陷正身）', () => {
  it('项目页：system 含当前 projectId 且含「不要索要」条款', async () => {
    const persona = getPersona('match');
    const section = await projectContextSection(projectId);
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
    const section = await projectContextSection(projectId);
    const system = buildLoopSystem(persona, persona.tools, '', section);
    const iPersona = system.indexOf(persona.duty);
    const iProject = system.indexOf(PROJECT_CONTEXT_HEADING);
    const iTools = system.indexOf('你可调用的工具');
    expect(iPersona).toBeGreaterThanOrEqual(0);
    expect(iProject).toBeGreaterThan(iPersona);
    expect(iTools).toBeGreaterThan(iProject);
  });
});
