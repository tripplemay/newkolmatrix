```
feature_id: F005
result: PASS

acceptance_checklist:
- ✓ compute_roi 注册且挂 insight 人格（registry tools 数组 + 单测同源断言）
    证据：registry.ts:171 insight.tools = ['compute_roi','draft_report','create_share_link']；tools/index.ts:42 入 NATIVE_TOOLS。
    加严到 router 层：personaToolSubset(getPersona('insight')) 含 compute_roi；insight 声明的 3 个工具名全部 getTool() 命中；
    其余 6 人格均不含 compute_roi（反向越界检查）。
- ✓ class=internal 且无 buildHarm（只读不过闸门）
    证据：compute-roi.ts:95 class:'internal'、无 buildHarm 字段；行为层实测执行前后 PendingAction / OperationLog /
    MetricSnapshot 三表计数不变（不只看声明）。
- ✓ 输出 = roi.compute + attribution.gaps 产物（不内联重算，grep 证）
    证据：grep 文件体内除 computeRoi( / attributionGaps( / loadProjectSpend( 三处委派调用外无任何算式（唯一 grep 命中是注释行）；
    另加桩替换证明——把两纯函数 mock 成哨兵后输出 roi/gaps/facts 逐字等于哨兵，入参接线为
    {spend:facts.spend, reach:null, conversions:null, actualExposure:null, targetExposure:goal.targetExposure}。
- ✓ 分子缺 → roi=null + gaps 非空（诚实透传，工具层不伪造）
    证据：payout 源 → roi=null / basis='insufficient_evidence' / gaps 3 条 / exposure.direction=null（不冒充 flat）；
    quote 源 → SPEND_COMMITTED_ONLY 带 committed{1200.5,USD} 且不含 SPEND_ABSENT（弱证据未与无证据压成一码）；
    空态 → spend=null + source='none' + SPEND_ABSENT（不填 0）。
- ✓ 输出可序列化（JSON 往返无损，供画布渲染）
    证据：JSON 往返深等；加严断言 typeof facts.spend==='number'（无 Prisma.Decimal 泄漏）+ 递归校验输出全为纯对象/数组。
- ✓ 输入契约单测
    证据：缺字段 / 空串 / 非字符串三种坏入参均被 zod 拒（'入参校验失败'）；项目不存在明示抛错；
    多余键 {bogus, roi:999} 被剥离且不污染输出。
- ✓ [附加·安全] 租户隔离：他租户 ctx 查同一 projectId → 抛「项目不存在」，不跨租户出数。

evidence:
- prisma generate 前置后 `npx vitest run tests/integration/{compute-roi-tool,eval-m4-f005-delegation,eval-m4-f005-compute-roi.probe}.test.ts`
  → "Test Files 3 passed (3) / Tests 20 passed (20)"（Generator 8 + 委派证明 3 + 真库探针 9）
- `npx tsc --noEmit`：本 feature 相关文件 0 错（含新增两测试文件）
- 变异检测（git worktree 只读副本内改产品码，主工作树产品代码零改动）：
  M1 内联重算 → 2 failed；M2 分子缺伪造 roi??0 → 4 failed；M3 gaps 吞空 → 5 failed；
  M4 去掉 tenantId 过滤 → 2 failed；M5 class 误标 outbound → 15 failed；M6 输出塞 new Date() → 2 failed。6/6 全杀。
- 零对外副作用核证：代码路径不引 lib/ai/gateway，全程无网关外呼（L2 授权未消耗）；夹具租户自清（slug contains 'f005' = 0 行）；
  ShareLink 0 行 / PendingAction 0 行。
- 产出物已 commit+push：3bb213d（tests/integration/eval-m4-f005-delegation.test.ts、
  tests/integration/eval-m4-f005-compute-roi.probe.test.ts、docs/test-cases/M4-INSIGHT-F005-compute-roi.md）；
  产品代码 / progress.json / features.json 未动。

soft_watch（不构成 FAIL/PARTIAL）:
1. Generator 测试对「不内联重算」证据强度不足：判据为「与纯函数直算逐字相等」，本批分子恒 null 口径下内联重算实现同样能过
   （M1 变异实测 Generator 8/8 仍绿）。产品实现确为委派（grep + 桩双证）故 PASS；缺口已由新增委派证明测试补成常驻守门。
2. Generator 测试未覆盖跨租户越权（M4 仅被我的探针杀）；实现正确，探针已常驻。
3. 【非 F005·跨切面】主工作树另一并行验收的未提交文件 tests/unit/share-adapter.evaluator-probe.test.ts 带 2 个 tsc 错
   （TS7005 mockish 隐式类型 / TS2749 ShareError 当类型用）——原样提交会红 CI tsc job，请转给对应 evaluator 修正。
```

---

署名：Andy/evaluator-subagent（隔离上下文，fresh context）· 2026-07-24
被测实物：`src/lib/agent/tools/compute-roi.ts` @ commit 73f1f10 · `tools/index.ts` · `registry.ts`
配套用例记录：`docs/test-cases/M4-INSIGHT-F005-compute-roi.md`
