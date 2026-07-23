# M3-A-REACH-CRM 首轮验收报告（round 1）

> 日期：2026-07-23 · 车道：快车道 · 形态：fan-out 隔离验收（10 evaluator subagent：6 并行 + 4 串行独占）+ FAIL/PARTIAL 对抗复核（3 复核员，只证伪不放宽）
> 编排：Andy/主上下文（仅编排与机械汇总）；验收署名：Andy/evaluator-subagent ×13
> 工具面：gate:smoke / reach:e2e / vitest 504 例 / test:visual 13 基线 / 端点实测 / 独立对抗探针

## 总表

| Feature | 判定 | issues | 对抗复核 |
|---|---|---|---|
| F001 | **PASS** | — | （未触发） |
| F002 | **FAIL** | [critical] payloadHash undefined-键中毒：/api/reach/send 创建的 pending 在 confirm 恒 403，V6 发送真链在生产工件上不可确认；[high] 工具注册依赖 /api/agent 模块图副作用：dev 空进程直打 execute 端点 500「[gate] 工具已不存在」、reach/send 400「[tools] 未知工具」，且模块图重估后复发；[low] rate-limit fail-open 注释失真 + XFF 首段可伪造（辅助防线弱化，非闸门主防线） | 原判成立 |
| F003 | **PASS** | [low] ResendEmailSender 30s 超时为 Promise.race，未用 AbortController 真中断底层请求；[low] 幂等重入分支返回 mocked:false 硬编码，重放时输出语义轻微失真 | （未触发） |
| F004 | **PASS** | [low] ingest 落库四步（Signal.create→thread.lastSignalAt→重算→留痕）非同一事务：中途失败后 Resend 重投走防重路径直接返 200，该事件的 lastSignalAt/重算/OperationLog 留痕可能永久缺失 | （未触发） |
| F005 | **PASS** | — | （未触发） |
| F006 | **PASS** | — | （未触发） |
| F007 | **PASS** | — | （未触发） |
| F008 | **FAIL** | [critical] V6「发送」真闸门链在 UI 可达的全部路径于 confirm 步 403（payloadHash 不匹配）——主流程功能性不可用 | 原判成立 |
| F009 | **PASS** | [low] F008 审计文档与 ui-inventory 的 V6-25/V6-26 编号互换（内容一致的文档内部不一致）；[low] Evaluator 新增探针文件为未追踪测试产物，需随验收一并 commit | （未触发） |
| F010 | **PARTIAL** | [medium] architecture.md §10.4 未翻牌（acceptance 点名章节）——F004 已实装仍标「演进目标（未实装，归 M3）」；[medium] architecture.md §9.4「闸门时序（as-built）」仍画已退役单步 /api/gate 流，与同文 §9.3/§9.3.2 直接矛盾；[medium] architecture.md §7.2.1「schema 唯一权威（as-built 实物转录）」未同步 M3-A 迁移——反向漂移；[low] 次要陈旧残留：§5.2 四实体行未标 ✅、§5.5 反向漂移、src mock 注释沿用退役端点名 | 原判成立 |

**结果：7 PASS · 2 FAIL（F002/F008）· 1 PARTIAL（F010）→ 状态流转 fixing（fix_rounds=1 待复验）**

## 各 feature 完整判定（evaluator 结论原样，未改写/筛选/软化）

### F001 — PASS

```json
{
  "feature_id": "F001",
  "result": "PASS",
  "summary": "隔离验收基于实物：读 spec §4 与 schema.prisma/migration.sql 逐字段比对，并对本地 dev DB（newkolmatrix-dev-db, pg16）直查核证。npx prisma migrate status → 'Database schema is up to date!'（7 migrations）；npm run db:migrate → 'No pending migrations to apply.'；prisma migrate diff（live DB vs schema）→ 'No difference detected.' 零漂移。DB 实证：PendingActionStatus enum_range 恰 7 值且原 3 值全保留（expand 加值不删值）、4 新列全 nullable、OutreachThread_projectId_kolId_key + Signal_externalId_key 两处 UNIQUE 索引在场、Kol.contactEmail text nullable。migration.sql 纯 expand（仅建表/建类型/ADD VALUE/加 nullable 列，无 DROP/收缩）且 :5-13 含单向回滚说明（DROP 顺序正确、如实注明 PG 枚举值不可原位删除）。prisma generate → tsc --noEmit exit 0；vitest run 48 文件 504/504 全绿（与 handoff 基数一致，既有测试不破）。:355 预告注释翻牌实证：773799b^ 的「最小三态/完整 7 态 → M3」在当前 schema grep 零命中，已替换为 7 态流转 + 两步票据注释，OutboundAttempt/reconciliation 正确顺延 M3-B+（P10 一致）。六项 acceptance 全 PASS。",
  "acceptance_items": [
    {
      "item": "migration 落 prisma/migrations 且 db:migrate 干净",
      "verdict": "PASS",
      "evidence": "prisma/migrations/20260723115700_m3a_reach_four_tables_gate7_contact_email/migration.sql（152 行，commit 773799b 入库）；npx prisma migrate status → 'Database schema is up to date!'（7 migrations found）；npm run db:migrate → 'No pending migrations to apply.'；prisma migrate diff（live DB → schema.prisma）→ 'No difference detected.'"
    },
    {
      "item": "四表字段与 spec §4 逐项一致（@@unique 约束在场：Thread(projectId,kolId)、Signal.externalId）",
      "verdict": "PASS",
      "evidence": "schema.prisma:379-471 与 spec §4 逐字段比对全吻合：OutreachThread（status ReachStatus 5 态默认 pending_send / owner 默认 'reach' / lastSignalAt? / timestamps / @@unique([projectId,kolId]) :398）、OutreachMessage（direction 枚举 draft/sent/inbound / gateLogId? 软引用 :414 / providerMessageId? / sentAt?）、Quote（amount @db.Decimal(14,2) :433 / deliverablesJson Json / status 枚举 proposed/committed/rejected 默认 proposed / gateLogId?）、Signal（externalId @unique :460 / kolId?/projectId?/threadId? 软引用不强 FK / payloadJson / detectedAt）；tenantId 四表全带。DB 实证 pg_indexes：OutreachThread_projectId_kolId_key + Signal_externalId_key 两处 UNIQUE 在场"
    },
    {
      "item": "PendingAction 7 态枚举 + 4 新列",
      "verdict": "PASS",
      "evidence": "DB enum_range(NULL::\"PendingActionStatus\") 返回恰 7 值 pending/confirmed/executed/executing/failed/rejected/expired——原 3 值全保留（migration.sql:32-35 仅 ADD VALUE，加值不删值）；ticketHash(text)/ticketExpiresAt/ticketUsedAt/decidedAt(timestamp) 4 列 information_schema 实证全 is_nullable=YES（schema.prisma:505-509，migration.sql:41-44）"
    },
    {
      "item": "Kol.contactEmail String? 可空",
      "verdict": "PASS",
      "evidence": "schema.prisma:79 contactEmail String?（含 P3 人工录入 + P1 约束注释 :77-78）；DB 实证 contactEmail text is_nullable=YES；migration.sql:38 ADD COLUMN \"contactEmail\" TEXT（无 NOT NULL）"
    },
    {
      "item": "tsc + 既有全量测试不破",
      "verdict": "PASS",
      "evidence": "npx prisma generate → npx tsc --noEmit exit 0 零错误；npx vitest run → Test Files 48 passed (48), Tests 504 passed (504)——与 generator_handoff 申报基数 504 一致，无破坏"
    },
    {
      "item": "schema 注释更新（:355 M3 预告注释翻牌）",
      "verdict": "PASS",
      "evidence": "前置版本 git show 773799b^:prisma/schema.prisma :353-354 为「最小三态；…完整 7 态 + OutboundAttempt / reconciliation → M3」；当前 schema grep '最小三态|完整 7 态.*→ M3' 零命中（exit 1），已替换为 :475-477 七态流转（两步票据/原子条件 UPDATE 消 R15）+ :488-490 ADR-25 票据不变量注释，OutboundAttempt/reconciliation 顺延 M3-B+（:491，spec P10 一致）。附加：spec §5 要求的单向回滚说明在 migration.sql:5-13 在场且 DROP 顺序正确（Quote/OutreachMessage 先于 OutreachThread）"
    }
  ],
  "issues": []
}
```

### F002 — FAIL

