# M3-A-REACH-CRM 复验报告（reverifying · round 2）

> 日期：2026-07-23 · 形态：隔离复验 evaluator subagent（fresh context，自行磁盘取证）· 署名：Andy/evaluator-subagent
> 复验基准：`docs/test-reports/M3A-reach-crm-verify-round1-2026-07-23.md`（2 FAIL F002/F008 + 1 PARTIAL F010）· 修复实物：commit `cf94c5d`
> **签收状态：signoff 扣留** —— F010 复验为 PARTIAL（残留 1 处首轮点名反向漂移段落），未达「全 PASS」硬条件，不得出签收报告 / 不得置 done（evaluator.md §8）。

## 总表

| Feature | 首轮 | 复验 | 结论一句话 |
|---|---|---|---|
| F002 | FAIL | **PASS** | critical/high/low 三 issue 全修；回归测试「修复前红（6/7）/修复后绿（7/7）」可对比性在前版 worktree 实证；HTTP 原步骤在 standalone + 冷 dev 双工件复跑全通 |
| F008 | FAIL | **PASS** | 首轮路径 A（浏览器）原样复跑：选人→发送→确认卡→「确认发送」→ toast「邀约已发送」+ pill 经 crmInfer 推进「已发送」；stub 残留 grep 复扫零命中；视觉 13/13 |
| F010 | PARTIAL | **PARTIAL** | 三 medium 文档 issue 主体已修（§10.4/§9.4 时序图/§7.2.1/§5.2/§5.5/src 注释/审计编号），但首轮 issue 2 **点名两次**的 :1264（现 :1151）「无 /api/gate/execute 端点」段落未修——as-built §9.3 权威节内与三行之上的端点表直接矛盾（反向漂移）；另新引入 §7.2.1 枚举计数笔误（低危） |

**结果：F002 PASS · F008 PASS · F010 PARTIAL → 状态应流转 fixing（fix_rounds → 2）**

---

## 1. F002 逐 issue 复验

### 1.1 [critical] payloadHash undefined-键中毒 → **已修复（实证）**

**修复实物审读（cf94c5d）：**
- `src/lib/agent/gate/gate.ts` stableStringify：object 中 undefined 值键 filter 丢弃（对齐 JSON.stringify/Prisma JSONB 往返语义）、数组 undefined 元素 → null（`if (v === undefined) return 'null'` 仅数组元素路径可达）——根治主防线 ✓
- `src/app/api/reach/send/route.ts:61-66`：`...(language ? { language } : {})` 条件展开，不携带 undefined 值键——路由侧双保险 ✓

**回归测试可对比性（「修复前失败/修复后通过」硬核验）：**
- 隔离 worktree 检出前版 `cf94c5d^`，注入两个新回归测试文件实跑：**6/7 翻红**（payload-hash.test.ts 3/4 红 + gate-http-regression.test.ts 3/3 红；唯一通过项恰为「key 顺序无关原不变量不回退」设计对照组）
- 修复后主仓：**7/7 绿**（并入全量 522/522）。检测器活性自证，可对比性成立。worktree 已清理，主仓 git 状态干净
- 测试设计质量核：integration 测刻意不 import tools/index（同文件同时覆盖回归 ②）、毒化形状与 /api/reach/send 字面量同构、打真库夹具租户 pid 隔离自清理——三点均实证有效

**HTTP 级原步骤复跑（首轮 steps_to_reproduce 原样）：**

| 步骤 | 首轮结果 | 复验结果 |
|---|---|---|
| standalone 冷进程 POST /api/reach/send（带 subject） | 200 pending | 200 pending ✓ |
| GET /api/actions/[id] | 200（脱敏） | 200，响应无 inputJson/任何 hash/票 ✓ |
| POST confirm | **恒 403 GATE_TOKEN_INVALID（S3）** | **200 {confirmed:true, ticket(64-hex), ticketExpiresAt}** ✓ |
| POST execute（standalone=prod 模式无 RESEND_API_KEY） | — | 500 INTERNAL → DB：`failed` + ticketUsedAt 已记 + **irrev=0**（P4 prod fail-fast 拒发=F003 设计语义，环境预期）✓ |
| 冷 dev 全链（带 subject / 无 subject 手写两路径，全程未触 /api/agent） | T18/T26 均 403 | 两路径均 send 200 → confirm 200 → **execute 200 executed + mocked:true** ✓ |
| DB inputJson 键形状抽查 | payloadHash 按含 language:undefined 计算 | 三条 PA 均 `body,kolId,projectId,subject`（无毒键），全部到达正确终态 ✓ |

