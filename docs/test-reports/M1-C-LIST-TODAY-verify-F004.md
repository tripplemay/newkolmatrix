# M1-C-LIST-TODAY 验收分报告 — F004 例程调度器最小闭环（node-cron + health-scan）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context，fan-out 分片）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `5a666a9`（F004 实现 commit `948d327`）
- **环境：** 本地 standalone `http://127.0.0.1:3000`（PID 41879，BUILD_ID `ctK8cNIm1QNXW3nAvH_s` @ 02:31:54，即 HEAD 构建）；dev DB `newkolmatrix-dev-db`（Postgres :5434，4 canonical 项目，OperationLog/PendingAction 基线零行）
- **结论：PASS（全部 acceptance 条目通过，无 blocker；3 条非阻断观察）**

---

## 1. 验收范围与依据

- features.json F004 acceptance（无 Planner 修订注记，原文即口径）
- spec §2 F004 + §3 D-C + §4 数据准备（「OperationLog 出现 4 条 kind=auto」）+ §5 验收口径 F004 行（「routine:health-scan 手动触发落 4 条 OperationLog(kind=auto)；互斥锁与 ROUTINES_DISABLED 行为实证；instrumentation 仅 nodejs runtime 注册」）
- L1 前置（testing-env-patterns）：`npx prisma generate` 已先行；项目无 `.nvmrc`（Node 版本规则不适用）；UI 实测走 standalone（§7）

## 2. 逐条判定

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | 新建 `src/lib/jobs/scheduler.ts`（node-cron 注册 + 进程内互斥锁：上轮未结束不重入） | PASS | 文件存在；`runExclusive` 以 `Set<string>` 做进程内互斥（:20-40），占用时返回 null 不重入、finally 释放。互斥语义由集成测试第 3 例实证（并发第二次 → null；释放后第三次可进） |
| 2 | 新建 `src/lib/jobs/routines/health-scan.ts` | PASS | 文件存在；读 tenant 全部 Project → computeHealth → 逐项目写 OperationLog |
| 3 | 【D-C】`instrumentation.ts` 在 `NEXT_RUNTIME==='nodejs'` 时启动 | PASS | `src/instrumentation.ts:8` 显式 gate + 动态 import 防 edge/client 打包。构建产物核验：`.next/server/instrumentation.js` 与 `.next/standalone/.next/server/instrumentation.js` 均存在（366B wrapper，nodejs 分支已被构建期内联消解，加载 chunk `735.js` 内含 `ROUTINES_DISABLED`/scheduler）；`.next/standalone/node_modules/node-cron` 已随输出追踪带入（prod 容器可用） |
| 4 | `ROUTINES_DISABLED=true` 可关（默认开） | PASS | 探针 `scripts/test/f004-scheduler-probe.ts`（进程隔离两模式）：`disabled` → 打印「ROUTINES_DISABLED=true，例程调度未启动」且 `cron.getTasks().size=0`；`default` → 「例程调度已启动（health-scan @ 0 2 * * *）」且 size=1 |
| 5 | cron 常量默认 `'0 2 * * *'` | PASS | `HEALTH_SCAN_CRON = '0 2 * * *'`（scheduler.ts:17，导出常量非魔数）；探针输出 `"cron":"0 2 * * *"` |
| 6 | 新增 node-cron 依赖 | PASS | package.json dependencies `"node-cron": "^4.6.0"`（实装 4.6.0）。类型：v4 自带 `dist/node-cron.d.ts`，无需另装 @types（tsc 全绿佐证），见观察 O3 |
| 7 | health-scan：null 因子同页面/工具口径 | PASS | health-scan.ts:37-45 的 HealthInput 组装与 `[id]/page.tsx:42-51`、`today/page.tsx:318-327` 逐字段一致（targetExposure=goal?.targetExposure??null / actualExposure=null / budgetTotal Number 转换 / budgetSpent=null / period 由 goal 派生 / now 调用方注入 / blockerCount=0） |
| 8 | 每项目写 OperationLog{kind:'auto', actor:'strategy', projectId, summary 巡检文案, payloadJson:{score,band}} | PASS | 实跑后 DB 抽查 4 行：kind=auto、actor=strategy、projectId 全非空、summary 含「例程巡检…健康度…分」、payloadJson=`{"routine":"health-scan","score":N,"band":"cr"}`（score/band 在，routine 为超集字段合法）。分值 xg 26/lc 37/aw 23/mf 20 与 spec §4 预告逐字吻合（D2 全 cr 预期非缺陷） |
| 9 | 纯计算不调网关不涉闸门 | PASS | health-scan.ts 仅 import prisma/computeHealth/parseProjectGoal/HEALTH_LABEL；grep 无 fetch/gateway/PendingAction；实跑后 PendingAction 零新增 |
| 10 | 手动触发口 `npm run routine:health-scan` | PASS | script 存在（package.json:34）；实跑输出「✅ 扫描 4 项目，留痕 4 条（kind=auto）」；`run-health-scan.ts` 走 `runExclusive('health-scan', …)` 与 scheduler 同一执行体，非旁路实现 |
| 11 | 单测：例程逻辑 + 幂等重跑 + 互斥锁行为 | PASS | `tests/integration/health-scan-routine.test.ts` 3 例全过（spec §2 明示「tests/unit 或 integration」，取打真库的强形态）：留痕形状（scanned/logged=2、payload 形状、band 枚举、含 goal 缺失脏数据项目不抛错）；幂等重跑（append-only 两轮 ×2=4）；互斥锁（并发第二次 null、释放后可进）。**检测器活性证明**：`DATABASE_URL` 指向死端口重跑 → 1 failed / 3 skipped，证实测试真连库非 mock |
| 12 | 可见面闭环：跑一次后「Agent 今日完成」>0 且 feed 出现巡检行 | PASS | standalone 实测（改→验→恢复）：跑前 KPI=0 / feed 无巡检行 → `routine:health-scan` 后 KPI=4、feed 出现 4 条「例程巡检：…（策略 Agent · 刚刚）」→ 清理后 KPI 复归 0、巡检行零残留 |
| 13 | lint + tsc + test:unit 绿 | PASS | `next lint` 0 errors/0 warnings；`tsc --noEmit` exit 0（prisma generate 先行）；`vitest run` 139/139（12 文件） |

