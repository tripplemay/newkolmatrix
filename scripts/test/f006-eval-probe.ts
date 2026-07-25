// M4-INSIGHT F006 独立验收探针（Evaluator 产物，非产品代码）
//
// 前置：本地 dev DB 起在 .env 的 DATABASE_URL（docker newkolmatrix-dev-db）。
// 运行：
//   node --env-file=.env --import tsx scripts/test/f006-eval-probe.ts
//   AIGCGATEWAY_REPORT_MODEL=eval-big-model node --env-file=.env --import tsx scripts/test/f006-eval-probe.ts
//
// ⚠️ 零外呼保证（L2 未授权）：脚本在 import 产品模块**之前**把 AIGCGATEWAY_BASE_URL 改写为
//    本进程内的 127.0.0.1 stub（OpenAI 兼容 /chat/completions），API_KEY 为假值。
//    真网关 https://aigc.guangai.ai 在本脚本全程不可能被访问（base URL 已被本地覆盖）。
//    Node 的 --env-file 不覆盖已存在的 process.env，脚本内显式赋值优先级最高。
//
// 覆盖 F006 acceptance 中「集成测未触及」的独立面：
//   A 默认 caller 真走 gateway chat（路径/模型路由/max tokens/system 诚实条款/FACTS 段）
//   B AIGCGATEWAY_REPORT_MODEL 长文模型路由插座生效
//   C 无凭据降级：degraded=true + 首行明示 + console.warn 不静默
//   D LLM 返回空草案 → 明示抛错且不落空行
//   E 采纳并发幂等（两路并发 adopt，adoptedAt 只写一次）
//   F 跨租户采纳被拒（不静默改写他人报告）
//   G P10 双态同周期共存（projectId=null 与非空各自独立行）
//   H 全程零 PendingAction（internal 语义）
//   I 降级草案中的 XML 转义外泄观察（不判定，只取证）

import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── stub gateway（必须在任何产品模块 import 之前就位）──
interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}
const captured: CapturedRequest[] = [];
let stubReply = 'STUB-LLM-草案正文（本地 stub，非真网关）';

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* 非 JSON 请求原样记录 */
    }
    captured.push({ url: req.url ?? '', body: parsed });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-stub',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: String(parsed.model ?? 'stub'),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: stubReply },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
      }),
    );
  });
});

