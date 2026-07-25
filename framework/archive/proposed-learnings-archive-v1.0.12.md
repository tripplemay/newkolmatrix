# Proposed Learnings 归档 — v1.0.12（2026-07-25 沉淀完成）

> 来源批次：KOLMatrix M3-A-REACH-CRM round1 验收。用户 2026-07-25 确认采纳（M4-INSIGHT done 收尾会话）。
> 已写入：patterns/database-patterns.md §9 + patterns/testing-env-patterns.md §8/§9 + patterns/web-runtime-patterns.md §7 + CHANGELOG v1.0.12。

---

## [2026-07-23] Andy/evaluator — 来源：M3-A-REACH-CRM round1 验收（payloadHash undefined-键中毒 critical）

**类型：** 新坑（4 条相关）

**内容：**
1. **「建立时算 hash / 存储后复算」模式必须对齐存储层序列化语义。** payloadHash 在 createPendingAction 时按内存对象算、在 confirm/execute 时按 Prisma 读回的 JSONB 算——内存对象含 `{language: undefined}`（zod 保留 present-but-undefined 键），JSONB 写入丢弃 undefined 键 → 两次 hash 必不匹配 → V6 发送 confirm 恒 403。凡「先算后验」的完整性哈希，stableStringify/序列化必须与存储层往返语义一致（object undefined 值键丢弃 = JSON.stringify/JSONB 同款）。
2. **闸门/签名/token 类 feature 的回归测试必须含「HTTP 路由创建 → 后续验证」全链。** 本 bug 被 gate-smoke + reach-e2e 全绿漏检，因两者均为服务层直调且入参无 undefined 键——恰好绕开 HTTP 路由的字面量入参毒化路径。服务层测试 ≠ HTTP 链测试；outbound 闸门这类跨请求状态机，缺 HTTP 端到端回归 = 主用户路径盲区。
3. **工具/handler 注册不应依赖某个「入口模块」的模块图副作用。** 注册副作用仅在 /api/agent import tools/index 时触发；冷进程直打 /api/reach/* 或 /api/actions/[id]/execute（跨会话恢复场景）时注册表为空 → 400/500。唯一执行入口（executeTool）与各执行点应显式幂等注册。standalone boot 预载幸免是运气不是契约。
4. **mock 发送类验收清态必须按业务标记（如 SENT_MARKER）清 OperationLog，不能只按 ref=PA.id 清。** SENT_MARKER 行的 ref 语义为 projectId（非 PA.id），按 ref 清理会漏 → 污染 dev 租户活动流 → 后续视觉基线（today 页 feed）首跑失败误判为产品回归。

**建议写入：** 坑 1/2 → `framework/patterns/database-patterns.md`（新节：完整性哈希与 JSONB 往返）或 `patterns/testing-env-patterns.md`；坑 3 → `patterns/web-runtime-patterns.md`（Next.js 路由注册副作用）；坑 4 → `patterns/testing-env-patterns.md`（mock 副作用清态）。四条均来自隔离验收抓出、building 自测漏检的真实 critical，价值高。

**状态：** ✅ 已沉淀（v1.0.12）