spec §5 F004 行三项（手动触发落 4 条 / 互斥锁与 ROUTINES_DISABLED 实证 / instrumentation 仅 nodejs 注册）分别对应上表 #8+#10、#1+#4、#3，均 PASS。

## 3. 实测记录（可复现步骤）

```bash
# 0. 基线（另有并行 evaluator 的 F006 夹具 pending 行短暂出现，与 F004 面无交集，其属主已自清）
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix \
  -c 'SELECT count(*) FROM "OperationLog"'          # → 0
curl -s http://127.0.0.1:3000/admin/today            # → Agent 今日完成 = 0

# 1. L1
npx prisma generate && npx tsc --noEmit && npm run lint && npm run test:unit   # 全绿 139/139

# 2. 检测器活性（证明集成测试真打库）
DATABASE_URL='postgresql://kol:wrong@localhost:59999/nope' \
  npx vitest run tests/integration/health-scan-routine.test.ts   # → 1 failed（预期）

# 3. 调度器行为探针（进程隔离两模式）
node --env-file=.env --import tsx scripts/test/f004-scheduler-probe.ts disabled  # → size=0
node --env-file=.env --import tsx scripts/test/f004-scheduler-probe.ts default   # → size=1，重复调用仍 1

# 4. 可见面闭环 + 恢复（D-H）
npm run routine:health-scan                          # → ✅ 扫描 4 项目，留痕 4 条
docker exec … -c 'SELECT kind,actor,summary,"payloadJson" FROM "OperationLog"'   # → 4 行核形状
curl -s http://127.0.0.1:3000/admin/today            # → KPI=4，feed 4 条巡检行
docker exec … -c "DELETE FROM \"OperationLog\" WHERE kind='auto' AND \"payloadJson\"->>'routine'='health-scan'"  # DELETE 4
curl -s http://127.0.0.1:3000/admin/today            # → KPI=0，零残留；DB oplog=0 复原
```

旁证：running standalone（PID 41879）启动于 02:32:01，晚于当日 02:00 cron 点，故基线 OperationLog=0 与调度器注册并存不矛盾；旧 :3120 进程（Jul 21 起）早于 F004 commit（02:03），无 scheduler。

## 4. 非阻断观察（不构成缺陷）

- **O1（外观）**：summary 模板 `例程巡检：《${row.name}》…` 与 canonical 项目名自带的《》嵌套，feed 呈现「《《星轨协议》· 全球公测预热》」双层书名号。模板系 spec §2 F004 原样规定（`'例程巡检：《X》健康度 cr(26)'`），嵌套源于数据内容，判 spec 相符；建议后续批次顺手改为直用 name。全仓无其他 `《${` 站点。
- **O2（验收侧自坑，已记入探针头注释）**：node-cron 4.x 双构建（ESM/CJS），探针首版用动态 `import('node-cron')` 拿到与 scheduler（tsx CJS 转译）不同的模块实例，`getTasks()` 读到空注册表——静态 import 同实例后复测正常。非产品问题；探针已固化说明防下个 fresh context 复踩。
- **O3（信息）**：spec §2 写「新增依赖 node-cron（+types）」；v4 自带类型声明，未装也无需 `@types/node-cron`，tsc 全绿即证。

## 5. 验收产物

- 本报告：`docs/test-reports/M1-C-LIST-TODAY-verify-F004.md`
- 探针脚本（可复用）：`scripts/test/f004-scheduler-probe.ts`
- 数据面已复原：OperationLog=0 / PendingAction=0 / 4 canonical 项目未动，未修改任何产品代码
