# 验收环境与测试稳定性 Patterns（框架沉淀）

> 原为 `harness/evaluator.md` §13-§16 / §18-§19，v1.0 重构移入 patterns/。Evaluator 跑 L1/L2 验收命中对应技术栈（Prisma / Node / jsdom / Playwright / 字体子集 / RLS）时按需查阅；`harness/evaluator.md` 保留流程性规则。

---

## 1. L2 烟测含字体子集（Material Symbols / etc）必须 ≥ 5 dynamic callsite spot check

**背景：** BIx F005-B Material Symbols self-host 子集脚本仅 3 grep pattern，漏 5 类动态范式（JSX prop / 三元 / 对象值 key≠icon / 数组元素 / return + ?? fallback），prod 用户在 dashboard / discovery / crm / roi / database / knowledge-base 6 页都看到 19 个字符方框（`TRENDING_FLAT` / `bookmark_added` 等）。spec §F005 acceptance "100+ 处 material-symbols-outlined 全渲染无字符方框" 是抽样验证，未跑全 callsite。

**Reviewer L2 烟测处理规则：**

| 情境 | 处理 |
|---|---|
| Feature 含字体子集（Material Symbols / Font Awesome subset / 自定义 woff2 等） | L2 烟测必须 spot check ≥ 5 个 dynamic callsite（不只看 grep 出的 baseline icons）。dynamic = JSX prop / 三元 / 对象值 / 数组 / return + ?? fallback 等 grep pattern 难命中的写法 |
| Spot check 命中字符方框 / 缺字 | 标 FAIL，触发 fixing。同时建议 Generator 在 manifest 文件显式列漏 icon |
| 子集脚本无 manifest 文件兜底 | signoff 注 soft-watch："字体子集脚本仅靠 grep，建议下批次加 manifest 兜底" |

**配套：** 详见 `framework/patterns/material-symbols-pattern.md`（5 漏范式 + manifest 维护 + CI 守门 test 完整 pattern）。该文件已在 BL-025-F009 落地。