### 1.2 [high] 工具注册模块图副作用 → **已修复（实证）**

- 实物：`execute.ts:22-24` executeTool 唯一执行入口自带幂等 `ensureNativeToolsRegistered()`；`gate.ts:338-340` executePendingAction 执行点同款 ✓
- 冷进程复现步骤复跑：冷起 `next dev` **不触碰 /api/agent** 直打 POST /api/reach/send → 首轮 400「[tools] 未知工具」→ 复验 **200 pending**；后续 confirm/execute 全通 ✓；standalone 冷进程同样直达全通 ✓
- 回归测试：gate-http-regression.test.ts 回归 ② 在前版 worktree 实跑翻红（「[tools] 未知工具」），修复后绿 ✓

### 1.3 [low] rate-limit 注释失真 + XFF 伪造 → **已修复（注释）/ 明文兜底（边界）**

- `rate-limit.ts:80-86` 注释校准：Next 15 self-host 自注入 XFF、null 分支防御性存在、DISABLE_GATE_RATELIMIT 逃生口——与首轮实测事实一致 ✓
- XFF 首段可伪造边界：注释明文「可信段取法（右起首个非代理段）记 M3-B 顺手项」——soft-watch 有明文兜底，不阻断 ✓

### 1.4 F002 全量 acceptance 重判：**9/9 PASS**

四端点 nodejs runtime（HTTP 活体响应）· 票仅 confirm 一次 + DB 只存 hash（复跑实证 + GET 脱敏核验）· 两处原子条件 UPDATE 败者 409（gate:smoke G8 复跑）· reject 真实 rejected（G6）· **HTTP 分码**（首轮 PARTIAL 唯一依据 = 403 假阳性，已消——分码语义在真实链路恢复保真）· P9 rate-limit（单测在 522 内）· gate-smoke 全绿（复跑 exit 0，54 断言）· 执行事务语义（G5/G7 + standalone failed 路径 DB 核验 irrev=0）· **整链可用性（首轮 FAIL 项）= 双工件 + 双路径 + UI 级全通**。

---

## 2. F008 逐项复验

### 2.1 [critical] V6 发送真链 confirm 恒 403 → **已修复（UI 级实证）**

首轮路径 A 原样浏览器复跑（Playwright + 冷 dev + 合成夹具，P1 零真实 KOL）：
1. `/admin/campaigns/{id}?env=reach` → 左栏选「ReverifyUI 夹具创作者」→ draft 区显示草稿正文 ✓
2. 点红色「发送」→ 确认卡弹出「确认发送对外邮件」，harm 如实披露唯一收件地址 `reverify-ui@test.invalid` ✓
3. 点「确认发送」→ **toast「邀约已发送」**（首轮此步 toast「payloadHash 不匹配，拒绝确认」）✓
4. 截图证据：左栏 pill 与右栏档案「当前阶段」均翻「已发送」（五态 pill = crmInfer 真值随发送推进 pending_send→sent）；人工标记控件仅三态（已发送/已回复/谈判中），与 F009 一致 ✓

### 2.2 其余 acceptance 组合证明（8/8 PASS）

- 修复 commit 对 reach UI 文件**零触碰**（diff 仅 delivery/insight 注释），首轮 26/26 元素断言、条件渲染、空态、两视口证据链有效延续
- stub 残留复扫：grep `confirmSend|confirmQuote` src/ **零命中**（EXIT 1）✓；env-reach.ts 退役登记未回退 ✓
- 视觉基线：`test:visual` 复跑 **13/13 全绿**（伪造 AIGCGATEWAY_* + standalone 工件 + 前后 :3000 清空）——零漂移 ✓

---

## 3. F010 逐 issue 复验

### 3.1 [medium] §10.4 未翻牌 → **已修复**
as-built 管道图（/api/signals/inbound 验签/限流/zod → normalize → ingest 防重 → recompute → 留痕）+ 词表 email_delivery_status ✅/manual_override ✅ 行、email_reply 诚实归 M3-B+——与 src/lib/signals/ 实物逐点一致 ✓

### 3.2 [medium] §9.4 时序图仍画旧单步流 → **主体已修，残留 1 处点名段落未修 → PARTIAL 依据**