```json
{
  "feature_id": "F002",
  "result": "FAIL",
  "summary": "隔离验收基于实物：审读 src/lib/agent/gate/{gate,http}.ts + src/lib/http/rate-limit.ts + 四条 /api/actions/[id] 路由；npm run gate:smoke 54 断言全绿（G1-G8 + G5.5 + D20 变异 + 并发竞态，exit 0）；rate-limit 单测 7/7；dev server 与生产 standalone 工件各做 HTTP 实测（分码 403/404/409/410、31 请求触发 429+Retry-After:60、票 sha256 仅存 hash、confirmed→expired 惰性翻转、reject→rejected、票重放 409、failed 无 irrev 行）。服务层协议全部达标，但 HTTP 产品面发现两个真缺陷：(1) critical——/api/reach/send 恒带 language:undefined 键，gate.ts stableStringify 将显式 undefined 键序列化参与 payloadHash，Prisma JSONB 写入丢弃该键，confirm 复算必不匹配 → 产品面创建的 pending 在生产工件上 confirm 恒 403「payloadHash 不匹配」（S3 实测复现），V6 发送真链在 confirm 卡被假阳性拒绝，既有 E2E 全为服务层直调故漏检；(2) high——工具注册依赖 /api/agent 模块图副作用，dev 空进程直打 execute 端点 500「[gate] 工具已不存在」且模块重估后复发（prod 因 boot 路由预载幸免，S1 实证）。验收夹具全部清态（Kol/Project/PendingAction/OperationLog 残留 0），:3000 已释放。L2 真投递本地不可执行（RESEND_API_KEY 仅存 VPS，U2）——本地 prod-mode 实测确认 P4 fail-fast 拒发行为正确，真发验证待部署后 prod 实测。",
  "acceptance_items": [
    {
      "item": "GET /api/actions/[id] + POST confirm/execute/reject 四端点在场且 nodejs runtime",
      "verdict": "PASS",
      "evidence": "四文件均存在且各有 export const runtime='nodejs'（route.ts:10 / confirm:12 / execute:11 / reject:12）；HTTP 实测四端点均正常响应（T1-T5、T8-T9、T23）。注意 execute 端点在 dev 空进程下因工具注册缺失 500（见 issue 2，prod 工件不受影响）"
    },
    {
      "item": "票仅 confirm 响应出现一次，DB 只存 hash",
      "verdict": "PASS",
      "evidence": "confirm 响应含 64-hex ticket（T9）；DB 行 ticketHash==sha256(ticket) 且 != 明文（T10 实测 True/False）；GET 详情脱敏不含 inputJson/任何 hash/票（T8 响应逐字段核验，gate.ts:177-201）；execute 响应与 pending 信封均无 ticket 字段（G1 断言 + T14 响应）；内部确认令牌仅存 confirmationTokenHash（G5 断言，ADR-25）"
    },
    {
      "item": "两处原子条件 UPDATE（WHERE status='pending' / WHERE status='confirmed' AND ticketUsedAt IS NULL AND ticketExpiresAt>now()）败者 409",
      "verdict": "PASS",
      "evidence": "gate.ts:244-254（confirm updateMany WHERE pending，count=0→GATE_ALREADY_DECIDED）与 :326-337（execute claim WHERE confirmed AND ticketUsedAt:null AND ticketExpiresAt>now）；G8 并发双确认/双消费恰一胜、副作用恰一次全绿；HTTP T11 重复确认 409、S5 票消费后重放 409"
    },
    {
      "item": "reject 写真实 rejected 态",
      "verdict": "PASS",
      "evidence": "gate.ts:398-431 原子条件 UPDATE 写 rejected+decidedAt+block 留痕，不再篡改 expiresAt；G6 四断言全绿（rejected/decidedAt/expiresAt 非 epoch/block=1）；HTTP T23 reject 200 {rejected:true}、T24 reject 后 confirm 409"
    },
    {
      "item": "HTTP 分码 403 GATE_TOKEN_INVALID / 404 GATE_NOT_FOUND / 409 GATE_ALREADY_DECIDED / 410 GATE_EXPIRED",
      "verdict": "PARTIAL",
      "evidence": "分码映射全部在场且实测正确：T1-T5（404×4 + 缺票 403）、T13 伪票 403、G6 票过期/确认窗过期 410、T11/T24 409、T27 confirmed→expired 惰性翻转。但 403 GATE_TOKEN_INVALID 在产品面合法 confirm 上假阳性触发（issue 1 payloadHash 中毒），分码语义在真实链路失真"
    },
    {
      "item": "P9 rate-limit：/api/actions 30/min/IP fail-open + escape hatch",
      "verdict": "PASS",
      "evidence": "http.ts:17-38 守卫 30/60s + fail-open（无 IP/内部异常放行）+ isRateLimitDisabled escape hatch；HTTP 实测同 IP 第 31 请求 429 + Retry-After:60 + {code:RATE_LIMITED}（T6/T6b）；单测 7/7（窗口滚动/桶隔离/retryAfterSec/escape hatch）。低危注记：Next 15 self-host 自注入 x-forwarded-for，本地直连实际进 ::1 桶被限流（T7 观测 429×6），代码注释「本地 dev 直连无该头」失真，null-IP fail-open 分支实际不可达（见 issue 3）"
    },
    {
      "item": "gate-smoke 升级：G1-G5 + 7 态断言 + D20 变异 + 并发双确认竞态用例全绿",
      "verdict": "PASS",
      "evidence": "npm run gate:smoke exit 0，54 断言全绿：G1-G4（服务端强制/harm 披露/internal 不拦/无阈值）+ G5/G5.5 两步票据与业务落库 + G6 分码负例 + G7 七态枚举/failed/executing 认账 + G8 并发竞态 + D20 变异（直调 execute 绕过门控→副作用发生→G1 断言必变红，证行为非关键字）；测试数据自清理"
    },
    {
      "item": "执行=消费票→副作用→同一事务 executed+irrev+业务态变更，失败→failed 无 irrev 行",
      "verdict": "PASS",
      "evidence": "gate.ts:344-372 同一 $transaction 内 executeTool(ctx.db=tx)+executed+irrev 留痕（timeout 90s）；:374-392 失败置 failed+auto 痕。G5 executed+irrev=1+OutreachMessage(sent,gateLogId)+thread 推进同事务全绿；G7 failed 无 irrev；HTTP 生产工件 S4-S6：执行管道直达 email sender（P4 prod fail-fast 拒发=预期环境行为）→ failed + ticketUsedAt 记录 + irrev=0（psql 核验）+ S5 重放 409"
    },
    {
      "item": "整链可用性：产品面（/api/reach/send 创建）的 pending 经 confirm→execute 可达终态（§9.3.2 全量 / U3 D6 stub 接通真链路的 F002 侧前提）",
      "verdict": "FAIL",
      "evidence": "生产工件实测：POST /api/reach/send 200 落 pending → POST confirm 恒 403「payloadHash 不匹配，拒绝确认」（S3；dev T18/T26 同现，覆盖带 subject 与手写草稿两条用户路径）。纯函数级复现：payloadHashOf 对含 undefined 键对象与 JSONB 读回形状哈希不一致（hash-repro.ts：476173b9 vs ff240500）。产品面所有 UI 发送的确认卡不可确认，闸门放行链路对真实用户断裂"
    }
  ],
  "issues": [
    {
      "title": "payloadHash undefined-键中毒：/api/reach/send 创建的 pending 在 confirm 恒 403，V6 发送真链在生产工件上不可确认",
      "severity": "critical",
      "evidence": "根因双点：(1) src/app/api/reach/send/route.ts:59-62 恒以字面量 { projectId, kolId, subject, body, language } 调 executeTool，language 仅在「无 subject 且 draft 行带 language」时有值，其余路径为显式 undefined 键，zod parse 保留该键；(2) src/lib/agent/gate/gate.ts:63-75 stableStringify 将显式 undefined 键序列化为 \"language\":undefined 参与 payloadHash（建墙），而 Prisma 写 JSONB 丢弃 undefined 键，confirm/execute 复算（gate.ts:232-237/316-321）读回无该键→哈希必不匹配→GATE_TOKEN_INVALID 403。生产 standalone 工件复现（S3）；dev 两条用户路径均复现（T18 带 subject / T26 手写草稿无 subject）。纯函数复现：hash(含 undefined 键)=476173b9… vs hash(JSONB 读回)=ff240500…。既有测试（gate-smoke/reach-e2e）全为服务层直调且入参无 undefined 键故全绿漏检。建议修复方向：payloadHashOf/stableStringify 按 JSON 语义丢弃 undefined 值键（对齐 JSONB 往返），或 reach/send 路由构造入参时剔除 undefined 键；修复后补一条「HTTP 创建→confirm」的回归用例",
      "steps_to_reproduce": "1. next build && node .next/standalone/server.js（或 next dev 并先 POST /api/agent 触发注册）2. POST /api/reach/send {projectId,kolId(带 contactEmail),subject,body} → 200 pending 3. POST /api/actions/{id}/confirm → 403 {code:GATE_TOKEN_INVALID, error:payloadHash 不匹配，拒绝确认}"
    },
    {
      "title": "工具注册依赖 /api/agent 模块图副作用：dev 空进程直打 execute 端点 500「[gate] 工具已不存在」、reach/send 400「[tools] 未知工具」，且模块图重估后复发",
      "severity": "high",
      "evidence": "注册副作用仅在 src/lib/agent/tools/index.ts:42（模块加载时 ensureNativeToolsRegistered）；gate.ts 与 execute.ts 只 import 纯 Map registry（tools/registry.ts），四条 /api/actions 路由与 /api/reach/send|quote 的模块图均无任何注册触发点。dev server 实测：空进程 POST /api/reach/send → 400 [tools] 未知工具: send_outreach（T16）；execute → 500 [gate] 工具已不存在: send_outreach（gate.ts:323，dev log）；POST /api/agent 一次后恢复（T17），数分钟后模块图重估又复发（T25）。生产 standalone 因 boot 预载路由（/api/agent 模块 boot 即求值）幸免——S1 空进程 200 实证；但该保障依赖 Next preload 行为而非显式契约，且 GET 端点自述的「跨会话恢复」场景在 dev 不可复现。建议：gate.ts executePendingAction 与 reach 路由显式调用 ensureNativeToolsRegistered()（幂等，一行）",
      "steps_to_reproduce": "1. 冷启 next dev（不触碰 /api/agent）2. POST /api/reach/send 合法 body → 400 [tools] 未知工具: send_outreach；或对已 confirmed 动作 POST /api/actions/{id}/execute → 500"
    },
    {
      "title": "rate-limit fail-open 注释失真 + XFF 首段可伪造（辅助防线弱化，非闸门主防线）",
      "severity": "low",
      "evidence": "rate-limit.ts:84-92 注释称「本地 dev 直连无反代头→null→放行」，实测 Next 15 self-host 自注入 x-forwarded-for（本地直连 35 请求观测 6×429，T7）——null-IP fail-open 分支实际不可达，本地重度使用 /api/actions 可能误触 30/min 限流（有 DISABLE_GATE_RATELIMIT 逃生口）。另 clientIpOf 取 XFF 首段，nginx 默认 append 语义下客户端可伪造首段旋转绕过限流；限流为辅助防线（票据协议为主，http.ts:3-4 自述），影响低。建议下批次顺手：修正注释 + prod 反代场景取右起首个可信段",
      "steps_to_reproduce": "next dev 后本地直连（无自定义头）连续 31 次 GET /api/actions/x → 第 31 次起 429"
    }
  ]
}
```

### F003 — PASS

