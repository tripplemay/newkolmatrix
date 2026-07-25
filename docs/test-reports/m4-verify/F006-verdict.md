```
feature_id: F006
result: PASS

acceptance_checklist:
- ✓ draft_report 注册且挂 insight 人格 — tools/index.ts NATIVE_TOOLS 含 draftReportTool；registry.ts:171 insight tools=['compute_roi','draft_report','create_share_link']；运行时核验 personaToolSubset(insight) + toAiSdkTools 暴露键均含 draft_report（不止声明，确实可被调用）
- ✓ class=internal — 注册表实物 name=draft_report class=internal source=native buildHarm=undefined
- ✓ 经 gateway chat 起草（长文档路由） — 本地 stub 截获：默认 caller 真发 POST /v1/chat/completions，wire model=deepseek-v3(=REPORT_CHAT_MODEL)、max_tokens=4000；system 含诚实铁律，user 段含 <FACTS>+spend 真值 987.65+「已放款」口径+缺口行
- ✓ 长文模型路由插座生效 — AIGCGATEWAY_REPORT_MODEL=eval-big-long-doc-model 重跑 → wire model 随之改变
- ✓ 无凭据/SKIP → 固定草案 + 明示降级不静默 — degraded=true、首行「【降级草案】」、console.warn 实捕获、降级路径网关调用数 3→3（零外呼）、草案仍含真实 spend
- ✓ WeeklyReport 落库（draftContent 非空 / adopted=false） — 直读库行：draftContent=LLM 产物、adopted=false、adoptedAt=null、generatedBy='insight'
- ✓ projectId 区分 scope（P10 双态） — 同 period 2031-W01 下 projectId=null 与非空落两条独立行
- ✓ 采纳置 adopted=true + adoptedAt — /api/insight/adopt 复用同一服务，无第二实现
- ✓ 幂等：重复采纳不改写 adoptedAt — 并发两路 adopt 仅 1 路 alreadyAdopted=false 且两路 adoptedAt 相等；串行第三次 alreadyAdopted=true 库行未变（原子 updateMany where adopted:false）
- ✓ 采纳是 internal（无 PendingAction） — 起草×6 + 采纳×4 + 工具直调后 PendingAction count=0
- ✓ 集成测覆盖起草落库 + 采纳幂等 — tests/integration/draft-report.test.ts 12/12 passed
- ✓ LLM 经注入缝 mock（真网关 L2 留验收） — CI 无凭据条件复现（AIGCGATEWAY_* 置空）仍 12/12 且 mock 用例 degraded=false，证明注入 caller 无条件调用（c09ef41 回归已钉死）；[L2] 真网关起草未授权、未执行

evidence:
- npx vitest run tests/integration/draft-report.test.ts → Test Files 1 passed (1) / Tests 12 passed (12)
- AIGCGATEWAY_BASE_URL= AIGCGATEWAY_API_KEY= npx vitest run …（CI 无凭据条件）→ 同样 12/12
- 自建独立探针 scripts/test/f006-eval-probe.ts（20 断言 / 18 通过，2 个 ❌ 均为标注的〔观察〕项，非 acceptance）；尾行「网关调用总数（全部指向本地 stub）= 8；真网关调用 = 0」
- npx tsx scripts/test/f006-router-check.mts → insight 收窄子集 ["compute_roi","draft_report","create_share_link"]，toAiSdkTools 暴露键一致
- npx prisma generate && npx tsc --noEmit → F006 相关文件零错；唯一报错源是并行 evaluator 的 tests/unit/share-adapter.evaluator-probe.test.ts（TS7005/TS2749，F007/F008 面），与本 feature 无关，请转告对应 evaluator 清理
- DB 实物：\d "WeeklyReport" 10 列 + 2 索引 + projectId FK；探针夹具已清（Tenant like 'test-tenant-m4-f006-eval%' = 0）
- 未提交的 evaluator 测试产物（交编排者处置，避免与并行 fan-out 抢 git）：scripts/test/f006-eval-probe.ts、scripts/test/f006-router-check.mts

soft_watch（不属 acceptance，不阻断）:
- S1 降级固定草案复用了 prompt 用的 escapeForXml → 名含 &<> 的项目在用户可见草案里显示为 R&amp;D &lt;alpha&gt;（仅无凭据态可见，纯展示层）
- S2 findFirst→create 非原子 + (tenantId,projectId,period) 无唯一约束 → 同周期并发起草会堆 2 行（顺序重入覆盖策略有效、例程侧有 runExclusive；建议下批加唯一约束或 upsert）
- S3 [L2] 未执行：AIGCGATEWAY_REPORT_MODEL 未配时长文周报实际仍走 deepseek-v3，「长文用大模型」在 prod 默认态未差异化；授权后建议 INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e 复核
```

零真实副作用核证：真网关全程零访问（base URL 在 import 产品模块前被改写为进程内 127.0.0.1 stub + 假 key），无邮件/资金/公开链接；写库仅限自建隔离夹具租户且已清理。progress.json / features.json / 产品代码均未改动。

完整验收报告：`docs/test-reports/M4-INSIGHT-F006-verify-Andy-evaluator-subagent.md`

—— Andy / evaluator-subagent（隔离上下文，2026-07-24）
