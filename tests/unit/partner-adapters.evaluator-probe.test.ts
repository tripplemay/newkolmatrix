// M3-B-DELIVERY F004 — Evaluator 独立探针（不是 Generator 测试的副本）
//
// 立场：Generator 的 `partner-adapters.test.ts` 已覆盖 mock 契约 + 选择器分支 + fetch 哨兵。
// 本文件只补它**够不到**的角度，全部为独立取证：
//
// P-1 静态零外呼：`globalThis.fetch` 哨兵只拦 fetch 一条路（实测：注入 node:https 外呼后
//     Generator 用例仍全绿）。这里改用源码静态扫描兜住 http/https/undici/net/child_process
//     等所有外呼载体——「零外呼」不能只靠一种探测器。
// P-2 无绕过入口：payout / distribute_keys 必须经选择器取适配器，不得直接 new Mock*（否则
//     M5 接真时会出现「一半走选择器、一半写死 mock」的分叉）。
// P-3 明文 key 不落库（P8）：分发留痕的 summary 与 payload 只能出现 keyRef，不得出现明文值。
// P-4 幂等键与金额的**逐字节透传**（不四舍五入、不截断）——放款留痕是资金追溯的唯一凭据。
// P-5 mock 自身**不做**幂等去重（同键重入会写两条标记）——这是事实记录，说明「不双放」的
//     真防线在应用层（F005），验收时不得把 mock 当成防线。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created: Array<Record<string, unknown>> = [];

vi.mock('lib/db/prisma', () => ({
  prisma: {
    operationLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: `log-${created.length}` };
      },
    },
  },
}));

const { getEscrowPartner, getKeyDistributor, PartnerError } = await import(
  '../../src/lib/ops/partner'
);

const ROOT = path.resolve(__dirname, '../..');
const PARTNER_FILES = [
  'src/lib/ops/partner/index.ts',
  'src/lib/ops/partner/types.ts',
  'src/lib/ops/partner/mock-escrow.ts',
  'src/lib/ops/partner/mock-key-distributor.ts',
];

const ctx = { tenantId: 't-probe', agentId: 'delivery' };

beforeEach(() => {
  created.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('P-1 静态零外呼扫描（补 fetch 哨兵覆盖不到的外呼载体）', () => {
  it('partner 适配器源码不含任何网络/子进程调用点', () => {
    // 只扫代码行，注释行里的 "fetch 注入点" 之类说明文字不算命中
    const forbidden =
      /\b(fetch\s*\(|axios|node:https|node:http\b|require\(['"]https?['"]\)|from\s+['"]https?['"]|undici|node-fetch|node:net|node:dgram|child_process|XMLHttpRequest)/;
    const hits: string[] = [];
    for (const rel of PARTNER_FILES) {
      const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
        if (forbidden.test(code)) hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('partner 适配器只依赖 prisma 与自身类型（依赖面 = 零外呼的结构性保证）', () => {
    // 多行 import 也要吃到，故整文件正则而非逐行
    const imports = PARTNER_FILES.flatMap((rel) => {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      return [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map(
        (m) => m[1],
      );
    });
    const external = imports.filter((m) => !m.startsWith('.'));
    expect([...new Set(external)].sort()).toEqual([
      '@prisma/client',
      'lib/db/prisma',
    ]);
  });
});

describe('P-2 无绕过入口：两个 outbound 工具经选择器取适配器', () => {
  it('payout / distribute_keys 不直接 new Mock*（M5 接真时无分叉）', () => {
    const payout = readFileSync(
      path.join(ROOT, 'src/lib/agent/tools/payout.ts'),
      'utf8',
    );
    const keys = readFileSync(
      path.join(ROOT, 'src/lib/agent/tools/distribute-keys.ts'),
      'utf8',
    );
    expect(payout).toContain('getEscrowPartner');
    expect(keys).toContain('getKeyDistributor');
    expect(payout).not.toMatch(/new\s+MockEscrowPartner/);
    expect(keys).not.toMatch(/new\s+MockKeyDistributor/);
  });
});

describe('P-3 明文 key 不落库（P8）', () => {
  it('分发留痕只出现 keyRef，summary 不含 key 值以外的任何额外字段', async () => {
    const keyRefs = ['pool-abc', 'pool-def'];
    await getKeyDistributor().distribute(
      { dealId: 'd1', recipient: 'Creator', keyRefs, idempotencyKey: 'pa-x' },
      ctx,
    );
    const log = created[0] as {
      summary: string;
      payloadJson: Record<string, unknown>;
    };
    // 留痕里出现的 key 相关值必须严格等于入参 refs（没有"顺手"把明文塞进去）
    expect(log.payloadJson.keyRefs).toEqual(keyRefs);
    expect(Object.keys(log.payloadJson).sort()).toEqual([
      'dealId',
      'idempotencyKey',
      'keyRefs',
      'mocked',
      'recipient',
    ]);
    // summary 只报数量，不逐个列 ref（更不可能列明文）
    expect(log.summary).not.toContain('pool-abc');
  });
});

describe('P-4 放款留痕逐字节透传（资金追溯凭据）', () => {
  it('金额小数不被取整、币种/幂等键/escrowRef 原样落痕', async () => {
    await getEscrowPartner().release(
      {
        dealId: 'd-9',
        payee: 'MeepleMax',
        amount: 1234.56,
        currency: 'EUR',
        basis: '合同 c-1 + 托管 e-1 + 披露 ev-1',
        escrowRef: null, // 接口声明可空——空值路径也必须能跑通且如实留痕
        idempotencyKey: 'pa-zero',
      },
      ctx,
    );
    const payload = (created[0] as { payloadJson: Record<string, unknown> })
      .payloadJson;
    expect(payload.amount).toBe(1234.56);
    expect(payload.currency).toBe('EUR');
    expect(payload.escrowRef).toBeNull();
    expect(payload.idempotencyKey).toBe('pa-zero');
  });

  it('负数金额同样被拒（不只是 0）', async () => {
    await expect(
      getEscrowPartner().release(
        {
          dealId: 'd-9',
          payee: 'X',
          amount: -1,
          currency: 'USD',
          basis: 'b',
          escrowRef: null,
          idempotencyKey: 'pa-neg',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(PartnerError);
    expect(created).toHaveLength(0);
  });

  it('NaN 金额被拒（`!(amount > 0)` 写法的边界，防 NaN 静默通过）', async () => {
    await expect(
      getEscrowPartner().release(
        {
          dealId: 'd-9',
          payee: 'X',
          amount: Number.NaN,
          currency: 'USD',
          basis: 'b',
          escrowRef: null,
          idempotencyKey: 'pa-nan',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(PartnerError);
    expect(created).toHaveLength(0);
  });
});

describe('P-5 事实记录：mock 层不承担幂等（真防线在应用层 F005）', () => {
  it('同 idempotencyKey 连调两次 → mock 写两条标记（故不得把 mock 当去重防线）', async () => {
    const input = {
      dealId: 'd-1',
      payee: 'P',
      amount: 10,
      currency: 'USD',
      basis: 'b',
      escrowRef: null as string | null,
      idempotencyKey: 'same-key',
    };
    await getEscrowPartner().release(input, ctx);
    await getEscrowPartner().release(input, ctx);
    expect(created).toHaveLength(2);
  });
});