```json
{
  "feature_id": "F003",
  "result": "PASS",
  "summary": "隔离验收 F003：全审读 src/lib/ops/email/ 四文件与 src/lib/agent/tools/send-outreach.ts；npx vitest run tests/integration/send-outreach.test.ts tests/unit/email-sender-selector.test.ts → 10/10 全绿（verbose 逐例确认，集成测打真库 newkolmatrix-dev-db，夹具租户 test-tenant-m3a-send-* 自清理）；npm run gate:smoke 复跑全部断言通过（G1-G8 + G5.5 OutreachMessage/Thread 落库四断言 + D20 变异翻红，SENT_MARKER 观测点经旧路径 re-export 零迁移，检测器活性由变异测试自证）；grep 证实 CI workflows 无任何 RESEND env、本地 .env 无 RESEND_API_KEY（仅核键名不读值）→ CI 与本地默认 mock 不外呼有结构性保证 + 行为断言（out.mocked===true）；npx tsc --noEmit 干净；Resend SDK 用点全仓唯一（resend-sender.ts）。七项 acceptance 全 PASS。分支 ①「有 key 真发」L1 断言选择器返回 ResendEmailSender 实例；[L2] 真实投递 REAL 模式本地不可执行（RESEND_API_KEY 仅存 VPS，U2 约束）——真发 E2E 属 F010 acceptance（部署后 prod 实测），不计 F003 缺口。三条 low/info 观察不阻断（30s 超时为 race 非真 abort、重放分支 mocked:false 硬编码、sent 必非空为应用层不变量）。未起服务进程，:3000 全程空闲。",
  "acceptance_items": [
    {
      "item": "ops/email 接口 + 两实现",
      "verdict": "PASS",
      "evidence": "src/lib/ops/email/types.ts:56-58 EmailSender 接口 + SendEmailInput/SendEmailResult/SendEmailError；resend-sender.ts:40-102 ResendEmailSender（P4 port：30s 超时 + transient 一次冷重试 + Idempotency-Key + invalid_to 前置校验）；mock-sender.ts:18-36 MockEmailSender（写 SENT_MARKER OperationLog，随 ctx.db 事务提交/回滚）；grep 证实 Resend SDK 导入/emails.send 全仓唯一用点在 resend-sender.ts"
    },
    {
      "item": "env 选择器行为三分支实测（有 key 真发 / 无 key dev mock / 无 key prod 抛错拒发）",
      "verdict": "PASS",
      "evidence": "src/lib/ops/email/index.ts:15-28 三分支 + PLACEHOLDER_KEY 防呆；tests/unit/email-sender-selector.test.ts 5/5 绿（① 有 key→ResendEmailSender 实例、② 无 key+test→MockEmailSender、③ 无 key+production→SendEmailError、③b placeholder+prod 拒发、placeholder+dev 回落 mock）。分支 ① 真实投递链路 [L2] 本地不可执行（密钥仅 VPS，U2），归 F010 prod 实测——选择器行为本身已三分支覆盖"
    },
    {
      "item": "send_outreach.execute：发送→OutreachMessage(direction=sent, gateLogId 非空, providerMessageId) 落库 + thread 状态事件",
      "verdict": "PASS",
      "evidence": "集成测「confirm 签票→execute 消费票→落库」PASS：findFirst({gateLogId: paId, direction:'sent'}) 非空 + sentAt 非空 + thread.status pending_send→sent（经 recomputeThreadStatus→inferCrmStatus 共享服务，src/lib/reach/recompute-status.ts:39-96）+ OperationLog(kind:auto) 推进事件 payloadJson {from:'pending_send',to:'sent'}；gate-smoke G5.5 四断言独立复证；providerMessageId 落库（mock 路径 null 且被断言）"
    },
    {
      "item": "无 contactEmail 明示拒绝不猜（P3）",
      "verdict": "PASS",
      "evidence": "send-outreach.ts:52-53 NO_CONTACT_EMAIL_MSG 定死文案锚点，:70-71 resolveKol 在 buildHarm 阶段即抛（早于 PendingAction 创建）；集成测断言 rejects.toThrowError(NO_CONTACT_EMAIL_MSG) + PendingAction 计数不变 + SENT=0（拒在披露前，零副作用）"
    },
    {
      "item": "重入不双发（幂等断言，P6 幂等键=pendingActionId）",
      "verdict": "PASS",
      "evidence": "send-outreach.ts:103-124 gateLogId 查重先行返回 already=true 不再外呼不再落库；集成测重放断言 SENT 计数不增 + OutreachMessage 行数不增；gate-smoke G8「并发双消费恰一方胜出 + 副作用恰好一次」全绿；真信道另有 Resend 侧 Idempotency-Key（resend-sender.ts:66）双保险"
    },
    {
      "item": "MockEmailSender 保留 SENT_MARKER，gate-smoke/D20 观测点零迁移",
      "verdict": "PASS",
      "evidence": "SENT_MARKER='send_outreach:SENT' 语义不变（mock-sender.ts:16），旧导入路径 send-outreach.ts:21 re-export；gate-smoke.ts:26 仍从旧路径导入未改动；复跑 npm run gate:smoke 全部断言通过——G1 无副作用/G5 SENT+1/G8 恰好一次/D20 变异（直调 execute 绕过门控→副作用发生→断言必然翻红）证明基于 SENT_MARKER 的检测器仍活着"
    },
    {
      "item": "CI 与本地默认 mock 不外呼",
      "verdict": "PASS",
      "evidence": "grep .github/workflows/*.yml 全文无 RESEND（CI 无 key→选择器分支 ②）；本地 .env 键名清单无 RESEND_API_KEY；ci.yml:91 test:unit:coverage 收 tests/integration（vitest.config include），集成测在 CI 同样走 mock 且断言 out.mocked===true / providerMessageId===null；本次 vitest + gate:smoke 运行全程零外呼（mock 分支 + test.invalid 不可达域夹具双保险）"
    }
  ],
  "issues": [
    {
      "title": "ResendEmailSender 30s 超时为 Promise.race，未用 AbortController 真中断底层请求",
      "severity": "low",
      "evidence": "src/lib/ops/email/resend-sender.ts:23-38 withTimeout 仅 race 拒绝，超时后底层 fetch 仍可能在后台完成；因 Idempotency-Key（:66）在场重试不会双发，功能无损，但与文件头注释「30s abort」（P4 port 自旧项目）表述有出入",
      "steps_to_reproduce": "审读 resend-sender.ts withTimeout 实现——无 AbortController/signal 传入 this.client.emails.send"
    },
    {
      "title": "幂等重入分支返回 mocked:false 硬编码，重放时输出语义轻微失真",
      "severity": "low",
      "evidence": "src/lib/agent/tools/send-outreach.ts:121 already=true 分支固定返回 mocked:false——重放时无法得知原发是否 mock；不影响任何 acceptance 断言面（测试只断言 already/计数），仅输出字段语义可再精确",
      "steps_to_reproduce": "mock 环境下经闸门发送一次后，用同 gateActionId 重放 execute 体，返回 already:true 但 mocked:false"
    }
  ]
}
```

### F004 — PASS

```json
{
  "feature_id": "F004",
  "result": "PASS",
  "summary": "隔离验收基于实物：审读 src/lib/signals/{normalize,ingest}.ts + src/app/api/signals/inbound/route.ts + prisma/schema.prisma，运行指定套件 npx vitest run tests/unit/signals-normalize.test.ts tests/integration/signals-inbound.test.ts → 22/22 PASS（490ms）；另写 Evaluator 对抗探针 tests/integration/signals-inbound.evaluator-probe.test.ts（7/7 PASS）覆盖 Generator 套件外输入空间：错 secret 合法格式签名 401、10 分钟前时间戳重放 401（svix 容差生效）、缺签名头 401、401 路径零落库、限流 per-IP 隔离（A 打满 429 后 B 仍 200）、externalId 5 路并发重放恰落 1 行、opened/complained 落库映射补全。旧项目样例回放经 gh api 直读 tripplemay/kolmatrix webhooks/resend/__tests__/route.test.ts 逐条核对——7 样例 payload 字面一致，适配点（EmailLog→Signal、hard bounce 不清 contactEmail）符合 spec P4 且有负例固化。tsc --noEmit exit=0；夹具清态复原已验证（dev DB 零残留）。[L2] prod 真 webhook 实链路本地不可执行（secret 仅存 VPS），spec §7 认可本地签名样例回放，归 F010 部署面。六条 acceptance 全 PASS。新增测试产物 tests/integration/signals-inbound.evaluator-probe.test.ts 待编排者随批 commit。",
  "acceptance_items": [
    {
      "item": "验签失败 401/403 拒绝（fail-closed）+ 20/min/IP 限流 429",
      "verdict": "PASS",
      "evidence": "route.ts:66-94（secret 未配 500 拒收/缺 svix 头 401/verify 失败 401）+ :30-48（取不到 IP 403 fail-closed、超限 429+Retry-After，SIGNALS_LIMIT=20/60s，且限流先于验签防 DoS）。Generator 集成测 4 例（401 伪签/500 无 secret/403 无 IP/第 21 次 429）+ 探针 4 例（错 secret 合法格式签名 401、10min 前时间戳重放 401、缺签名头 401、per-IP 隔离 A 满 B 通）全绿"
    },
    {
      "item": "zod 校验坏 payload 400 不落库",
      "verdict": "PASS",
      "evidence": "route.ts:97-103 safeParse 失败 400；集成测「验签通过但坏 payload（缺 type）→400 不落库」断言 Signal count 不变 PASS；normalize 单测 zod 拒绝面（缺 type/data 非对象/非对象根）3 例 PASS；探针补 401 拒绝路径零落库"
    },
    {
      "item": "externalId 防重（同事件重放只落一行）",
      "verdict": "PASS",
      "evidence": "schema.prisma:460 externalId @unique；ingest.ts:60-77 P2002 捕获→duplicate=true 不报错。串行重放测试（duplicate=true、count 不变）PASS + 探针 5 路并发同 svix-id → 恰 1 行落库、4 路 duplicate=true、无抛错 PASS"
    },
    {
      "item": "四类事件正确映射 Signal 并触发重算+留痕",
      "verdict": "PASS",
      "evidence": "normalize.ts:32-37 四类映射表（delivered/bounced/complained/opened，clicked 等诚实忽略）；单测 it.each 四类映射 + 集成层 delivered/bounced(hard+soft) 落库 + 探针补 opened/complained 落库端到端；ingest.ts:85 调 recomputeThreadStatus（三处复用共享服务）+ :91-105 OperationLog(kind:auto)「信号接入」留痕断言 PASS；P2 负例（投递状态不推进 CRM 态，thread 仍 sent）PASS；lastSignalAt 写入断言 PASS"
    },
    {
      "item": "单测/集成测覆盖验签+防重+映射",
      "verdict": "PASS",
      "evidence": "npx vitest run tests/unit/signals-normalize.test.ts tests/integration/signals-inbound.test.ts → 2 files / 22 tests 全 PASS（单测 10 例：映射/忽略/zod；集成 12 例：HTTP 层验签+限流+400 与应用层落库+防重+留痕）；探针 7/7 补充；tsc --noEmit exit=0"
    },
    {
      "item": "旧项目 handler 测试样例回放通过",
      "verdict": "PASS",
      "evidence": "gh api 直读旧 repo tripplemay/kolmatrix src/app/api/webhooks/resend/__tests__/route.test.ts 逐条比对：7 样例（401 伪签/500 无 secret/delivered 映射/hard bounce permanent+DMARC policy reject/soft bounce transient+mailbox temporarily full/unknown future_event→matched=0/unmatched providerMessageId→matched=0）在新集成测中 payload 字面一致回放并全部通过；适配点（EmailLog→OutreachMessage/Signal、hard bounce 不清 contactEmail）符合 spec P4「EmailLog/withTenant 不 port」且以负例断言固化（contactEmail 保持不动 2 例 PASS）"
    }
  ],
  "issues": [
    {
      "title": "ingest 落库四步（Signal.create→thread.lastSignalAt→重算→留痕）非同一事务：中途失败后 Resend 重投走防重路径直接返 200，该事件的 lastSignalAt/重算/OperationLog 留痕可能永久缺失",
      "severity": "low",
      "evidence": "ingest.ts:47-105——signal.create 成功后若 thread.update/recompute/operationLog 任一失败，route.ts:115-123 返 500 触发 Resend 重投；重投命中 P2002 防重（ingest.ts:60-77）返 duplicate=true 且不补做后三步。影响有界：Signal 行已在库，下一次任何重算会把它计入推断（CRM 态最终收敛），仅该事件的 auto 留痕与 lastSignalAt 可能缺失。acceptance 未要求事务原子性，不阻断 PASS；建议后续批次将四步包入 prisma.$transaction 或在 duplicate 路径补幂等重算",
      "steps_to_reproduce": "理论路径（需注入故障）：1. 构造 signal.create 成功但 recomputeThreadStatus 抛错（如瞬时 DB 断连）2. route 返 500，Resend 重投 3. 重投命中 externalId P2002 → 返 200 duplicate=true，观察该事件无「信号接入」OperationLog 且 lastSignalAt 未更新"
    }
  ]
}
```

