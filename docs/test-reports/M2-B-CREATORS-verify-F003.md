# M2-B-CREATORS F003 验收记录 — kol-sync 同步服务 + dataSource 归一 + 例程注册

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 验收）
- **日期：** 2026-07-23
- **对象 commit：** `858d00f`（feat(M2-B-CREATORS-F003)），验收基线 HEAD = `e95a7ff`
- **结论：PASS**（acceptance 全项 PASS；L2 真拉取已做最小实测，用量注明 §4）

---

## 1. 验收环境与前置

- 本地 dev DB（`.env DATABASE_URL`）；基线态实测：Kol 2526 = 2524 CSV（`user_upload`）
  + 2 视觉夹具（`vk-visual-full-0001`=crawl / `vk-visual-null-0002`=user_upload，embedding NULL ×2 属基线）；
  MatchPlan/PlanKol/MatchCandidate/PendingAction/OperationLog 全 0（D-H 清态）。
- L1 前置：`prisma generate` 先行；Node v25.7.0（仓内无 .nvmrc 约束）；无 :3000 dev server 操作（本 feature 无视觉面）。
- 未修改任何产品代码；验收探针脚本放会话 scratchpad（仓外），临时 DB 数据测毕清理（§5）。

## 2. Acceptance 逐项判定

| # | 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | `kol-sync/sync.ts` syncKols【P7】client/embed 双注入 | PASS | `src/lib/kol-sync/sync.ts:43-53` `SyncKolsDeps{list,embedBatch,now}`；集成测试双注入实跑 |
| 2 | discover 全量分页（【P2】不带 platform 过滤，上限常量导出） | PASS | `sync.ts:138-156` while 翻页；`SYNC_PAGE_SIZE=100`(:34) `SYNC_MAX_PAGES=300`(:37) 导出；listKols 仅传 page/pageSize（:151）；截断显式 `truncated`（no silent caps，集成用例 ✓ 300 页停） |
| 3 | 字段映射：categories←matchedTags / country←location / engagementRate 派生注明 YT/X view-proxy 语义 | PASS | `sync.ts:74-105` mapShallow；:77-79 语义注记（totalLikes 跨平台不一致 → YT/X view-based proxy）；:98 country←location |
| 4 | F002 三派生接入 | PASS | `sync.ts:174-179` deriveAudienceDemo/deriveCredibility/deriveFieldProvenance；派生 null → `Prisma.DbNull` 显式清空（:184-195） |
| 5 | upsert by (tenantId,canonicalHandle) | PASS | `sync.ts:199-207` `tenantId_canonicalHandle` 唯一键 upsert |
| 6 | 【P3】归一函数抽共享模块，seed/sync 两消费零漂移 | PASS | `src/lib/kol-sync/canonical-handle.ts`；`git show 858d00f` 比对：与 seed 原局部函数**逐字相同**（URL 清洗三 replace + lowercase + slug 回退）；全仓消费方恰为 seed + sync 两处 |
| 7 | 已存在行覆盖浅字段+写契约位+dataSource='crawl' | PASS | 集成用例「CSV 行覆盖合并」✓：displayName 旧→新、followers 1→200000、dataSource→crawl、interests=['fps'] parse* 读回 |
| 8 | CSV 独有行不动 | PASS | 集成用例 ✓：displayName/followers/dataSource/audienceDemo 全保持 |
| 9 | 新行 embedText 灌向量（IS NULL 幂等） | PASS | `sync.ts:212-235` IS NULL 补灌 + 批 100；集成断言测后 NULL=0、二跑 embedded=0；真 embed 链路 L2 最小实测 1024 维（§4） |
| 10 | `scripts/ops/normalize-datasource.ts` 幂等 + dry-run 默认 + stats 显式计数 + 端到端实跑（database-patterns §6/§7） | PASS | Evaluator 在 prod-shaped dev 库独立端到端实跑（§3）：dry-run 命中 1 改 0 → `--apply` 命中 1 改 1 → 二跑命中 0（幂等）；dev 库终态零 `csv-seed:*` 残留（2524 行已归一 user_upload）；seed 源头同修 `DATA_SOURCE='user_upload'`（re-seed 不回退）；'crawl'/'user_upload' 均在 provenance 六档内（`provenance.ts:20-27`） |
| 11 | scheduler ROUTINES 注册 kol-sync（cron `0 3 * * *`；不可达静默跳过 log warn 不炸） | PASS | `scheduler.ts:30,70-90`；集成断言三例程序 + cron 值；**运行时探针**：清空 APIFY_KOL_* 调 `ROUTINES` run() → 输出 warn + 返回 `{"skipped":true}`，未抛错 exit=0 |
| 12 | `scripts/jobs/run-kol-sync.ts` + package script（同执行体非旁路） | PASS | 脚本走 `health()`+`runExclusive('kol-sync', syncKols)` 与调度器同执行体；手动入口明示失败（exit 1）与例程静默跳过语义分明；`package.json:36` `routine:kol-sync` |
| 13 | 【P1】零投喂零充值 | PASS | client 仅封装 `/kol` `/health` 只读端点；全仓 grep `/admin/seeds` 零代码调用（仅 2 处注释声明边界）；L2 实测只读（§4），TikHub 零调用 |
| 14 | 集成测试 mock client+mock embed 打真库（幂等二跑/覆盖合并/新行+向量/归一/契约位 parse* 读回） | PASS | `tests/integration/kol-sync.test.ts` 7/7 ✓（verbose 逐用例输出在案 §3）；pid 隔离夹具租户，测后 afterAll 级联清理实证（仅剩 dev 租户） |
| 15 | lint + tsc + test:unit 绿 | PASS | `next lint` 0 errors 0 warnings；`tsc --noEmit` exit=0；`vitest run` **356/356（34 文件）全绿** |