- 时序图已重绘为两步票据流（GET 详情→confirm 签票→execute 消费票→同一事务/failed 分支），拒绝路径改「真实 rejected 态…不再以 expiresAt=epoch(0) 失效——债已清」✓
- **残留（未修）：** 现 `docs/dev/architecture.md:1151`（首轮点名的 :1264，出现于首轮 issue 2 evidence 与对抗复核结论**两处**）：
  > 「**无 `/api/gate/execute` 端点**：确认与执行在服务端同一函数内完成。这消除了『已确认但未执行』的中间态，代价是…副作用失败时整个 confirm 请求失败，PA 停在 pending 可重新确认。」
  该段身处「§9.3 端点契约与令牌（**as-built：两步票据，M3-A F002 起**）」权威节内、无任何历史语境标注，三句断言全部与实物相反：① `/api/actions/[id]/execute` 端点就在三行之上的端点表（:1135）；② `confirmed` 中间态正是 F002 两步票据的核心（§9.3.2 同文）；③ 副作用失败落 `failed` 终态而非「停在 pending 可重新确认」。`git show cf94c5d -- docs/dev/architecture.md | grep gate/execute` 零命中——修复 commit 未触该段。按文档新鲜度 clause（已实装却仍标未实装 = 反向漂移）+ 首轮 feedback 点名项未修，判 PARTIAL。

### 3.3 [medium] §7.2.1 未同步 → **已修复（含 1 处新低危笔误）**
- 重写为 as-built 快照：枚举块与 `prisma/schema.prisma` **逐枚举逐值全对**（11 个枚举含 7 态 PendingActionStatus / 5 态 ReachStatus）；模型清单 17 = 实物 17；迁移清单 7 条与 `prisma/migrations/` 逐名一致；权威声明改指实物防再漂移 ✓
- **新低危笔误：** 标题写「枚举（**10 个**，与实物逐字一致）」，块内与实物均为 **11 个**——计数标签差一（终态判据成立：清单完备且逐字一致；仅标签错）

### 3.4 [low] §5.2/§5.5/src 注释残留 → **已修复**
§5.2 reach 行 +Signal + ✅ M3-A ✓；§5.5 改「部分实装」+ 词表逐项 ✅/归期标注 ✓；delivery/insight/admin-insight 三处注释改指 /api/actions 端点族 ✓；F008 审计文档 V6-25/26 编号与 ui-inventory 对齐（F009 low 消解）✓

### 3.5 F010 全量 acceptance 重判

| 项 | 判定 | 证据 |
|---|---|---|
| E2E 闭环 | PASS | `npm run reach:e2e` 复跑 15 断言全绿；[L2] 真网关 chat 1 次（deepseek-v3 in=283 out=191 ~$0.000146，授权内最小用量）；[L2] REAL 真投递未执行（U2 密钥不离 VPS，三处明文兜底=部署后 prod 实测），记账不阻断 |
| P1 真实 KOL 零发信 | PASS | 脚本三重断言过 + 复验全程仅 `*@test.invalid` 合成夹具 + 收尾 DB `contactEmail IS NOT NULL` = 0 |
| 部署面 | PASS | 首轮只读 ssh 实证（三键 + compose md5 一致）后无任何变更（修复 commit 不触部署面），组合证明有效 |
| architecture.md 翻牌 + 批末新鲜度复核 | **PARTIAL** | §3.2 残留段落 + §3.3 计数笔误；其余全修 |
| lint+tsc+test:unit+test:visual | PASS | 见 §4 |

---

## 4. 批级回归面（全部复跑）

| 项 | 结果 |
|---|---|
| `npx vitest run` | **52 文件 522/522 全绿**（504 基线 + 回归 7 例 + 首轮 evaluator 探针 11 例） |
| `npm run gate:smoke` | 全部断言通过（G1-G8 + G5.5 + 7 态 + D20 变异 + 并发竞态），数据自清理 |
| `npm run reach:e2e` | 15 断言全绿（mock 投递零外呼；gateway chat 1 次已申报） |
| `npx tsc --noEmit` | exit 0（prisma generate 前置） |
| `npx next lint` | 0 errors 0 warnings |
| `npm run test:visual` | **13/13**（伪造网关 env + standalone；首跑 1 失败经查为**本复验自产 SENT_MARKER 留痕污染 today 页活动流**——自产残留清除后复跑全绿，非产品回归；教训见 §6 备注） |
| 回归可对比性 | 前版 worktree 6/7 红 / HEAD 7/7 绿（§1.1） |