### F005 — PASS

```json
{
  "feature_id": "F005",
  "result": "PASS",
  "summary": "跑 npx vitest run tests/unit/crm-infer.test.ts → 57/57 全绿（152ms）。审读 src/lib/domain/crm-infer.ts 确认零 import（grep -c \"^import\" = 0）、无 DB/IO、ctx 结构化传入；测试含深冻结入参与同输入返回全新对象的纯函数性断言。全转换矩阵 5 事件态 × 6 覆盖档穷举 + 「无 committed quote 时任何 override 组合到不了 confirmed」性质断言在场。越权 confirmed 负例逐事件态断言忽略且 ignoredOverrides 携带 CONFIRMED_NOT_OVERRIDABLE 完整留痕对象，F009 入口（manual-override.ts:99-115）实际消费留痕写 OperationLog。D20 变异除套内 5 个模拟变异体 A-E toThrow 全绿外，本 Evaluator 另在隔离 git worktree 做 3 个真实源码变异独立验证检测器活性：M1 掐断 confirmed 唯一路径→9 例翻红、M2 破坏 max 合成允许降级→11 例翻红、M3 越权 confirmed 照单全收→9 例翻红（worktree 已清理，主仓 git status 干净，未改任何产品代码）。三处复用实况经 grep 追溯：①页面 surface-data.ts:146 直调 inferCrmStatus，②工具 send-outreach.ts:197/commit-quote.ts:178，③例程 signals/ingest.ts:85/manual-override.ts:92（后四者经 recompute-status.ts:62 同一函数）；全仓无旁路直改 thread CRM status（ingest.ts:79 与 manual-override.ts:86 仅写 lastSignalAt，创建基线 pending_send 与空事实推断一致）。F005 为纯 domain 函数，不涉 L2（真投递 REAL 模式环境约束与本 feature 无关）。",
  "acceptance_items": [
    {
      "item": "纯函数无 DB 读（ctx 传入）",
      "verdict": "PASS",
      "evidence": "src/lib/domain/crm-infer.ts 零 import 语句（grep -c \"^import\" = 0，唯一 'import' 字样在 :5 注释内）；入参 CrmInferContext{messages,signals,quotes} 由调用方查好传入（:106-111）；tests/unit/crm-infer.test.ts:337-364 深冻结入参不抛错 + 同输入两次调用返回深等的全新对象，vitest 实跑通过"
    },
    {
      "item": "全转换矩阵单测",
      "verdict": "PASS",
      "evidence": "tests/unit/crm-infer.test.ts:174-248 穷举 5 事件态 × 6 覆盖档（none + sent/replied/negotiating/confirmed/pending_send）= 30 例 + 性质断言（无 committed quote 时含 'CONFIRMED'/'banana'/'' 的任何 override 都到不了 confirmed）；:84-170 五态事件地板 + email_delivery_status 四事件不推进 + 数组顺序无关；npx vitest run → 57/57 passed"
    },
    {
      "item": "manual_override 越权断言 confirmed 被忽略且留痕说明（负例测试）",
      "verdict": "PASS",
      "evidence": "实现 crm-infer.ts:188-191（CONFIRMED_NOT_OVERRIDABLE 专属 reason）+ :219-226（入 ignoredOverrides 不参与竞争）；负例测试 :202-218 逐事件态断言 status 不变 + 留痕对象完整（signalId/asserted/reason/detectedAt）；:275-289 断言最新越权条不掩盖更早合法断言；:324-331 三种忽略理由可区分；调用方 manual-override.ts:99-115 实际写 OperationLog 留痕"
    },
    {
      "item": "D20 变异测试（破坏推断规则→测试翻红）",
      "verdict": "PASS",
      "evidence": "套内：共享行为断言组 crmBehaviourSuite + 5 个模拟变异体 A-E（越权生效/唯一路径掐断/静默丢留痕/允许降级/基线退化）toThrow 断言全绿（test :423-491）。Evaluator 独立活性验证（隔离 worktree 真实源码变异，不触主仓）：M1 committed→confirmed 路径掐断 = 9 failed/57；M2 max 合成破坏（无条件覆盖）= 11 failed/57；M3 越权 confirmed 照单全收 = 9 failed/57——检测器确认存活"
    },
    {
      "item": "三处复用铁律注释就位（页面/工具/例程同一函数）",
      "verdict": "PASS",
      "evidence": "注释：crm-infer.ts:8-13（①②③全列）、surface-data.ts:5（铁律①）、recompute-status.ts:3-5、manual-override.ts:3-4（铁律③）。复用实况 grep 追溯：①V6 页面 pill surface-data.ts:146 直调 inferCrmStatus；②工具层 send-outreach.ts:197 + commit-quote.ts:178 经 recomputeThreadStatus；③signals 例程 ingest.ts:85 + F009 manual-override.ts:92 经同一服务（recompute-status.ts:62 调 inferCrmStatus）。无旁路：thread CRM status 唯一物化写点 = recompute-status.ts:75-78；ingest.ts:79/manual-override.ts:86 仅写 lastSignalAt；工具层创建基线 pending_send 与空事实推断一致"
    }
  ],
  "issues": []
}
```

### F006 — PASS

```json
{
  "feature_id": "F006",
  "result": "PASS",
  "summary": "实测 npx vitest run tests/unit/reach-tools.test.ts tests/integration/reach-tools.test.ts → 2 文件 15 用例全绿（unit 10 + integration 5）。代码审读证实：三工具在 src/lib/agent/tools/index.ts:26-28 唯一注册、src/lib/agent/registry.ts:125-131 reach 人格 tools 数组全挂载，单测含同源断言（人格工具名反查注册表）；draft_email/refine_email class=internal 无 buildHarm，commit_quote class=outbound 有 buildHarm。集成测（真库+夹具租户 pid 隔离）验证：无令牌 executeTool→pending 信封且 Quote 零行（副作用未发生）；confirm 签票→execute 消费票后 Quote committed + gateLogId=pendingActionId + thread→confirmed（U4 唯一路径）+ plan metrics.budgetUsd=1500 回填且其余指标不动；harm 三要素（amount/currency、evidence 全列交付物、targets 从 DB 读真名）逐项断言。另执行已授权 L2 真网关最小用量探针（1 次 chat，deepseek-v3，502 tokens ≈ $0.000157）：ru 语言 KOL 起草返回西里尔文 subject/body、language='ru'、draft 落库，夹具清态复原——NFR-I2 在真实模型层成立。commit-quote.ts:158-172 proposed→committed 两态在同一执行事务内走过。真实投递 REAL 模式与 F006 无关（其 acceptance 不含发信），未计入判定。",
  "acceptance_items": [
    {
      "item": "三工具注册且挂 reach 人格（registry tools 数组 + 单测同源断言）",
      "verdict": "PASS",
      "evidence": "src/lib/agent/tools/index.ts:26-28 NATIVE_TOOLS 注册 draft_email/refine_email/commit_quote；src/lib/agent/registry.ts:125-131 reach 人格 tools=[get_kol_detail,send_outreach,draft_email,refine_email,commit_quote]；tests/unit/reach-tools.test.ts:19-41 注册+挂载+同源断言（reach 声明的每个工具名 expect(native.has(name))=true），vitest 实测 ✓"
    },
    {
      "item": "draft_email 输出含 subject/body 且语言随 KOL.language",
      "verdict": "PASS",
      "evidence": "L1: tests/integration/reach-tools.test.ts:101-149 ru KOL→subject/body/language='ru' + prompt 含「ru」指令 + XML 包裹/注入 escape；未录语言→回落 'en'（email-drafting.ts:135 NFR-I2 兜底）全 ✓。L2（已授权最小用量）: 真网关探针 1 次 chat（deepseek-v3 502 tokens ≈$0.000157）→ subject «Сотрудничество по игре Starfall Tactics» + 624 字西里尔正文 + language='ru' + OutreachMessage(direction=draft) 落库，夹具清态复原"
    },
    {
      "item": "commit_quote 无令牌→pending 信封 403 语义、经两步票据后 Quote proposed→committed + gateLogId 非空 + budgetUsd 回填断言",
      "verdict": "PASS",
      "evidence": "tests/integration/reach-tools.test.ts:182-206 无令牌 executeTool→isPendingEnvelope=true 且 quote.count=0（副作用零发生）；:208-234 confirmPendingAction→executePendingAction 后 Quote status=committed、gateLogId===pendingActionId、thread→confirmed（U4）、plan metrics.budgetUsd=1500 回填 + people 不动 + 返回 planBudgetUsd=1500，实测全 ✓；代码面 commit-quote.ts:158-172 proposed→committed 同一执行事务（ctx.db=tx）两态走过，execute.ts:36 outbound 无令牌强制拦截"
    },
    {
      "item": "buildHarm 三要素在场（gate-smoke 或单测断言）",
      "verdict": "PASS",
      "evidence": "commit-quote.ts:45-67 buildHarm：金额 amount+currency / 交付物 evidence 全列 deliverables / 对象 targets 从 DB 读真名（不信任模型转述）+ irreversible + HARM_LABEL；集成测 :199-203 断言 harm.amount=1500、currency='USD'、evidence 含两条交付物、targets 含 'Руслан Стример'；单测 :52-56 断言 class='outbound' + buildHarm 已声明。acceptance 为「gate-smoke 或单测」二选一——单测/集成测分支满足（gate-smoke 无 commit_quote 用例，非缺陷）"
    }
  ],
  "issues": []
}
```

