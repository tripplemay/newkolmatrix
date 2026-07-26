// M4.7-FRONTDESK F005 — 诚实透传：专家结论不得被前台圆掉
//
// 【它防的是什么】洞察专家返回「ROI 证据不足、缺转化分子」，前台在综合成一段话时
// 很可能圆成「ROI 大约 1.8x」。M4-INSIGHT 好不容易钉住的「分子缺显证据不足绝不
// 填 0」，会在前台这一层被重新抹平——而单一前台之后，用户**只听得见前台的声音**，
// 这一层松了，下面所有的诚实都白做。
//
// 判定不靠读模型的话，靠结构化字段：任一工具产物里 `basis==='insufficient_evidence'`
//（复用 domain/roi-compute.ts 既有三态，不另发明）→ insufficientEvidence=true。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  FRONT_DESK_AGENT_ID,
  FRONT_DESK_HONESTY_CLAUSE,
  getPersona,
  listPersonas,
} from '../../src/lib/agent/registry';
import { buildLoopSystem } from '../../src/lib/agent/system-assembly';
import {
  INSUFFICIENT_EVIDENCE_BASIS,
  detectInsufficientEvidence,
  runSpecialistLoop,
} from '../../src/lib/agent/specialist-loop';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-f005-${process.pid}`;
let tenantId: string;
let projectId: string;
let ctx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F005 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F005 项目 ${process.pid}` },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: FRONT_DESK_AGENT_ID, projectId, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ logs, pas, projects, tenants }).toEqual({
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('条款本身（语义锚点用字面量钉，不引用常量自证）', () => {
  it('前台诚实条款含「不得改写」「不得给出任何数值结论」', () => {
    // 【为什么钉字面量】其余断言都引用 FRONT_DESK_HONESTY_CLAUSE 常量本身——
    // 改常量等于两边一起改，是同义反复。M4.6 与本批 F003 已各栽一次。
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得改写');
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得给出任何数值结论');
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('没答完');
    expect(
      FRONT_DESK_HONESTY_CLAUSE,
      '不得出现允许估算/圆场的措辞——那正是本条款要禁的',
    ).not.toMatch(/可以(估算|大致|约莫)|给个大概|自行判断数值/);
  });

  it('条款挂在前台的 system 上，且**只**挂在前台身上', () => {
    const front = getPersona(FRONT_DESK_AGENT_ID);
    expect(buildLoopSystem(front, front.tools, '', '')).toContain(
      FRONT_DESK_HONESTY_CLAUSE,
    );
    for (const p of listPersonas()) {
      if (p.id === FRONT_DESK_AGENT_ID) continue;
      expect(
        buildLoopSystem(p, p.tools, '', ''),
        `${p.id} 不该挂前台的转述纪律（它不对用户说话）`,
      ).not.toContain(FRONT_DESK_HONESTY_CLAUSE);
    }
  });
});

describe('检出器：走结构不走文字', () => {
  it('工具产物里 basis=insufficient_evidence → 检出 + 原样收走 gaps', () => {
    const r = detectInsufficientEvidence([
      {
        projects: [
          {
            roi: null,
            basis: INSUFFICIENT_EVIDENCE_BASIS,
            gaps: ['缺转化回传源', '缺曝光数据'],
          },
        ],
      },
    ]);
    expect(r.flag).toBe(true);
    expect(r.reasons).toEqual(['缺转化回传源', '缺曝光数据']);
  });

  it('有证据的零（basis=computed, roi=0）不算证据不足', () => {
    // 这是 M4-INSIGHT 的关键区分：**降级是否诚实看 basis，不是看数值**。
    const r = detectInsufficientEvidence([{ roi: 0, basis: 'computed' }]);
    expect(r.flag).toBe(false);
  });

  it('zero_spend 也不算证据不足（除零无定义 ≠ 缺证据）', () => {
    const r = detectInsufficientEvidence([{ roi: null, basis: 'zero_spend' }]);
    expect(r.flag).toBe(false);
  });

  it('嵌套结构里也能检出（产物形状各工具不同，不能只看顶层）', () => {
    const r = detectInsufficientEvidence([
      { a: { b: [{ c: { basis: INSUFFICIENT_EVIDENCE_BASIS, reason: '缺分子' } }] } },
    ]);
    expect(r.flag).toBe(true);
    expect(r.reasons).toEqual(['缺分子']);
  });
});

describe('子 loop 透传', () => {
  it('专家调 compute_roi 拿到证据不足 → 结果里 insufficientEvidence=true', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: '这个项目 ROI 如何？',
        ctx,
        model: scriptedGenerateModel([
          { toolName: 'compute_roi', input: { projectId } },
          { text: '数据不足以给出 ROI。' },
        ]),
      });
      expect(
        run.insufficientEvidence,
        '本地夹具项目无转化回传源 → 必然证据不足',
      ).toBe(true);
      expect(run.insufficientReasons.length).toBeGreaterThan(0);
    } finally {
      sentinel.restore();
    }
  });

  it('专家没碰任何证据类工具 → 字段为 false（不无中生有）', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'match',
        question: '有哪些组合？',
        ctx,
        model: scriptedGenerateModel([{ text: '三组。' }]),
      });
      expect(run.insufficientEvidence).toBe(false);
      expect(run.insufficientReasons).toEqual([]);
    } finally {
      sentinel.restore();
    }
  });
});

describe('工具出口层：证据不足时产物里不得夹带数值结论（F005 链上断言）', () => {
  it('consult_specialist 的产物在 insufficientEvidence=true 时，answer 不含数值结论', async () => {
    // 【首轮验收缺项】acceptance 明列「链上机械断言前台不出数值结论」，交付物完全没有。
    // 前台的最终措辞属 L2（真模型），但**工具出口这一层**可以机械断言：
    // 专家自己在证据不足时就不该给数字——这是 SPECIALIST_SCOPE_CLAUSE 的要求，
    // 也是前台唯一的事实来源。出口层守住，前台才没有编数字的原料。
    const { executeTool } = await import('../../src/lib/agent/execute');
    const sentinel = installNoNetworkSentinel();
    try {
      const res = (await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: 'ROI？' },
        {
          ...ctx,
          consultBudget: { used: 0, max: 2 },
          model: scriptedGenerateModel([
            { toolName: 'compute_roi', input: { projectId } },
            { text: '本期分子无回传源，ROI 算不出来。' },
          ]),
        },
      )) as { output: { insufficientEvidence: boolean; answer: string } };
      expect(res.output.insufficientEvidence, '前提：本地夹具必然证据不足').toBe(
        true,
      );
      // 机械判据：证据不足时 answer 里不得出现"ROI 是/约/大致 + 数字"这类结论形态
      expect(
        res.output.answer,
        '证据不足却给了数值结论 —— M4-INSIGHT 钉住的诚实在这一层被抹平',
      ).not.toMatch(/(ROI|回报率)\s*(是|为|约|大致|大约|≈|~)?\s*[0-9]+(\.[0-9]+)?\s*(倍|x|X|%)?/);
    } finally {
      sentinel.restore();
    }
  });

  it('活性证明：同一判据能抓住"编了个数字"的产物', () => {
    // 若判据本身抓不到目标，上面那条恒绿、毫无意义（本会话反复踩过这个坑）。
    const fabricated = '本期 ROI 大约 1.8 倍，建议加投。';
    expect(fabricated).toMatch(
      /(ROI|回报率)\s*(是|为|约|大致|大约|≈|~)?\s*[0-9]+(\.[0-9]+)?\s*(倍|x|X|%)?/,
    );
  });
});