清态收尾：夹具（tenant/project/kol/thread/message/PA/OperationLog 含 SENT_MARKER 行）全量删除，DB 残留三查归零；:3000 释放确认；git 工作树干净（无未追踪测试产物——本轮探针为一次性临时脚本，跑毕即删，决定性证据已全文转录本报告）。

---

## 5. 遗留 soft-watch 清单（签收时随批转录）

首轮 PASS 特性附带 low issues（原样转录，均不阻断）：

1. **F003-low-1**：ResendEmailSender 30s 超时为 Promise.race 非 AbortController 真中断——Idempotency-Key 在场不双发，功能无损；建议后续批次顺手真 abort
2. **F003-low-2**：幂等重入分支返回 `mocked:false` 硬编码——重放时输出字段语义轻微失真，无断言面影响
3. **F004-low-1**：ingest 落库四步非同一事务——中途失败后重投走防重路径，该事件 lastSignalAt/重算/auto 留痕可能缺失（CRM 态最终收敛，影响有界）；建议 $transaction 包裹或 duplicate 路径补幂等重算
4. **F002-low（本轮结转）**：XFF 首段可伪造旋转绕过限流（辅助防线）——可信段取法已明文记 M3-B 顺手项（rate-limit.ts 注释兜底）
5. **L2 真投递 REAL**：本地不可执行（U2 密钥不离 VPS）——验证路径三处明文兜底 = 用户触发 deploy-prod 后 prod 实测（仅 OUTREACH_TEST_RECIPIENT）

已消解（不再挂账）：F009-low-1 编号互换（cf94c5d 修）· F009-low-2 探针未追踪（已入 git）· F002-low 注释失真（cf94c5d 修）。

---

## 6. 本轮新发现 issues（fixing round 2 输入）

```json
[
  {
    "feature_id": "F010",
    "result": "PARTIAL",
    "severity": "medium",
    "title": "首轮 issue 2 点名段落未修：architecture.md:1151「无 /api/gate/execute 端点」仍留在 as-built §9.3 权威节内，与同节端点表/§9.3.2 直接矛盾（反向漂移）",
    "description": "该段三句断言全部与实物相反：execute 端点在场（:1135 端点表）、confirmed 中间态存在（两步票据核心）、失败落 failed 终态非停 pending。首轮 evaluator_feedback 的 issue 2 evidence 与对抗复核结论两处点名（原 :1264），修复 commit 未触及（diff grep 零命中）。修复量：删除或改写该段为两步票据事实 + 复扫 grep '/api/gate' 逐命中定性（现余 5 命中中 :1128/:1186/:1256/:1835 为退役声明/历史记述属合法，仅 :1151 违规）",
    "steps_to_reproduce": "1. sed -n '1151p' docs/dev/architecture.md 2. 对照 :1135 端点表与 §9.3.2（:1169）3. git show cf94c5d -- docs/dev/architecture.md | grep 'gate/execute' → 零命中证明未修"
  },
  {
    "feature_id": "F010",
    "result": "PARTIAL",
    "severity": "low",
    "title": "§7.2.1 枚举计数标签笔误：标题写「枚举（10 个）」，块内清单与 schema.prisma 实物均为 11 个",
    "description": "cf94c5d 重写 §7.2.1 时引入。清单本体逐枚举逐值与实物全对（终态判据成立），仅标题计数差一。一词修正",
    "steps_to_reproduce": "grep -n '枚举（10 个' docs/dev/architecture.md 对照 grep -c '^enum ' prisma/schema.prisma → 11"
  }
]
```

**备注（不判 issue，供 Generator/后续 Evaluator 参考）：** 复验期间 today 页视觉基线首跑失败系本 Evaluator 自产夹具的 SENT_MARKER OperationLog 行（ref≠PA.id，按 ref 清理会漏）污染 dev 租户活动流——mock 发送类验收清态必须额外按 summary 清 SENT_MARKER 行，已在本轮清净。

---

## 7. 总判定

**F002 PASS · F008 PASS · F010 PARTIAL → 不满足全 PASS，signoff 扣留，状态应流转 `fixing`（fix_rounds → 2），features.json F010 应改回 `pending`。**

修复面评价：两条 FAIL（critical+high）修复质量高——根治+双保险+可对比回归测试三件套齐，产品行为面本轮零缺陷；唯一挡签收的是文档面一段首轮已点名的反向漂移残留 + 一处低危笔误，修复成本约两处编辑，建议 fixing round 2 速修后仅针对 F010 文档面做窄幅复验（F002/F008 无需重开——除非 round 2 触碰产品代码）。
