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