## 3. 关键命令输出摘录

```
$ npm run test:unit
 Test Files  34 passed (34) / Tests  356 passed (356)

$ npx vitest run tests/integration/kol-sync.test.ts --reporter=verbose
 ✓ 注册表 > ROUTINES 含 kol-sync @ 0 3 * * *（三例程错峰）
 ✓ syncKols 首跑闭环 > 分页拉取 + 映射/派生落库 + crawl 归一 + embedding 补灌
 ✓ syncKols 首跑闭环 > CSV 行覆盖合并（同 canonicalHandle）：浅字段 + 契约位 + crawl
 ✓ syncKols 首跑闭环 > CSV 独有行不动（apify 无此 handle）
 ✓ 幂等二跑 > 行数不增、全 updated、embedding 不重复灌
 ✓ normalizeDataSource（【P4】存量归一） > dry-run 只报不改；apply 后 csv-seed:* → user_upload；crawl 不触碰；二跑命中 0
 ✓ 截断显式（no silent caps） > 上游 total 异常大时 truncated=true 且不失控循环
 Tests  7 passed (7)

# 【P4】ops 脚本端到端实跑（Evaluator 独立探针行，prod-shaped dev 库 2526 行在场）
$ npm run ops:normalize-datasource
[ops:normalize-datasource] DRY-RUN — 命中 csv-seed:* 1 行，改写 0 行
$ npm run ops:normalize-datasource -- --apply
[ops:normalize-datasource] APPLY — 命中 csv-seed:* 1 行，改写 1 行
$ npm run ops:normalize-datasource -- --apply     # 幂等二跑
[ops:normalize-datasource] APPLY — 命中 csv-seed:* 0 行，改写 0 行

# scheduler 静默跳过运行时探针（APIFY_KOL_* 清空）
[jobs] kol-sync：apify-kol 探活失败，本轮跳过（dev 内网不可达属预期）
[probe] run() 返回：{"skipped":true} ——未抛错 = 不炸进程 ✓  exit=0
```

## 4. L2 实测（用户授权口径：最小用量）

ssh 隧道可达（复用在场隧道 `ssh -N -L 3004:localhost:3004 deploysvr`，BUSINESS key
取自 deploysvr `/opt/apps/apify-kol-service/.env`，未落盘未入 git）：

```
[L2] health(): true
[L2] listKols page=1 pageSize=5 → total: 8837  rows: 5
  - tiktok/hiroaims · instagram/pericia_discreto · tiktok/falconsesportsgg(qualityScore=0.4326532)
    · tiktok/stresportsfn · tiktok/paydarow —— 5/5 行 zod 行契约 safeParse 通过
```

- **total=8837** 与 spec §1.1「存量 8800+」相符；真 client（`src/lib/apify/client.ts`）
  + 真 zod 契约对真服务实测通过。
- **用量注明：** apify-kol 读 1×/health + 1 页 ×5 行（我方服务 DB 读，零上游花费）；
  网关 embedding 真灌最小实测 1 value（~7 token，bge-m3 返回 1024 维 = 库列同维）；
  **TikHub 零调用、/admin/seeds 零触碰（P1 铁律遵守）**。
- **注明降级面：** 全量真同步（8837 行拉取 + ~6000 新行 embedding 真灌 <1M token）
  **未执行**——属生产首跑（deploy 人工闸门后），超出本次最小用量授权；其正确性由
  mock 集成测试（分页/幂等/向量/截断）+ 真样本契约 pin（F001 fixture）+ 本节最小真拉取联合覆盖。

## 5. 测毕清理（D-H）

- Evaluator 探针行（`evaluator-f003-temp:normalize-probe`）已删；集成测试夹具租户
  afterAll 级联清理实证（终态仅 `dev` 租户）。
- 终态复核：Kol 2526（user_upload 2525 + crawl 1，embedding NULL=2 = 两视觉夹具）
  与基线态完全一致；Match 三表/PendingAction/OperationLog 全 0。

## 6. 观察项（非缺陷，不阻断）

- **OBS-F003-1：** ops 脚本首次调用（与另一 DB 客户端并行时）出现过一次 Node 错误尾注，
  三次复跑（含 1 次刻意并发复现）全部 exit=0 无法复现——判本机 shell 瞬态，非产品缺陷；留痕备查。
- **OBS-F003-2：** `canonical-handle.ts:8-10` 诚实登记的已知边界（同一创作者不同 URL 形态
  归一出不同 handle → 可能各存一行；身份消解归后续批次）——spec 未列本批范围，符合登记口径。
- 验收期间 deploysvr 隧道（PID 26538，先于本会话在场）未由本验收关闭，留给编排者处置。
