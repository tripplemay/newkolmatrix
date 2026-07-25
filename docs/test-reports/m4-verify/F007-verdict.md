# M4-INSIGHT F007 验收 verdict（隔离 evaluator subagent 原样落盘）

> 批次：M4-INSIGHT ｜ feature：F007 ops/share 适配器（ShareLinkService 接口 + mock）
> 验收时间：2026-07-24 ｜ 层级：L1（本地）；L2 未触发（本 feature 要求零外呼，无需授权）
> 取证方式：磁盘自读 progress.json / features.json / docs/specs/M4-INSIGHT-spec.md §3 P4 + §9 / 源码 / 本地实跑，不依赖任何实现叙述

```
feature_id: F007
result: PASS

acceptance_checklist:
  1. ✓ ops/share 接口定义 + mock 实现两件
     — src/lib/ops/share/{types.ts(ShareLinkService/ShareContext/ShareError/ShareScope/CreateInput/CreateResult), mock-share-link.ts(MockShareLinkService), index.ts(选择器)} 三件齐；文件切分与 ops/partner 范式一一对应（types/mock/index）。
  2. ✓ mock 副作用有可观测标记（SHARE_CREATED_MARKER，沿 RELEASED_MARKER 先例）
     — mock-share-link.ts:24 `SHARE_CREATED_MARKER='create_share_link:SHARE_CREATED'`，命名格与 partner `payout:RELEASED` / `distribute_keys:DISTRIBUTED` 一致；写入 OperationLog(summary 含标记, kind=auto)，且沿用 `(ctx.db ?? prisma)` 事务写入口径（与 mock-escrow/mock-sender 同）。
  3. ✓ 生成 payloadRef + token（明文 token 仅返回一次，不落库）
     — token=randomBytes(32).toString('hex')；探针 200 次创建：全部匹配 /^[0-9a-f]{64}$/、200/200 互异、payloadRef 200/200 互异；对全部 DB 写入参数做**深度字符串遍历（含 key 名）**，明文 token 与其 16 字前缀均 0 命中，无 `token` 字段；扫描器附反向自证（把明文塞进同一 haystack 可被命中）。边界一致性：调用方 create-share-link.ts:213 落 `tokenHash: hashToken(...)`（sha256），未破坏本层契约。
  4. ✓ env 选择器行为注释明示 + 与 ops/email 差异有明文理由
     — index.ts:1-22 明文写出「本层无真实现 → prod fail-fast 无收益 → 恒 mock、prod 不 fail-fast；M5 接真才启（①真实现 ②加 key 分支 ③AbortController）」，并逐条对照 ops/email 三分支 fail-fast 前提。行为实测（provider × NODE_ENV 全表 3×3+3×6）：{未配, '', 'mock'} × {development,test,production} 恒返回 MockShareLinkService（production 不炸）；{cdn, real, resend, MOCK, ' mock', 'mock '} × 三环境一律抛 ShareError(code='not_implemented')，零静默回落。
  5. ✓ 若走 fetch 必须 AbortController（不抄 resend race）—— 本批为空集，双重取证
     — 静态：三件源码剔注释后无 `fetch(` / axios / http(s).request / new WebSocket / **Promise.race**；运行期：socket 层（net.Socket.prototype.connect）+ fetch 双哨兵下跑完整路径 0 触发。M5 硬要求清单写在 types.ts:10-15（AbortController ①、幂等键 ②、接真才启 fail-fast ③）。
  6. ✓ 单测覆盖 mock 契约 + 零外呼断言
     — tests/unit/share-adapter.test.ts 13/13 通过，覆盖选择器 4 分支 + 契约 8 项（形状/留痕/载荷/token 不入日志/随机性/quarterly/拒绝路径零副作用/ctx.db 走事务）+ 零外呼 1 项。

evidence:
  - npx vitest run tests/unit/share-adapter.test.ts   → Test Files 1 passed | Tests 13 passed (139ms)
  - npx vitest run tests/unit/share-adapter.evaluator-probe.test.ts → Test Files 1 passed | Tests 13 passed（新增独立探针，见下）
  - npx vitest run tests/unit                         → Test Files 37 passed | Tests 643 passed（F007 未破坏任何既有用例）
  - npx prisma generate && npx tsc --noEmit           → TSC_EXIT=0，0 行输出（已按 testing-env-patterns §3 先重生 client，排除 80+ 误报路径）
  - npx next lint --file src/lib/ops/share/*.ts --file tests/unit/share-adapter.test.ts → ✔ No ESLint warnings or errors
  - 零外呼「活性证明」（role-context「0 findings 必须配检测器活性证明」）：探针先自证哨兵活着——`new net.Socket().connect(9,'127.0.0.1')` 抛「禁止外呼」且计数=1，`fetch()` 同样翻红计数=1；随后跑 project+quarterly 两条完整 mock 路径 socketAttempts=0 / fetchCalls=0 / OperationLog 写入 2 条。Generator 套件只哨兵化 fetch，socket 层由本探针补齐。
  - 零公开暴露核证：publicUrl 在 200 次创建中恒 null、mocked 恒 true；无任何真实发布分支；本次验收全程零网络调用、未生成任何真实可公开访问的链接（L2 未触发、无需授权）。
  - 枚举对齐：@prisma/client 运行时 ShareLinkScope = ['project','quarterly']，与 ShareScope 联合类型值域一一对应，无第三值（prisma/schema.prisma:634-637）。
  - 范围洁净：git show --stat 3ada874 = 3 件产品代码 + 1 件单测 + progress/features 状态位，无越界改动；commit tag feat(M4-INSIGHT-F007) 与 features.json 条目对应。
  - 新增测试产物（未提交，避免与并行验收争 git index，请编排者纳入 commit）：tests/unit/share-adapter.evaluator-probe.test.ts
  - 注：工作树另有两个非本次产物的未追踪文件 scripts/test/f006-eval-probe.ts / f006-router-check.mts（他人并行验收产物，未动）。

description: 不适用——F007 六条 acceptance 全部逐条实测通过（PASS）。
steps_to_reproduce: 不适用。

soft_watch（不阻断，不影响 PASS 判定）:
  - SHARE_LINK_PROVIDER 大小写敏感（'MOCK' 被明示拒绝）——与 ops/partner 同口径，失败模式安全（拒绝而非静默回落），仅记录。
  - 建议 M5 接真前把 socket 层哨兵纳入常驻套件（本探针已提供实现），届时真实现落地后 fetch-only 哨兵覆盖面不足。
```

## 复现命令（任何人可独立重跑）

```bash
npx prisma generate
npx tsc --noEmit
npx vitest run tests/unit/share-adapter.test.ts
npx vitest run tests/unit/share-adapter.evaluator-probe.test.ts   # Evaluator 独立探针（活性证明 + 深度 token 扫描 + 选择器全表）
npx vitest run tests/unit
npx next lint --file src/lib/ops/share/index.ts --file src/lib/ops/share/types.ts --file src/lib/ops/share/mock-share-link.ts
```

## 验收边界声明

- 本次未修改任何产品代码（`src/` / `prisma/` / 配置 / 文档基线零改动），未修改 `progress.json` / `features.json`
- 新增测试产物仅一件：`tests/unit/share-adapter.evaluator-probe.test.ts`
- 本次验收零网络调用：未生成任何真实可公开访问的分享链接，未对外暴露任何内容（spec §7 零真实公开暴露）
- F008 / F012 层面的闸门与 E2E 闭环不在本 verdict 判定范围内（仅作为边界一致性证据引用 create-share-link.ts:213）

—— Andy/evaluator-subagent（隔离上下文，2026-07-24）