### F007 — PASS

```json
{
  "acceptance_items": [
    {
      "item": "抽屉可录入/清除 contactEmail",
      "verdict": "PASS",
      "evidence": "CreatorDrawer.tsx:279-413 ContactEmailField（编辑态 input+保存/取消；展示态 修改/清除按钮，清除=submit(null)；M2-B VerdictButtons 同款 ghost sm+toast 交互），:768-773 挂载于商务与档期段（key=creator.id 切换重置）；数据流闭合：page-data.ts:140 select contactEmail → creator-format.ts:210 map → drawer props。底层录入/清除服务经集成测试实证：录入落库（row.contactEmail=TEST_EMAIL）与清除置空（contactEmail=null）均 PASS（kol-contact-email.test.ts，打真库 docker dev DB）"
    },
    {
      "item": "PATCH API zod email 校验（坏格式 400 明示）",
      "verdict": "PASS",
      "evidence": "route.ts:19-43 zod bodySchema + normalizeContactEmailInput（contact-email.ts:25 z.email()）；坏格式返回 400 + CONTACT_EMAIL_INVALID_MSG 明示文案（路由与测试共用常量锚点）；先校验 body 后解析租户（400 路径不依赖 seed）。实测：「坏格式地址 → 400 + 明示文案」「body 形状非法（缺键/非字符串/非 JSON）→ 400 明示」两例 PASS"
    },
    {
      "item": "fieldProvenance 标 user_input",
      "verdict": "PASS",
      "evidence": "contact-email.ts:72-97 immutable 合并写：条目对象形状 {source:'user_input', fetchedAt}（非 flat 字符串），只增/删 contactEmail 一键、既有键原样保留；清除移除键+无剩余键回落 Prisma.DbNull。集成测试杀三类变异（整体覆盖丢键/flat 字符串击穿整表/孤儿溯源键）全过：entry.source='user_input'、audienceDemo 既有键逐字保留、清除后键移除且空壳回落 SQL NULL"
    },
    {
      "item": "ProvenanceTag 正确显示",
      "verdict": "PASS",
      "evidence": "provenance.ts:26 source 枚举扩 'user_input' 档；ProvenanceTag.tsx:32 SOURCE_META user_input={label:'人工录入', Icon:MdEditNote}；CreatorDrawer.tsx:346 有溯源才渲染徽标（§7.5.2 读写不对称），:772 initialProv=provOf('contactEmail')。tests/unit/provenance.test.ts 19 例全绿（E1 断言七档图标+文字齐备）；集成测试断言 resolveProvenance 出 field 级 user_input 且 audienceDemo 键不被击穿（resolvedFrom 均 'field'）"
    },
    {
      "item": "录入后 send_outreach 可用该地址（与 F003 联动断言）",
      "verdict": "PASS",
      "evidence": "send-outreach.ts:64-72 resolveKol 读侧 findFirst({id,tenantId}, select contactEmail) 与 kol-contact-email.test.ts「F003 联动」测试查询形状逐字一致，录入后取到非空地址实测 PASS；补跑 tests/integration/send-outreach.test.ts 5/5 PASS 旁证（夹具即以 contactEmail+user_input 溯源建行；无 contactEmail → NO_CONTACT_EMAIL_MSG 明示拒绝且零 PendingAction；确认后地址变更 → execute 拒发）。无需真发信即闭合，未消耗 L2 用量"
    },
    {
      "item": "涉及布局变更则视觉基线对账（§4.5）",
      "verdict": "PASS",
      "evidence": "条件项核验：读 tests/screenshots/baseline/creator-drawer-darwin.png 实图——视口截图（SNAPSHOT_OPTS.fullPage:false，handoffs-mock.ts:76）可视区止于「合作历史」段，F007 新增行位于折叠线下方「商务与档期」段，不改变基线画面；darwin 基线未动与此一致（最后触碰 bf8e507 M2-B），linux 基线已在含 F007 的 b584d19（update-visual-baselines workflow）重生回拉。无陈旧基线。注：test:visual 全量运行归 F010 验收单元（本单元按资源隔离约束未跑），此处证据为基线实图检视+git 历史"
    }
  ],
  "feature_id": "F007",
  "result": "PASS",
  "summary": "隔离验收 F007（Kol.contactEmail 抽屉录入口 + PATCH API）：npx vitest run tests/integration/kol-contact-email.test.ts tests/unit/provenance.test.ts → 2 文件 29 例全绿（打真库 docker dev DB，夹具租户 pid 隔离、测毕清态）；补跑 tests/integration/send-outreach.test.ts → 5/5 绿（F003 联动实物旁证）。代码审读确认：route.ts zod 校验+400 明示（先校验后租户，CI 无 seed 可测）、contact-email.ts fieldProvenance 条目对象形状 immutable 合并写（清除移除键+空壳回落 DbNull）、provenance.ts/ProvenanceTag.tsx user_input 档全链路（枚举+SOURCE_META+徽标条件渲染）、CreatorDrawer ContactEmailField 挂载与数据流闭合（page-data select → creator-format map → props）、send-outreach resolveKol 读侧同列同查询形状。视觉基线条件项：基线实图检视证明新增行在视口截图折叠线下方（fullPage:false），基线画面不变，linux 基线已随批重生（b584d19）。六条 acceptance 全 PASS；F007 无需真投递，未消耗 L2 用量。未修改产品代码、未写状态文件、未占用其他验收单元独占资源。"
}
```

### F008 — FAIL