const results: Array<{ ok: boolean; label: string; detail?: string }> = [];
function check(ok: boolean, label: string, detail = ''): void {
  results.push({ ok, label, detail });
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const stubBase = `http://127.0.0.1:${port}/v1`;
  process.env.AIGCGATEWAY_BASE_URL = stubBase;
  process.env.AIGCGATEWAY_API_KEY = 'eval-fake-key-no-real-gateway';
  console.log(`[probe] stub gateway = ${stubBase}（真网关全程不可达）`);

  // 产品模块延迟 import：REPORT_CHAT_MODEL 在模块加载时读 env，需在覆盖后再加载
  const { prisma } = await import('../../src/lib/db/prisma');
  const wr = await import('../../src/lib/insight/weekly-report');
  const { executeTool } = await import('../../src/lib/agent/execute');
  await import('../../src/lib/agent/tools'); // 触发 native 工具注册

  const slug = `test-tenant-m4-f006-eval-${process.pid}`;
  const slug2 = `${slug}-other`;
  const tenant = await prisma.tenant.create({
    data: { slug, name: 'F006 验收探针租户' },
  });
  const tenantId = tenant.id;
  const otherTenant = await prisma.tenant.create({
    data: { slug: slug2, name: 'F006 验收探针租户B' },
  });
  const project = await prisma.project.create({
    data: { tenantId, name: '探针项目 R&D <alpha>' },
  });
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `f006-eval-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: project.id,
      kolId: kol.id,
      termsJson: {},
      payouts: {
        create: [
          {
            tenantId,
            payee: 'ProbePayee',
            amount: 987.65,
            currency: 'USD',
            basis: '探针依据',
            status: 'released',
          },
        ],
      },
    },
  });

  try {
    // ── A 默认 caller → gateway chat ──
    captured.length = 0;
    const a = await wr.draftWeeklyReport(
      { projectId: null, period: '2031-W01' },
      { tenantId },
    );
    const req = captured[0];
    check(
      captured.length === 1 && (req?.url ?? '').includes('/chat/completions'),
      'A1 默认 caller 真发出 gateway chat 请求（/chat/completions）',
      `url=${req?.url ?? 'none'} count=${captured.length}`,
    );
    const model = String(req?.body.model ?? '');
    const expectModel = process.env.AIGCGATEWAY_REPORT_MODEL ?? 'deepseek-v3';
    check(
      model === expectModel && model === wr.REPORT_CHAT_MODEL,
      'A2 模型路由 = REPORT_CHAT_MODEL',
      `wire model=${model} / expect=${expectModel}`,
    );
    const maxTok =
      (req?.body.max_tokens as number | undefined) ??
      (req?.body.max_completion_tokens as number | undefined);
    check(maxTok === 4000, 'A3 长文输出档 max tokens=4000', `wire=${maxTok}`);
    const msgs = (req?.body.messages ?? []) as Array<{
      role: string;
      content: string;
    }>;
    const sys = msgs.find((m) => m.role === 'system')?.content ?? '';
    const user = msgs.find((m) => m.role === 'user')?.content ?? '';
    check(
      sys.includes('绝不编造') && sys.includes('证据不足'),
      'A4 system prompt 含诚实铁律（绝不编造 / 证据不足）',
    );
    check(
      user.includes('<FACTS>') &&
        user.includes('987.65') &&
        user.includes('已放款') &&
        user.includes('缺口'),
      'A5 prompt 事实段 = spend 真源 + 口径 + 证据缺口',
      `spend命中=${user.includes('987.65')}`,
    );
    check(
      a.degraded === false && a.draftContent === stubReply,
      'A6 有凭据路径 degraded=false 且草案 = LLM 产物',
    );
    const rowA = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: a.reportId },
    });
    check(
      rowA.draftContent === stubReply &&
        rowA.adopted === false &&
        rowA.adoptedAt === null &&
        rowA.projectId === null &&
        rowA.period === '2031-W01',
      'A7 WeeklyReport 落库：draftContent 非空 / adopted=false / projectId=null（跨项目 scope）',
    );

    // ── G P10 双态：同周期项目级复盘独立成行 ──
    const g = await wr.draftWeeklyReport(
      { projectId: project.id, period: '2031-W01' },
      { tenantId },
    );
    const rowG = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: g.reportId },
    });
    check(
      g.reportId !== a.reportId && rowG.projectId === project.id,
      'G P10 双态：同周期 projectId=null 与非空各自独立行（scope 区分）',
      `null行=${a.reportId.slice(0, 6)} 项目行=${g.reportId.slice(0, 6)}`,
    );

    // ── D LLM 空草案 → 明示抛错，不落空行 ──
    const beforeD = await prisma.weeklyReport.count({ where: { tenantId } });
    stubReply = '   ';
    let threw = '';
    try {
      await wr.draftWeeklyReport(
        { projectId: null, period: '2031-W02' },
        { tenantId },
      );
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    stubReply = 'STUB-LLM-草案正文（本地 stub，非真网关）';
    const afterD = await prisma.weeklyReport.count({ where: { tenantId } });
    check(
      threw.includes('空草案') && afterD === beforeD,
      'D LLM 返回空草案 → 明示抛错且零落库',
      `err="${threw.slice(0, 40)}" rows ${beforeD}→${afterD}`,
    );

    // ── C 无凭据降级（明示 + console.warn 不静默）──
    const savedBase = process.env.AIGCGATEWAY_BASE_URL;
    const savedKey = process.env.AIGCGATEWAY_API_KEY;
    delete process.env.AIGCGATEWAY_BASE_URL;
    delete process.env.AIGCGATEWAY_API_KEY;
    const warns: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(' '));
    };
    const callsBeforeC = captured.length;
    let c: Awaited<ReturnType<typeof wr.draftWeeklyReport>>;
    try {
      c = await wr.draftWeeklyReport(
        { projectId: project.id, period: '2031-W03' },
        { tenantId },
      );
    } finally {
      console.warn = realWarn;
      if (savedBase) process.env.AIGCGATEWAY_BASE_URL = savedBase;
      if (savedKey) process.env.AIGCGATEWAY_API_KEY = savedKey;
    }
    check(
      c.degraded === true &&
        c.draftContent.startsWith('【降级草案】') &&
        c.draftContent.includes('证据不足'),
      'C1 无凭据 → degraded=true + 首行明示降级 + 诚实边界',
    );
    check(
      warns.some((w) => w.includes('降级固定草案')),
      'C2 降级同时 console.warn 告警（不静默）',
      `warns=${warns.length}`,
    );
    check(
      captured.length === callsBeforeC,
      'C3 降级路径零网关调用',
      `calls ${callsBeforeC}→${captured.length}`,
    );
    check(
      c.draftContent.includes('987.65'),
      'C4 降级固定草案仍基于库内真实 spend 事实',
    );
    // I 观察项：降级草案（直接面向用户）里项目名是否残留 XML 转义
    check(
      !c.draftContent.includes('&amp;') && !c.draftContent.includes('&lt;'),
      'I〔观察〕降级草案中项目名无 XML 实体外泄',
      c.draftContent.includes('&amp;') || c.draftContent.includes('&lt;')
        ? '项目名 "R&D <alpha>" 在用户可见草案里被转义'
        : '',
    );

    // ── E 采纳并发幂等 ──
    const e0 = await wr.draftWeeklyReport(
      { projectId: null, period: '2031-W04' },
      { tenantId },
    );
    const [e1, e2] = await Promise.all([
      wr.adoptWeeklyReport(e0.reportId, { tenantId }),
      wr.adoptWeeklyReport(e0.reportId, { tenantId }),
    ]);
    const firstWins = [e1, e2].filter((r) => !r.alreadyAdopted).length;
    check(
      firstWins === 1 &&
        e1.adoptedAt.getTime() === e2.adoptedAt.getTime() &&
        e1.adopted === true,
      'E1 并发采纳：仅一路写入，adoptedAt 两路一致（原子条件 updateMany）',
      `winners=${firstWins}`,
    );
    const e3 = await wr.adoptWeeklyReport(e0.reportId, { tenantId });
    const rowE = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: e0.reportId },
    });
    check(
      e3.alreadyAdopted === true &&
        rowE.adopted === true &&
        rowE.adoptedAt?.getTime() === e1.adoptedAt.getTime(),
      'E2 串行重复采纳幂等：adoptedAt 未被改写',
    );

    // ── F 跨租户采纳被拒 ──
    const f0 = await wr.draftWeeklyReport(
      { projectId: null, period: '2031-W05' },
      { tenantId },
    );
    let crossErr = '';
    try {
      await wr.adoptWeeklyReport(f0.reportId, { tenantId: otherTenant.id });
    } catch (err) {
      crossErr = err instanceof Error ? err.message : String(err);
    }
    const rowF = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: f0.reportId },
    });
    check(
      crossErr.includes('采纳失败') && rowF.adopted === false,
      'F 跨租户采纳被拒且未改写他人报告',
      `err="${crossErr.slice(0, 30)}"`,
    );

    // ── H internal 语义：全程零 PendingAction（含工具直调路径）──
    const toolOut = await executeTool(
      'draft_report',
      { period: '2031-W06' },
      { tenantId, agentId: 'insight', projectId: null, env: 'default' },
    );
    const pending = await prisma.pendingAction.count({ where: { tenantId } });
    check(
      pending === 0,
      'H1 draft_report 直调 + 采纳全程零 PendingAction（internal，无闸门）',
      `pendingAction=${pending}`,
    );
    const out = toolOut.output as { adopted: boolean; reportId: string };
    check(
      out.adopted === false && Boolean(out.reportId),
      'H2 工具直调输出 adopted=false（只起草不采纳）',
    );

    // ── J〔观察〕同周期并发起草是否堆重复行（文件头覆盖策略只保顺序重入）──
    await Promise.all([
      wr.draftWeeklyReport(
        { projectId: null, period: '2031-W07' },
        { tenantId },
      ),
      wr.draftWeeklyReport(
        { projectId: null, period: '2031-W07' },
        { tenantId },
      ),
    ]);
    const dupCount = await prisma.weeklyReport.count({
      where: { tenantId, projectId: null, period: '2031-W07' },
    });
    check(
      dupCount === 1,
      'J〔观察〕同周期并发起草不堆重复行',
      `rows=${dupCount}（顺序重入覆盖策略已由集成测证；并发为观察项，无唯一约束）`,
    );

    const failed = results.filter((r) => !r.ok);
    console.log(
      `\n[probe] ${results.length - failed.length}/${results.length} 断言通过`,
    );
    if (failed.length) {
      console.log('[probe] 未通过：');
      for (const f of failed) console.log(`  - ${f.label} ${f.detail}`);
    }
    console.log(
      `[probe] 网关调用总数（全部指向本地 stub）= ${captured.length}；真网关调用 = 0`,
    );
  } finally {
    // 夹具清理（projectId=null 行不随 project 级联，显式清）
    await prisma.weeklyReport.deleteMany({ where: { tenantId } });
    await prisma.pendingAction.deleteMany({ where: { tenantId } });
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.payout.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.project.deleteMany({ where: { tenantId } });
    await prisma.kol.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenant.id] } },
    });
    await prisma.$disconnect();
    server.close();
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

void main();