来源：BIx hotfix bb637a1（19 漏 icon prod 暴露）+ BL-025-F009 守门加固 + framework CHANGELOG v0.9.6 [#6]。

---

## 2. 回归测试稳定性 — fire-and-forget audit pattern 测试约束

**背景：** Server actions 用 `void logAudit({...})` fire-and-forget 模式（不 await）让业务路径少一次 round-trip，但 integration test 在 action 返回后立即查 audit_log 会偶发 race（CI 高并发下成立，本地 dev 不易复现）。BL-025 F003/F004 两轮跨同 commit 一次 PASS 一次 FAIL 验证为 flake，rerun 全绿。

**case 站点：** `src/app/[locale]/(app)/kols/[id]/actions.ts:83`（`void logAudit`）+ `tests/integration/kol-profile.test.ts:127`（`expect(audits).toHaveLength(1)`）。

**两选一规约：**

| 方案 | 适用场景 |
|---|---|
| (A) **Action 内部 `await logAudit`** | 业务路径不是热点（< 100 RPS） + 测试需观察 audit_log，简单可靠 |
| (B) **测试改用 `vi.waitFor(() => expect(audits)...)`** | 业务路径是热点，必须保留 fire-and-forget；waitFor 50-100ms retry 上限 |

**Generator 选择决策（开工时落 generator_handoff）：** 优先 (A)，仅在业务路径明确是热点（>100 RPS / <100ms p99）时降级 (B)。

**Reviewer 验收：** 看到 `void logAudit` + integration test 直接 `expect(audits)` 同时存在 → 直接标 PARTIAL（race condition 风险），要求 Generator 选 (A) 或 (B) 之一显式声明。

来源：BL-025 F004 CI flaky `kol-profile.test.ts` + framework CHANGELOG v0.9.6 [#7]。

---

## 3. L1 本机 tsc 跑前必先 `prisma generate`（v0.9.10 — BL-033 沉淀）

**背景：** Reviewer L1 跑 `npx tsc --noEmit` 时如本机 prisma client 在最近 schema migration 后未重生，会出现 80+ "Property 'asset' does not exist on PrismaClient" 误报。看似 in-flight 批次引入实际是本地环境状态。

**误报模式：**
```
src/app/[locale]/(app)/assets/actions.ts:142:23 - error TS2339:
Property 'asset' does not exist on type 'PrismaClient<...>'.
```

类似错误 80+ 行但真实代码完全正确。Reviewer 误判为"批次引入"将导致：

1. Reviewer 拒绝接收，写 evaluator_feedback "TypeScript 80 errors"
2. Generator 困惑 "本地 npm test 全绿 + CI 8/8 success 怎么 tsc 80 errors"
3. 浪费 1 轮排查时间发现是 prisma client 未生成

**修订规则（L1 标配前置命令，顺序固定）：**

```bash
# Reviewer L1 启动必跑
npx prisma generate    # 1. 重生 prisma client（30s）
npx tsc --noEmit       # 2. 然后跑 tsc（确保读最新 client types）
npm run lint           # 3. lint 跑（独立于 prisma client，但同一阶段一起跑）
```

**适用范围：**

- 任何含 schema.prisma 改动的批次（BL-025/BL-030/F004 等）
- Reviewer 切到新 worktree 或 git pull 含 migration 后首跑
- CI 不受影响（CI 在 npm ci 后自动跑 postinstall hook 触发 prisma generate）

**反面（BL-033 Reviewer 命中）：** Reviewer 接 BL-033 verifying 启动跑 tsc，因前批次 schema 改过 + 本机未跑 prisma generate → 80 errors。`prisma generate` 后立即清空。本可作为 L1 标配前置避免误判。

来源：BL-033 Reviewer signoff §Framework Learnings 新坑。

---

## 4. L1 本机 Node 版本必须与 `.nvmrc` 一致（v0.9.11 — BL-020-F002 沉淀）

**背景：** Node 25.x 引入 native `localStorage`，但要 `--localstorage-file <path>` flag 才启用持久化路径；无 flag 时 jsdom 29 的 `window.localStorage` shim 与 Node 25 native 占位 detect 互斥触发 fall-through，结果 `window.localStorage` 变 `undefined`。所有触及 `window.localStorage.setItem/getItem/clear` 的测试 100% fail，且本地复现明显但 CI（Node 20 LTS）不复现 — Reviewer 误判风险高。

**误报模式：**
```
TypeError: window.localStorage.setItem is not a function
  at AiSuggestionsClient.test.tsx:42
```

类似错误集中在 jsdom + localStorage 路径，本机 fail / CI Node 20 PASS。

**修订规则（L1 启动前置 + 误判判据）：**

```bash
# Reviewer / Generator L1 启动必查
node -v                          # 必须与项目根 .nvmrc 一致
cat .nvmrc                       # 当前锁 Node 20（lts/iron）
nvm use                          # 不一致时切换；无 nvm 装 Node 20 LTS
```

**适用范围：**

- 任何含 jsdom 环境单测 / `window.localStorage` / `window.sessionStorage` 测试的批次
- Node 22+ 引入 native `Web Storage` API 后均可能触发兼容性新坑
- 本机 fail 但 CI PASS 的 jsdom 类测试，**先核 Node 版本一致性**，不一致时本机 fail 不算反面证据

**反面（BL-020-F002 命中）：** Reviewer 本机 Node 25.7 + jsdom 29 跑 `AiSuggestionsClient.test.tsx` 2 集成 case fail，CI run 25330969685 Node 20 PASS。验证差异源于 Node 25 native localStorage incompat，不是产品 bug；锁 Soft-watch S4 + 本规则。

**来源：** BL-020-F002 Reviewer L1 本机 unit fail / CI PASS 对比。

---

## 5. E2E suite 稳定性诊断（v0.9.20 — BL-060 沉淀）

**背景：** BL-060 fix-round 1 单点放宽 timeout/正则只缓解症状，整组 E2E 仍 FAIL；fix-round 2 抽 `tests/e2e/<role>.setup.ts` + 各 spec opt-in `test.use({ storageState })`，N 次 login 收敛 1 次后 suite PASS。

**诊断信号：** 单例 PASS / 整组 FAIL = **suite-level isolation 问题**（不是 case 内容/正则问题）。

**候选根因：**
- 每 case `beforeEach` 重 login 累积抖动
- staging 8GB RAM 资源压力

**根治方案：** 抽 `tests/e2e/<role>.setup.ts` + 各 spec opt-in `test.use({ storageState })`，N 次 login 收敛 1 次。

**反模式：** 单点放宽 timeout / 正则只缓解症状，不解决 suite-level isolation。

**来源：** BL-060 fix-round 1（cc82a54 正则放宽失败）→ fix-round 2（f75cafd storageState PASS）。

---

## 6. SQL 跨 tenant 全量查询 RLS 注意（v0.9.20 — BL-061 沉淀）

**背景：** BL-061 F003 验收时 Reviewer 用 `kolmatrix_app` role + Prisma RLS 跨 tenant 查 audit_log 返回 0 行，误判为数据缺失；实际是 RLS 视角限制。

**处理规则：** 跨 tenant 全量验收 SQL 必须 `sudo -u postgres psql kolmatrix(_staging)` superuser bypass RLS。普通 `kolmatrix_app` role + Prisma RLS 跨 tenant 看 0 行（不是数据缺失，是 RLS 视角限制）。Reviewer only-read 验收尤其要走 superuser path。

**来源：** BL-061 F003 Generator 实战发现 + Codex Reviewer signoff 确认。

---

## 7. Next.js UI 实测走 standalone，不走 `next dev`（v1.0.6 — KOLMatrix ARCH-M05 沉淀）

**背景：** ARCH-M05 验收期间 `next dev` **全路由 500 / 白屏**，与被测代码无关：Next 15 devtools 的 `segment-explorer` 与 RSC client manifest 冲突。C 组、D 组两个互不相通的隔离 evaluator **各自独立踩中**并各花了排查时间——典型的「环境误报吃掉验收预算」。

**规律：** 本类项目的 UI 实测（浏览器探针、E2E、视觉回归）**一律走生产构建**：

```bash
npx next build
PORT=3000 node .next/standalone/server.js
```

理由不止是绕开这个坑：standalone 才是**线上实际跑的产物**，dev server 的 HMR / RSC 开发态与生产行为本就存在差异，验收基于 dev 等于验错了对象。

**Evaluator 纪律：** 探针脚本头部显式声明前置（`已 next build 且 standalone server 起在 BASE`），别让下一个隔离 evaluator 再踩一次——**跨隔离上下文的坑必须写进脚本本身**，因为 fresh context 读不到上一个 evaluator 的对话。

**来源：** KOLMatrix ARCH-M05 verify C 组 / D 组（INFO-1，两组独立命中）。

---

## 8. 闸门 / 签名 / token 类 feature 的回归必须含「HTTP 路由创建 → 后续验证」全链（v1.0.12 — M3-A round1 沉淀）

**坑：** M3-A payloadHash 中毒 critical（见 database-patterns §9）被 gate-smoke + reach-e2e **双绿漏检**——两者均为**服务层直调**且入参恰无 undefined 键，绕开了 HTTP 路由字面量入参的毒化路径。主用户路径（V6 页面 POST → confirm）反而恒 403。

**规律：** 服务层测试 ≠ HTTP 链测试。outbound 闸门这类**跨请求状态机**（创建请求算的值要在后续请求里复验），必须至少一条回归走真 HTTP 路由全链：`POST 创建端点 → GET 详情 → confirm → execute`。zod/route 层的入参解析、序列化、中间件都可能改写载荷——服务层直调全部绕过。

**Evaluator 受理判据：** 闸门类 feature 的测试清单里若只有 executeTool / 服务函数直调，无 HTTP 端点全链用例 → 按测试盲区记录（不因绿灯放行主路径未覆盖）。

**来源：** KOLMatrix M3-A-REACH-CRM round1（confirm 恒 403 critical，服务层双测全绿漏检）。

---

## 9. mock 发送类验收清态必须按业务观测标记清，不能只按 ref=PA.id 清（v1.0.12 — M3-A round1 沉淀）

**坑：** M3-A 验收后清态按 `OperationLog.ref = PendingAction.id` 删除留痕，但 `SENT_MARKER` 标记行的 `ref` 语义是 projectId（非 PA.id）→ 清态漏删 → 污染 dev 租户活动流 → 后续批次视觉基线（today 页 feed）首跑翻红，被误判为产品回归。

**规律：** mock 副作用的观测标记行（SENT_MARKER / RELEASED_MARKER / SHARE_CREATED_MARKER 族）各有自己的 ref 语义，清态脚本必须**按标记文本**（`summary contains MARKER`）+ 夹具租户双键清理，不能假设全部留痕都挂在 PA.id 上。写 e2e/验收脚本的 finally 清理段时，逐类副作用核对其落库行的实际键位。

**注意（M4 补充证据）：** append-only 语义的留痕表（OperationLog）在 dev 租户的 marker 行也可**选择保留不删**（与「只 INSERT」语义一致）——但必须知晓其后果：会持续出现在活动流 → 污染本机含 feed 的视觉基线（M4 O2 实测）。删或留是一个显式决定，不能无意识。

**来源：** KOLMatrix M3-A-REACH-CRM round1（today feed 基线污染误判）+ M4-INSIGHT O2（marker 保留的后果实测）。

### 9.1 清理段自身绝不可再抛——它一抛就同时干掉「首因可见」与「环境干净」（v1.0.13 — M4.5 F010 沉淀）

**反面：** `pendingIds` 先 push 后 assert，闸门红线一回归就把 `undefined` 塞进 `deleteMany({ in: [...] })`，
Prisma 拒绝 → `finally` 整段中断 → 原始 `ASSERT FAIL` 被二次抛错**盖掉**，同时 dev 库残留污染
下一个隔离 evaluator 的视觉基线。**而 e2e 失败在 fixing 轮里是常态，那正是清理最该生效的时刻。**

**三条施工要求：**
1. 清理段**每步独立 try/catch 只告警**（`cleanupStep` 包装器），整段绝不外抛；
2. 入删除清单的 id **必先过滤** undefined/null；
3. **清理键不得依赖「被测行为正确」才存在的字段**——本例 `gateLogId` 在闸门回归时恒 null、
   `projectId` 因 scope=quarterly 恒 null，两把键同时落空。**跑前 id 基线差集**才是不受被测代码影响的键。

**但清态断言必须写在包装器之外。** 把断言包进 `cleanupStep` = 被它「吞掉异常绝不外抛」的契约吃掉，
断言写在会吞异常的包装器里等于没写（M4.7 实测：删清理步后脚本照常 exit 0，只多一行没人消费的 stderr）。

**清单与断言必须同源，且要两层。** 见 [audit-methodology.md §7](audit-methodology.md) 末段：
登记表（`where` 只写一次，同时派生删除与断言）挡键漂移；再压一层**不从登记表派生**的整表普查挡整条被删。

**来源：** KOLMatrix M4.5-AGENT-LOOP F010 首轮 PARTIAL + M4.7-FRONTDESK 复验轮二/轮三 F009。

---

## 10. 注入缝的 caller 必须无条件调用——环境降级只对**默认** caller 生效（v1.0.13 — M4-INSIGHT 沉淀）

**坑：** `draftWeeklyReport` 在无凭据时**忽略注入的 mock caller**直接走降级分支 →
本地（`.env` 有凭据）测试全绿、CI（无凭据）三条断言红。

**规律：** `fn(input, ctx, llm = defaultCaller)` 形态的注入缝，
环境判定（凭据 / 开关 / feature flag）必须包在 `llm === defaultCaller` 条件内。
否则测试注入被**静默改道**，且只在与开发机环境相异的 CI 暴露——本地全绿不构成通过依据。

**同族：** agent loop 的 `model` / `ctx` 注入缝同理，见 [agent-loop-patterns.md §1](agent-loop-patterns.md)。

**来源：** KOLMatrix M4-INSIGHT F006（CI run 30119127279）。

---

## 11. `git grep` 类断言只搜「已跟踪」文件 → 新文件未 commit 时恒空绿（v1.0.13 — M4.5 沉淀）

**坑：** 「全仓无批量确认端点」的架构约束断言本地绿、入库后 CI 才红——
新文件此前不在 git 索引里，`git grep` 根本看不见它；且文件头把反面教材端点名写进了注释。

**规律：** 以 `git grep` 为证据的架构约束断言：
1. 必须**滤掉注释行**（否则文件头的反面教材会自己把断言打红，或诱使你放宽模式）；
2. **本地首次绿不算数**——要么 `git add` 后再跑，要么改用文件系统读取（`readFileSync` / 目录扫描）。

**来源：** KOLMatrix M4.5-AGENT-LOOP F007。

---

## 12. 测试钉「恰好 N 条」的全量清单会连坐后续批次的合法扩展（v1.0.13 — M4-INSIGHT 沉淀）

**坑：** M4 F011 注册 `weekly-draft` 例程后，`kol-sync` 测试里
`expect(names).toEqual([恰 3 条])` 无辜翻红——它守的根本不是这次改动。

**规律：** 清单**本身不是验收对象**时，断言写「目标项在场 + 既有前缀序稳定」而非全量相等。
全量相等只用于**清单即验收对象**的场景（如 doc-freshness 的「文档声称 N 件 = 实物 N 件」）。

**来源：** KOLMatrix M4-INSIGHT F011。

---

## 13. vitest 对**动态 import** 模块的 mock 在并发下失效（v1.0.14 — KOLMatrix M5.1b F005 沉淀）

**现象（vitest 4.1.10 实测）：** 被测代码里 `await import('./x')` 形态的依赖，`vi.mock('.../x', factory)`
**只在顺序调用下成立**。把两次调用放进同一个 `Promise.all`，其中一路会拿到**未被 mock 的真模块**；
一旦泄漏，真模块进入缓存，其后所有调用都走真链。

**为什么难查：症状指向的方向与真因无关。** 本批的表现是 next-auth 抛
`` `headers` was called outside a request scope`` ——看起来像「测试没建请求作用域」，实际是 mock 没生效。
20 行探针可复现，与产品代码无关。

**谁会撞上：** 任何「并发 N 个请求验证互不串扰」的用例——而这类用例恰恰是多租户 / 上下文传播批次的核心断言。

**绕法：** 并发用例改用被测模块自己**静态导出**的注入缝（`vi.mock` 对静态 import 不受影响），
顺序用例仍走真链；两条路径的适用范围各自标注在文件头。若两者需共存，给共享的 seam 加一个
「不作答则回落真实现」的三态解析器（identity / null / undefined）。

---

## 14. 并发用例里「集合相等」是伪断言（v1.0.14 — KOLMatrix M5.1b F005 沉淀）

并发两路各断言「这批记录里出现过 A 和 B」——**A/B 两路互换上下文后集合仍是 `{A,B}`，恒绿**。

**规律：并发用例的断言必须逐条配对**（每条记录内部自洽：这次操作要的身份 == 上下文里的身份 ==
落到外部系统的身份），不能只断言聚合形状。聚合断言只配当「两边都到场」的前置检查。

**这条是变异证活本身价值的一次实证：** 盲区是变异找出来的，不是想出来的——那条变异
（把入口包裹的租户换成另一个租户）**只红了一半用例**，加固成逐条配对后同一变异红全部四条。
若那次只跑了「红没红」而不看**红了几条**，同样会漏掉。

---

## 版本历史

| 日期 | 修订 | 来源 |
|---|---|---|
| 2026-07-09 | v1.0 重构：自 `harness/evaluator.md` §13-§16 / §18-§19 原文迁出成独立 pattern 文件 | 框架 v1.0 目录分层 |
| 2026-07-21 | §7 Next.js UI 实测走 standalone 不走 `next dev`（devtools × RSC manifest 冲突） | KOLMatrix ARCH-M05 |
| 2026-07-25 | §8 闸门类回归必须含 HTTP 全链 + §9 mock 清态按业务标记清（v1.0.12） | KOLMatrix M3-A round1 critical ×2（+ M4 O2 补充证据） |
| 2026-08-02 | §9.1 清理段绝不可再抛（+ 断言须在包装器之外、两层同源）· §10 注入缝 caller 无条件调用 · §11 `git grep` 断言恒空绿 · §12「恰好 N 条」清单连坐（v1.0.13）| KOLMatrix M4 / M4.5 / M4.7 |
| 2026-08-09 | §13 vitest 动态 import mock 并发失效 · §14 并发用例「集合相等」是伪断言（v1.0.14） | KOLMatrix M5.1b F005 |