```json
{
  "feature_id": "F008",
  "result": "FAIL",
  "summary": "隔离验收基于实物三层取证：①代码层——grep confirmSend/confirmQuote src/ 零命中（活性证明：旧版 6a27c65 复现 5 命中）、env-reach.ts 已删且 mock/index.ts:14 登记退役、surface-data.ts:146 五态经 inferCrmStatus 纯函数现算不读物化列；②视觉层——npm run build 后伪造网关 env 跑 env=reach 基线三连 3/3 绿 + workbench 全套 10 基线零漂移（darwin 基线 F008 commit 重生、linux 基线 b584d19）；③运行时层——standalone(:3000) + 探针夹具（合成 KOL/项目，P1 零真实 KOL），1512/900/640 三视口浏览器实测 26/26 元素断言通过，quote 链 UI 级全通（pending→GET 详情→confirm 签票→execute→Quote committed+planBudgetUsd 回填→pill 已确认+按钮消失），票据重放 409。但 send 链在 UI 可达的全部路径于 confirm 步 403 GATE_TOKEN_INVALID「payloadHash 不匹配」（两条路径均实证：draft 带 subject 的 Agent 起草主流程 / 无 draft 行手写路径），根因经密码学复算锁定：/api/reach/send 构造 input 显式携带 language:undefined 键，gate.ts stableStringify 将 undefined 序列化为字面量参与建卡 hash，Prisma JSONB 落库丢键，confirm 复算恒不匹配——重算三变体 hash 与库内 payloadHash 比对证实（lang-undef=stored，no-language=confirm 复算值）。核心验收目标「发送经真闸门链路」功能性不可用，整条 feature 取最严格项 FAIL。验收后夹具清态复原（residue 0）、端口释放、未改产品代码。L2 用量：gateway chat 0 次、真实投递 0 封（本地 standalone 为 production 模式无 RESEND_API_KEY，P4 fail-fast 拒发属 F003 设计语义，REAL 投递归 F010 部署后 prod 实测，不影响本判定）。",
  "acceptance_items": [
    {
      "item": "ui-inventory V6 24 元素逐处保持（三栏/五态 pill/draft textarea/重写 ghost/发送红 gate/ring84/宣示句）+ 24→26 新增登记",
      "verdict": "PASS",
      "evidence": "docs/specs/ARCH-M05-ui-inventory.md:72-75 与 src/components/envs/reach/ConversationInbox.tsx 逐元素对账 + 原型 interaction-prototype-v2.html L784-796 交叉核验；浏览器活体断言 26/26 通过（1512px）；宣示句逐字（:609-613）；「重写」variant=secondary 为项目对原型 .btn.ghost（lightPrimary 底）的既定映射（GateConfirm.tsx:96 注释 + pre-F008 基线 6a27c65 同款，非回归）；V6-25 报价表单 modal（:616-693）与 V6-26 覆盖控件（:578-604，「已确认」按钮活体断言不可达）均在 inventory :74 登记"
    },
    {
      "item": "「确认报价」仅 negotiating 条件渲染保持（裁决 #6）",
      "verdict": "PASS",
      "evidence": "ConversationInbox.tsx:451 `selected.stage === '谈判中' &&`；活体三态验证：B（谈判中）选中态可见 → 切 A（待发送）count=0 → B 报价 committed 后（已确认）count=0"
    },
    {
      "item": "五态 pill = crmInfer 真值",
      "verdict": "PASS",
      "evidence": "src/lib/reach/surface-data.ts:146 每人经 inferCrmStatus（lib/domain/crm-infer 纯函数）现算，不读 OutreachThread.status 物化列；reach-format.ts 仅做枚举→中文+tone 机械映射（原型逐字）；活体验证：空事实虚拟行→待发送、proposed Quote→谈判中、quote.committed→已确认，全部随真库状态经 RSC 重组装更新"
    },
    {
      "item": "发送经真闸门链路（无 stub 残留：grep confirmSend 零命中）",
      "verdict": "FAIL",
      "evidence": "stub 残留=0（grep src/ 零命中，活性证明：git show 6a27c65 复现 5 命中）、链路架构在场（POST /api/reach/send→pending 信封→GET /api/actions/[id] 真 harm→confirm→execute，ConversationInbox:171-292）、quote 链同构全通；但 send 链 UI 可达的全部路径在 confirm 步 403 GATE_TOKEN_INVALID「payloadHash 不匹配，拒绝确认」——实测两条路径均复现（①draft 带 subject 的主流程：浏览器点「确认发送」403；②无 draft 行：curl POST send→confirm 403）。根因：src/app/api/reach/send/route.ts:36-61 构造 executeTool 入参显式携带 language:undefined 键 → src/lib/agent/gate/gate.ts:63-75 stableStringify 将 undefined 序列化为字面量 `undefined` 参与建卡 payloadHash → Prisma JSONB 写入丢弃 undefined 键 → confirm（gate.ts:234）按库内 inputJson 复算恒不匹配。密码学复算证实：hash(input 含 language:undefined)=e9283147…=库内 payloadHash；hash(库内 inputJson)=f2f97265…≠。PendingAction 卡死 pending，用户面 toast 裸报「payloadHash 不匹配」死路"
    },
    {
      "item": "空态语义保留",
      "verdict": "PASS",
      "evidence": "三处空态在场且语义正确：左栏人列空态（视觉基线硬断言锚文本）、中栏「还没有往来 —— Agent 已为你起草首封邀约，见下方。」（有草稿变体，活体断言通过）+ 无草稿变体（ConversationInbox:489-493，inventory :73 登记 D2 诚实变体）、未选中态「选择左列创作者后开始触达」"
    },
    {
      "item": "env-reach.ts 退役登记（mock/index.ts 表更新）",
      "verdict": "PASS",
      "evidence": "src/lib/data/mock/ 目录已无 env-reach.ts（F008 commit 删除 204 行）；mock/index.ts:14 表行更新「~~env-reach.ts~~ | F010 | 已退役（M3-A F008：reach 面 RSC 组装真数据，视图契约迁 lib/display/reach-format.ts）」；全仓引用仅余注释性退役说明 4 处"
    },
    {
      "item": "视觉基线逐处对账重生（§4.5 重生序+三连稳）",
      "verdict": "PASS",
      "evidence": "project-reach-darwin.png 在 F008 commit be8e8d6 重生（364358→274131 bytes），linux 基线经 update-visual-baselines workflow 回灌（b584d19）；本次验收：kill :3000 前置确认 → build → AIGCGATEWAY_* 伪造 → env=reach 三连跑 3/3 PASS（2.2s/1.9s/1.9s）→ workbench 全套 10 基线单跑零漂移；每次跑后 lsof -ti :3000 为空"
    },
    {
      "item": "两视口实测",
      "verdict": "PASS",
      "evidence": "standalone(production artifact) + 探针夹具活体实测：1512px 三栏全在（右栏 ctx 可见，ring 76% 对应夹具 matchScore 0.76）；900px 右栏 ctx 隐藏（hidden xl:flex）+ 双栏保持 + draft 区在场；640px 单列截图留档。截图：scratchpad/f008-1512-b-negotiating.png / f008-900-collapsed.png / f008-640-single.png"
    }
  ],
  "issues": [
    {
      "title": "V6「发送」真闸门链在 UI 可达的全部路径于 confirm 步 403（payloadHash 不匹配）——主流程功能性不可用",
      "severity": "critical",
      "evidence": "网络层实证：POST /api/reach/send → 200 pending 信封；GET /api/actions/[id] → 200；POST /api/actions/[id]/confirm → 403 {\"code\":\"GATE_TOKEN_INVALID\",\"error\":\"payloadHash 不匹配，拒绝确认\"}。根因（密码学复算锁定）：src/app/api/reach/send/route.ts 在 subject 由客户端提供（Agent 起草主流程，draft_email 恒写 subject——email-drafting.ts:182）或无 draft 行时，language 变量为 undefined 仍作为键传入 executeTool；gate.ts stableStringify（:63-75）对 undefined 值输出字面量 `undefined`（JSON.stringify(undefined) 非法值直接内插），建卡 payloadHash 含该键；Prisma JSONB 写入丢弃 undefined 键（库内 inputJson 实查无 language）；confirm（gate.ts:234）按库内 inputJson 复算 → 恒不匹配。三变体哈希比对：hash(含 language:undefined)=e92831…=库内 payloadHash；hash(无 language)=f2f972…=confirm 复算值。quote 链不受影响（zod parsed.data 无 undefined 键，UI 级全通）；Copilot 对话路径不受影响（LLM JSON 无 undefined）；gate:smoke/reach:e2e 未盖住此形状（测试恒显式传 language）。后果：PendingAction 卡死 pending，用户 toast 裸报内部错误。修复建议（Generator 定夺）：①根治——stableStringify 跳过 undefined 值键（与 JSON 序列化语义对齐，防所有未来调用方）；②卫生——/api/reach/send 构造入参不写 undefined 键；③补一条 route 层 send→confirm 集成测试盖住 UI 真实入参形状（subject 在场 + language 缺席）",
      "steps_to_reproduce": "1. npm run build && node --env-file=.env scripts/serve-standalone.mjs（或任意运行实例）2. 造夹具：项目 + KOL（含 contactEmail）+ OutreachMessage(direction=draft, subject 非空) 3. 路径A（浏览器）：/admin/campaigns/{id}?env=reach → 选人 → 点「发送」→ 确认卡弹出（harm 正常）→ 点「确认发送」→ toast「payloadHash 不匹配，拒绝确认」；路径B（curl）：POST /api/reach/send {projectId,kolId,subject,body} → 取 pendingActionId → POST /api/actions/{id}/confirm → 403 GATE_TOKEN_INVALID。对无 draft 行的 KOL 不传 subject 同样复现（服务端派生分支 language 仍 undefined）。DB 佐证：SELECT payloadHash, inputJson FROM \"PendingAction\"——inputJson 无 language 键但 payloadHash 按含键对象计算"
    }
  ]
}
```

### F009 — PASS

```json
{
  "feature_id": "F009",
  "result": "PASS",
  "summary": "实测两套集成测试全绿：Generator 交付的 tests/integration/reach-override.test.ts（npx vitest run → 5/5 passed，415ms）+ Evaluator 独立对抗探针 tests/integration/reach-override.evaluator-probe.test.ts（4/4 passed：HTTP route 层 confirmed→400 且错误文案含「已确认」「报价闸门」、中文「已确认」/pending_send/空串/缺字段/坏 JSON 全 400、绕过写入口注入 pending_send 降级信号被 STATUS_NOT_OVERRIDABLE 忽略且列值不动）。代码审读证实：UI 控件仅三态映射（ConversationInbox.tsx:584，全文件 grep confirmed=0 命中）、API zod enum 白名单在 DB 访问前拒绝（route.ts:18-26）、覆盖落 Signal(manual_override) 后经 recomputeThreadStatus 走 crmInfer 合成（全仓唯一 status 列写点 recompute-status.ts:75，manual-override.ts:86 只写 lastSignalAt）、OperationLog 留痕含 actor 与 from/to/asserted/effective（manual-override.ts:99-115）。ui-inventory 登记在场（ARCH-M05-ui-inventory.md:74 V6-26）；acceptance「24→25」与实物「24→26」计数差经 F008 审计裁决 #1（F008-v6-wiring-audit.md:56）追溯为 F008 合法追加登记，终态判据成立。视觉基线结构性对账：基线为空态（workbench.spec.ts:54-66），控件仅 selected 非空渲染故零漂移合法，F009 commit f4d7bb9 未触基线 PNG。tsc --noEmit exit 0；夹具租户按 pid 隔离、验收后 DB 零残留（psql 查 test-tenant-m3a-% 空）。F009 无 L2 项（真投递属 F010 范围）。",
  "acceptance_items": [
    {
      "item": "覆盖控件仅三态可选（「已确认」选项不存在——验收断言其不可达）",
      "verdict": "PASS",
      "evidence": "三层不可达实证：① UI 层 ConversationInbox.tsx:584-598 按钮仅从 ['sent','replied','negotiating'] as const 映射，OVERRIDE_LABEL(:126-130) 仅三键，全文件 grep 'confirmed' = 0 命中，:601 提示句「已确认」只能经报价确认产生；② API 层 route.ts:18-26 zod enum(OVERRIDABLE_STATUSES) 白名单，evaluator 探针直调 route handler 实测 status=confirmed→400 且错误文案含「已确认」「报价闸门」，中文「已确认」/pending_send/空串/缺字段/非 JSON body 全 400（4/4 passed）；③ 纵深层 crm-infer.ts:188-191 绕过写入口注入 confirmed 信号→CONFIRMED_NOT_OVERRIDABLE 忽略（reach-override.test.ts 第 5 例实测通过，状态维持 replied）"
    },
    {
      "item": "覆盖落 Signal(manual_override) 走 crmInfer 管道非直改列",
      "verdict": "PASS",
      "evidence": "manual-override.ts:72-85 创建 Signal(type=manual_override, source=user, payloadJson {status})，:92 调 recomputeThreadStatus 走 inferCrmStatus 合成；全仓 grep outreachThread.update 仅三处：recompute-status.ts:75（唯一 status 列写点）、manual-override.ts:86 与 signals/ingest.ts:79（均仅写 lastSignalAt）。实测：signal 行在场 + thread.status=合成值 + 重算幂等 changed=false（5/5 passed）；探针加测降级注入 pending_send 被忽略、列值物理不动（max 合成语义 + 事件面地板不回退 effective=false 均实测通过）"
    },
    {
      "item": "OperationLog 留痕含操作者与前后态",
      "verdict": "PASS",
      "evidence": "manual-override.ts:99-115 operationLog.create(kind:auto, actor=opts.actor, summary 含断言与 from→to, payloadJson {threadId,signalId,asserted,from,to,effective})；route.ts:30 UI 入口 actor='operator'。实测断言 log.actor='operator' + payloadJson matchObject {asserted:'replied',from:'pending_send',to:'replied',effective:true} 通过；状态实际推进另有 recompute-status.ts:79-92 推进事件（人动作与状态事件分立留痕）"
    },
    {
      "item": "ui-inventory V6 24→25 登记",
      "verdict": "PASS",
      "evidence": "F009 控件登记在场：ARCH-M05-ui-inventory.md:72-74「M3-A 新增例外登记（24→26）：V6-25 报价条款表单 modal（F008）· V6-26 CRM 人工覆盖控件（F009，U4 有限覆盖仅三态，「已确认」不可达）」。计数 25 vs 26 之差按「计数不符先逐站点追溯」规则追溯：F008 审计裁决 #1（M3-A-REACH-CRM-F008-v6-wiring-audit.md:56，5 决议全 A）合法追加了报价条款表单登记，终态判据（F009 控件已登记为新增例外）成立。附注：审计文档与 ui-inventory 的 #25/#26 编号互换（内容一致），低严重度文档瑕疵记 issues"
    },
    {
      "item": "视觉基线对账（意图性变更）",
      "verdict": "PASS",
      "evidence": "结构性对账闭环：project-reach 基线态 = 空态（workbench.spec.ts:54-66 硬等待「还没有触达对象」，people.length===0→selected=null），F009 控件在 ConversationInbox.tsx:580 仅 {selected && …} 渲染——基线帧内控件必然缺席，零漂移是唯一合法对账结果；git show f4d7bb9 --stat 证实 F009 commit 未触任何基线 PNG，reach 基线最后重生于 F008（be8e8d6/b584d19），时序正确；git status 基线目录清洁无未对账漂移。test:visual 属其他验收单元独占资源未运行（编排约束），结构性证据无歧义故不降级"
    }
  ],
  "issues": [
    {
      "title": "F008 审计文档与 ui-inventory 的 V6-25/V6-26 编号互换（内容一致的文档内部不一致）",
      "severity": "low",
      "evidence": "M3-A-REACH-CRM-F008-v6-wiring-audit.md:56 写「#25 覆盖控件(F009)、#26 报价条款表单 modal(F008)」，而 ARCH-M05-ui-inventory.md:74 实登记为「V6-25 报价条款表单 modal（F008）· V6-26 CRM 人工覆盖控件（F009）」。两元素均已登记、语义完整，仅编号在两文档间互换；ui-inventory 为登记权威，建议下批顺手把审计文档编号对齐，不阻断签收",
      "steps_to_reproduce": "对比 docs/specs/M3-A-REACH-CRM-F008-v6-wiring-audit.md:56 与 docs/specs/ARCH-M05-ui-inventory.md:74 的 #25/#26 归属"
    },
    {
      "title": "Evaluator 新增探针文件为未追踪测试产物，需随验收一并 commit",
      "severity": "low",
      "evidence": "git status --short 显示 ?? tests/integration/reach-override.evaluator-probe.test.ts（本单元产物，4/4 passed，tsc exit 0，夹具按 pid 隔离 CI 安全）。按 harness-rules 推送前遗漏检查规则，编排者汇总时须将其加入 commit，不得留未推送测试产物",
      "steps_to_reproduce": "git status --short tests/"
    }
  ]
}
```

### F010 — PARTIAL

```json
{
  "feature_id": "F010",
  "result": "PARTIAL",
  "summary": "隔离验收实跑：reach:e2e mock 投递全绿（15 断言：无令牌 pending + 副作用零发生 + confirm 签票→execute 消费票 + OutreachMessage(sent,gateLogId)/thread 推进/irrev/推进留痕齐 + P1 三重断言；真网关起草 1 次 chat，deepseek-v3 ~$0.000124，L2 最小用量已申报；跑后 dev DB 零残留）；lint 0/0、tsc exit 0、vitest 515/515（含 signals-inbound 12/12 承接 Signal 路径）、test:visual 13/13（伪造网关 env + standalone，:3000 前后清空）；部署面只读 ssh 实证 VPS .env 三键在场 + compose md5 本地=VPS（b04ba683…）+ deploy.md M3-A 前置步 ×3 + .env.example 齐。真投递 REAL 模式本地不可执行（U2 密钥不离 VPS，prod 现跑 M2-C，/api/signals/inbound 探针 404=预期部署前态），验证路径三处明文兜底=部署后 prod 实测，按 [L2] 未执行记账不阻断。判 PARTIAL 的唯一原因是文档翻牌/批末新鲜度复核不完整（均为文档面反向漂移，无产品行为缺陷）：acceptance 点名的 §10.4 未翻牌（F004 已实装仍标「未实装归 M3」）；§9.4「as-built」时序图仍画已退役单步 /api/gate/confirm 流且 :1264/:1327 与同节 :1248/:1299 直接矛盾；§7.2.1 schema 唯一权威节未同步（3 态枚举 vs 实物 7 态、缺四表/票据列/contactEmail、迁移 2/7）；§5.2 四实体行未标 ✅。其余点名章节（§9.3.2/工具表/§14 M3-A 行/§10.1.1/agent-architecture 同步）核实均已正确翻牌。",
  "acceptance_items": [
    {
      "item": "E2E：draft_email 起草→send_outreach 无令牌 pending（副作用零发生断言）→confirm+execute→真实投递达 OUTREACH_TEST_RECIPIENT（L2 最小用量+报告注明）→OutreachMessage/Signal/留痕齐",
      "verdict": "PASS",
      "evidence": "npm run reach:e2e 全绿：①真网关起草 subject/body + 语言 zh（gateway chat 1 次，deepseek-v3 in=283 out=134 ~$0.000124）→草稿落库；②无令牌→pending 信封 + sent 行/SENT_MARKER 计数前后相等（副作用零发生）；③confirm 签票→execute 消费票→mock 投递；④OutreachMessage(direction=sent, gateLogId=PA.id) + thread pending_send→sent + irrev 留痕 + 状态推进留痕各 =1。Signal 路径由 tests/integration/signals-inbound.test.ts 12/12 承接（mock 链路不产投递状态信号属设计）。[L2] 真投递未执行：RESEND_API_KEY 仅存 VPS（U2 用户裁决）+ prod 现跑 M2-C @42bacb3——scripts/test/reach-e2e.ts:177-178 REAL 分支断言（mocked===false + providerMessageId 非空）在场，验证路径明文兜底三处（progress.json generator_handoff / .auto-memory/project-status.md / docs/dev/deploy.md）=部署后 prod 实测，不构成本地缺陷"
    },
    {
      "item": "真实 KOL 地址零发信（P1 断言）",
      "verdict": "PASS",
      "evidence": "脚本 P1 三重断言全过（前置：测试地址仅在合成夹具行；harm targets 唯一=测试地址；终局：5 分钟窗口无夹具外 sent 行）；跑后 dev DB 复核 SELECT contactEmail IS NOT NULL 零行（真实 KOL 零染指且夹具清态复原，spec §7 清态要求满足）"
    },
    {
      "item": "部署面：三 env 键幂等 append VPS .env + Resend webhook 指向 newkol.guangai.ai/api/signals/inbound + compose 如变更先 scp",
      "verdict": "PASS",
      "evidence": "只读 ssh 实证：VPS /opt/apps/newkolmatrix/.env 含 RESEND_API_KEY/OUTREACH_TEST_RECIPIENT/RESEND_WEBHOOK_SECRET 三键（仅读键名）；docker-compose.prod.yml md5 本地=VPS 完全一致（b04ba6837d95…，compose 本批有变更且已 scp）；compose:65-68 三键可选插值 + 缺键 fail-fast 语义注释、deploy.md:87-100 M3-A 前置人工步 ×3、.env.example:62-70 均在场。webhook 指向：用户已建 endpoint（2026-07-23 记录在案，新 signing secret 已入 VPS .env）；prod /api/signals/inbound 探针 404 = M3-A 未部署的预期状态，生效待部署（明文记账）"
    },
    {
      "item": "architecture.md 翻牌（§5.2/§9.3.2/§10.4/工具表/§14 M3-A 行）+ agent-architecture 同步 + 批末新鲜度复核（grep 陈旧计数/未实装残留）",
      "verdict": "PARTIAL",
      "evidence": "已正确翻牌：§9.3 两步票据端点表/令牌机制/§9.3.1 攻击面（R15 已消）/§9.3.2 ✅已实装/工具表 +3 行(:997-999)/reach 人格(:1103)/§10.1.1 +9 端点（/api/gate/* 退役）/§14 M3-A 行 ✅已交付(:1841)/§5.3② CRM 五态/§5.4/§9.8/§10.2-10.3/agent-architecture.md（零 /api/gate 残留）。未达标：①§10.4(:1530) acceptance 点名章节未翻牌——仍「演进目标（未实装，归 M3）」但 F004 已实装该节整条管道（normalize+Svix+externalId 防重+crmInfer 重算+OperationLog(auto)），词表也缺 email_delivery_status/manual_override；②§9.4「闸门时序（as-built）」(:1303-1325) 仍画已退役单步 POST /api/gate/confirm 确认即执行流，:1327 拒绝路径 epoch(0) 与 :1299「清 expiresAt=epoch 债、/api/gate/* 退役」同文矛盾，:1264「无 /api/gate/execute 端点」与 :1248 端点表矛盾；③§7.2.1 自称「schema 唯一权威（as-built 实物转录）」未同步：枚举 3 态 vs schema.prisma 7 态(:478-486)、缺 OutreachThread/OutreachMessage/Quote/Signal 四 model（实物 :379/:405/:428/:454）、缺 PA 票据 4 列、缺 Kol.contactEmail、迁移清单 2/7；④§5.2 四实体行未按 M2-A 惯例标 ✅；§5.5(:541) 反向漂移。commit 自称「/api/gate 残留全数清点」与实物 grep 结果不符"
    },
    {
      "item": "lint+tsc+test:unit+test:visual 绿",
      "verdict": "PASS",
      "evidence": "npx next lint：0 errors 0 warnings；npx tsc --noEmit exit 0（prisma generate 前置已跑）；npx vitest run：50 文件 515/515 全过；AIGCGATEWAY_* 伪造 + kill :3000 后 npm run test:visual：13/13 全过（standalone 产物 07:51 晚于最后产品 commit 6b30d40 06:28，测的即部署 artifact）；跑后 lsof -ti :3000 确认空"
    }
  ],
  "issues": [
    {
      "title": "architecture.md §10.4 未翻牌（acceptance 点名章节）——F004 已实装仍标「演进目标（未实装，归 M3）」",
      "severity": "medium",
      "evidence": "docs/dev/architecture.md:1530 节头未动（F010 commit 6b30d40 diff 无该区 hunk）；实物 src/lib/signals/ + /api/signals/inbound（§10.1.1:1420 自己已登记）即该节描述的管道；节内 Signal.type 词表缺已实装的 email_delivery_status/manual_override",
      "steps_to_reproduce": "sed -n '1530,1553p' docs/dev/architecture.md 对照 git show 6b30d40 -- docs/dev/architecture.md（无 §10.4 hunk）与 src/app/api/signals/inbound 实物"
    },
    {
      "title": "architecture.md §9.4「闸门时序（as-built）」仍画已退役单步 /api/gate 流，与同文 §9.3/§9.3.2 直接矛盾",
      "severity": "medium",
      "evidence": "时序图 :1319 'POST /api/gate/confirm' + :1321-1323 确认内联执行；:1327 拒绝路径 'POST /api/gate/reject → expiresAt=epoch(0)' 与 :1299 '清 expiresAt=epoch 债、旧单步 /api/gate/* 端点退役' 矛盾；:1264 '无 /api/gate/execute 端点' 与 :1248 端点表列出 /api/actions/[id]/execute 矛盾。均为「批末新鲜度复核 grep /api/gate 残留」应捕获项",
      "steps_to_reproduce": "grep -n '/api/gate' docs/dev/architecture.md，对照 :1241/:1248/:1299 的 as-built 表述"
    },
    {
      "title": "architecture.md §7.2.1「schema 唯一权威（as-built 实物转录）」未同步 M3-A 迁移——反向漂移",
      "severity": "medium",
      "evidence": "§7.2.1 标注对照日期 2026-07-21（M3-A 前）：enum PendingActionStatus 仍 3 态（实物 7 态 schema.prisma:478-486）、迁移清单只列 2 条（实测 prisma migrate status = 7 migrations）、缺四张新表 model 转录（实物 :379/:405/:428/:454）、PendingAction 转录（架构文档 :770 起）缺 ticketHash/ticketExpiresAt/ticketUsedAt/decidedAt、Kol 转录缺 contactEmail（§7.2 全区 grep 0 命中）。该节自身规则：'本节与实物冲突时，以实物为准并即刻修订本文'",
      "steps_to_reproduce": "对照 docs/dev/architecture.md:669-793 与 prisma/schema.prisma；npx prisma migrate status"
    },
    {
      "title": "次要陈旧残留：§5.2 四实体行未标 ✅、§5.5 反向漂移、src mock 注释沿用退役端点名",
      "severity": "low",
      "evidence": "§5.2 表中 OutreachThread/OutreachMessage/Quote/Signal 行无 ✅ 已实装标注（M2-A 实体行均有，文档自身惯例）；§5.5(:541) 仍「未实装归 M3」但 Signal+crmInfer 事件推断已在 reach 域实装；src/components/envs/delivery/index.tsx:7,76 与 envs/insight/index.tsx:195、admin/insight/page.tsx:218 注释仍写 /api/gate（M3-B/M4 mock 区前瞻注释，端点名已退役）",
      "steps_to_reproduce": "grep -rn '/api/gate' src/ docs/dev/architecture.md；sed -n '420,478p;541,547p' docs/dev/architecture.md"
    }
  ]
}
```

## 对抗复核结论（原样）

### 复核 F010 — 原判成立

```json
{
  "feature_id": "F010",
  "verdict_stands": true,
  "reason": "证伪失败，原 PARTIAL 成立。①口径核实：features.json F010 acceptance 原文明文点名「architecture.md 翻牌（§5.2/§9.3.2/§10.4/工具表/§14 M3-A 行）+ 批末新鲜度复核（grep 陈旧计数/未实装残留）」——§10.4 是验收硬项非 evaluator 自加。②四 issue 全部复现：§10.4(docs/dev/architecture.md:1530) 仍「演进目标（未实装，归 M3）」而实物 src/lib/signals/{normalize,ingest}.ts + src/app/api/signals/inbound/route.ts 在场、词表缺实物已有 email_delivery_status(normalize.ts:29)/manual_override(src/lib/reach/manual-override.ts)，git show 6b30d40 diff hunk 从 +1513 直接跳 +1838 证实该区零改动；§9.4「as-built」时序图 :1319 POST /api/gate/confirm + :1321-1324 确认内联执行 + :1327 reject→epoch(0)，与同文 :1241/:1248 端点表(/api/actions/[id]/execute)/:1299（清 epoch 债、/api/gate/* 退役）直接矛盾，:1264「无 /api/gate/execute 端点」与 :1248 矛盾，commit 自称「/api/gate 残留全数清点」失实；§7.2.1「schema 唯一权威」:678 枚举 3 态 vs schema.prisma:478-486 实物 7 态、迁移清单 2 条 vs prisma/migrations/ 实际 7 条、§7.2 区(:669-910) grep contactEmail|OutreachThread|OutreachMessage|Quote|Signal|ticketHash 0 命中而实物 schema.prisma:79/:379/:405/:428/:454/:506-509 全在；§5.2 M2-A 行带 ✅ 惯例而四 CRM 实体行无、§5.5(:541) 反向漂移、src 4 处 /api/gate 注释残留（admin/insight/page.tsx:218、envs/delivery/index.tsx:7,76、envs/insight/index.tsx:195）均复现。③PASS 项抽查无反向虚假：prisma generate 后 tsc exit 0、vitest 50 文件 515/515、next lint 0/0、npm run reach:e2e 实跑 15 断言全绿（真网关 1 chat deepseek-v3 ~$0.000118、mock 零外呼、P1 三重断言过、夹具清理）。④环境误报排除：四 issue 均为文档 vs 实物差异，不属 testing-env-patterns.md 已知模式；REAL 真投递未执行系 U2 裁决（密钥不离 VPS）环境约束，原发现按 [L2] 记账未因此降级——PARTIAL 唯一依据是 acceptance 点名文档硬项未完成，判定准确、无需修订。"
}
```

### 复核 F008 — 原判成立

```json
{
  "feature_id": "F008",
  "verdict_stands": true,
  "reason": "对抗复核未能证伪，反而独立复现并加固了原发现。(1) 机制链逐环核验成立：route.ts:37,59-62 对象字面量恒携带 language 键且 UI 可达路径（ConversationInbox.tsx:186 恒发 draft subject + email-drafting.ts:183 起草恒写 truthy subject / 无 draft 时 draftRow=null）下恒为 undefined；项目 zod 4.4.3 实测 safeParse 保留 present-but-undefined 键（parsed.data keys 含 language）；gate.ts:63-75 stableStringify 将 undefined 内插为字面量参与建卡 hash；Prisma 6.19.3 JSONB 写入丢键（实测库内 inputJson keys=body,kolId,projectId,subject）；confirm（gate.ts:232-237）按库内复算恒不匹配。(2) 决定性复现：`node --env-file=.env --import tsx scratchpad/f008-adv-repro.ts`（服务层直调真库、合成夹具、零发信、residue=0）——REPRO-A（route 同构入参）库内 payloadHash cfd4c3e2…=hash(含 language:undefined)，hash(库内 inputJson)=9bde933d…≠，confirmPendingAction 抛 GateError code=GATE_TOKEN_INVALID http=403 msg=「payloadHash 不匹配，拒绝确认」，与原发现逐字一致；CONTROL-B（language:'en'）与 CONTROL-C（键缺席）confirm 均签票成功，证明失败特异于 undefined 键形状、排除夹具/环境因素，并解释 gate:smoke/reach:e2e 未盖住的原因。(3) 环境误报排除：对照 testing-env-patterns.md 全部 7 条不命中；失败在 confirm 步（发信之前），与 REAL 密钥仅存 VPS 的环境约束无关。核心验收项「发送经真闸门链路」在 UI 可达全部 send 路径功能性不可用，FAIL 判定正确。"
}
```

### 复核 F002 — 原判成立

```json
{
  "feature_id": "F002",
  "verdict_stands": true,
  "reason": "证伪失败，原 FAIL 成立。Critical issue（payloadHash undefined-键中毒）四层独立复现：(1) 源码——route.ts:61 恒带 language 键（带 subject 主路径为显式 undefined），gate.ts:63-75 stableStringify 将其序列化为 \"language\":undefined 参与建墙 hash，违反 gate.ts:62 自述「抗 JSONB 往返」不变量；(2) 纯函数（真实 zod 4.4.3 + payloadHashOf）——zod parse 保留 undefined 键，建墙 hash 58a5ce56 ≠ JSONB 往返 hash c4b6eb2e，无 undefined 键对照组 MATCH=true；(3) 真实 DB 服务层（Prisma 6.19.3 + dev Postgres）——JSONB 写入丢弃 language 键（读回 keys 仅 body/kolId/subject/projectId），confirmPendingAction 抛 GateError GATE_TOKEN_INVALID http=403「payloadHash 不匹配，拒绝确认」，对照组正常签票；(4) 完整 HTTP——POST /api/reach/send{subject,body} → 200 pending → POST /api/actions/{id}/confirm → HTTP 403 {\"code\":\"GATE_TOKEN_INVALID\"}，与原 steps_to_reproduce 逐字一致；UI 真链核实 ConversationInbox.tsx:180 直打该路由，主用户路径必中毒。High issue 2 亦实证：仅 /api/agent/route.ts:26 导入 tools index（注册唯一触发点），冷 dev 进程 POST /api/reach/send → 400「[tools] 未知工具: send_outreach」，触碰 /api/agent（405 亦可）后恢复。环境误报排除：testing-env-patterns §1-§7 无一命中，缺陷为确定性纯逻辑问题与 dev/standalone 形态无关；L2 真投递缺席属环境约束且非 FAIL 理由。口径核对：F002 acceptance 含 HTTP 分码语义、spec U3 要求接通 /api 真链路，stableStringify 属 F002 自有代码——产品面 confirm 恒 403 使闸门人工放行主功能断裂，FAIL 无放宽。复核夹具全部清态（cleaned 1 kol/1 project/1 pendingAction），:3000 已释放，临时探针已删除。"
}
```
