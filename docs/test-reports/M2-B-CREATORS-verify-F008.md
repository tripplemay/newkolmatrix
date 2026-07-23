# M2-B-CREATORS F008 验收记录 — 部署面 + 文档翻牌

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 单 feature）
- **日期：** 2026-07-23
- **对象 commit：** `e95a7ff` feat(M2-B-CREATORS-F008)（diff 仅含 docker-compose.prod.yml / architecture.md / deploy.md / features.json / progress.json——零产品 src 代码，与 acceptance 范围一致）
- **结论：F008 = PASS**（逐项判定见下；附 1 条跨 feature 发现，归属 F006 测试产物，非 F008 缺陷）

---

## 1. 逐条 acceptance 判定

### 1.1 docker-compose.prod.yml：kol-shared external 网络 + APIFY env — PASS

| 检查点 | 证据 |
|---|---|
| app 服务挂 `kol-shared` | `docker-compose.prod.yml:65-68`（networks: default + kol-shared）；`:91-94` `kol-shared: external: true` |
| `APIFY_KOL_BASE_URL=http://apify-kol:3003` | `:60` 默认值插值；`docker compose config` 解析输出 `APIFY_KOL_BASE_URL: http://apify-kol:3003` 实证 |
| `APIFY_KOL_API_KEY` env | `:61` `:?` 必填插值，注释明示「取自 /opt/apps/apify-kol-service/.env 的 BUSINESS_API_KEY，人工放 .env 不入 git」 |
| compose 语法合法 | `docker compose -f docker-compose.prod.yml config --quiet` → `COMPOSE CONFIG OK`（dummy env 注入验证） |
| 密钥不入 git | compose 仅变量插值，无明文 key；grep 无硬编码 |

### 1.2 deploy 前置人工步 ×2 明记（v1.0.10 §8）+ deploy.md 同步 — PASS

`docs/dev/deploy.md:78-85`（e95a7ff 引入）：
1. **步 1**：`scp docker-compose.prod.yml deploysvr:/opt/apps/newkolmatrix/`，并明示不同步的后果（`APIFY_KOL_API_KEY 必填` 插值报错 app 起不来）——compose 人工副本坑（v1.0.10）硬化到位；
2. **步 2**：VPS `.env` 追加 `APIFY_KOL_API_KEY=<BUSINESS key>`（取自 `/opt/apps/apify-kol-service/.env` 的 `BUSINESS_API_KEY`，只读 /kol* 权限，不入 git）；
3. 附加：`APIFY_KOL_BASE_URL` 不必设（compose 默认值）+ 前提核查 `docker network ls | grep kol-shared`。

**[L2] 部署实操属人类闸门（deploy-prod workflow_dispatch），不在本验收执行——acceptance 只要求「明记」，已满足。**

### 1.3 architecture.md 六处翻牌 + 新鲜度复核 — PASS

每处翻牌均 grep 实物交叉验证（防「文档说已实装但实物不在」的反向漂移）：

| 翻牌 | 文档落点 | 实物交叉验证 |
|---|---|---|
| §7.2.2 契约位 as-built 四列表（zod 已建+派生填充+refine 兑现 ✅） | architecture.md:826 起 | `src/lib/data/schemas/kol-deep.ts`：signals/flags `.min(1)`（:55,:82）+ `.refine` 拒全空串（:59,:85）；`derive.ts:67` `CREDIBILITY_WEIGHTS` 导出、`:83` `CREDIBILITY_METHOD='rule-derived-from-crawl'` |
| §7.5 溯源接真 + dataSource 归一注记 | architecture.md:854 起 | `scripts/ops/normalize-datasource.ts` 在场；seed 源头同修 `scripts/seed/import-kol-csv.ts:28` `DATA_SOURCE='user_upload'`；**dev DB 实测**：`user_upload 2525 + crawl 1 = 2526`，`csv-seed:*` 零残留 |
| §5.3 ⑧ verdict 写入口 as-built + K3 注记 | architecture.md:479 节内 | `src/app/api/match/candidates/[id]/verdict/route.ts`（zod enum kept/dropped、404、changed 幂等语义、注释明记 internal 零 PendingAction）+ 双钮实物 `src/components/envs/match/index.tsx`（grep「剔除」命中） |
| §8.10 kol-sync 例程行 | architecture.md:1182（§8.10 = :1161 起，节号正确） | `src/lib/jobs/scheduler.ts:30` `KOL_SYNC_CRON='0 3 * * *'`、`:70` ROUTINES 含 kol-sync、`:77` 探活失败静默跳过 warn |
| §10.1.1 路由清单补五端点 + apify-kol 外部集成段 | architecture.md:1401 起 | 实际 route.ts 清点 = 11 端点，与表格全量对上（materials ×2 / approve / refresh / verdict / nav-badges 五行新增无遗漏）；集成段四要点核实：`client.ts:80` x-api-key、`:10-11,114` P2 不带 platform 过滤、零投喂 grep `/admin/seeds` 仅命中禁止性注释（sync.ts:8 / client.ts:8）、异步两步与 ssh 隧道 L2 口径与 spec §1.1/§4 一致 |
| §14 M2-B 行 ✅ | architecture.md M2-B（CREATORS）行 | 与批次实况一致（8/8 completed；范围描述与 features.json 对齐；budgetUsd→M3 / 三键+brandSafety 真源→M5 移交注记在） |

**新鲜度复核（role-context/evaluator.md 文档新鲜度 clause）：** §7.2.2 残留「未实装」声明（`Kol.relationshipStatus` / `ProjectKol.status`）grep `prisma/schema.prisma` + `src/` = 零命中，确实未实装——无反向漂移。`agent-architecture.md` 不涉（spec 明记无新工具），符合。

### 1.4 lint + tsc + test:unit — PASS（附跨 feature 发现，见 §2）

| 门 | 结果 |
|---|---|
| `npm run lint` | ✔ No ESLint warnings or errors（0/0） |
| `npx tsc --noEmit`（prisma generate 先行） | exit 0 |
| `npm run test:unit` | 复跑 **34 files / 356 tests 全绿**；首跑 355/356（1 失败为 F006 测试文件超时抖动，非 F008 引入——根因见 §2） |

F008 diff 本身零 src 代码（compose + markdown + 状态文件），不可能影响测试行为——抖动归属判定有 commit 溯源硬证据（`git log --follow` 该测试文件仅 8fd275f F006 一个 commit）。

---

## 2. 跨 feature 发现（归属 F006 测试产物，供 F006 判定/批次汇总）

**`tests/integration/match-verdict.test.ts` 存在真实抖动（非并发干扰）：** 隔离复跑 9 次约半数失败，失败形态恒为首个 it() **5000ms 默认 testTimeout 超时**（`:75`），非断言失败。

**根因链（实物核到行）：**
1. beforeAll 只跑 `generateCandidates(projectId, { embed: mockEmbed })`，**未建 MatchPlan**；
2. 首个 it() 调 `loadMatchSurfaceData(projectId,'match')` → `surface-data.ts:47-51` lazy 路径命中（plansCount=0）→ `generateCandidates(projectId)` **无注入 deps** → `generate-candidates.ts:119` 回落真 `embedText`（lib/ai/gateway）→ **打真网关**，延迟方差致偶发 >5s 超时；
3. 同类问题 Generator 已在 F007 测试中修过（session_notes：「F007 修一次测试自身 lazy 误触——建组防触发」），但 F006 的 match-verdict.test.ts 未同修。

**影响：** (a) L1 套件非确定性红（CI 无凭据时 lazy 走 catch 降级不炸，本地有 .env 真 key 时打真网关）；(b) L1 单测泄漏真网关调用（微量 embedding 花费 + 非确定性）。**修复方向（供 Generator）：** beforeAll 补 `buildMatchPlans` 建组防触发（F007 先例），或注入 deps / 提高该测试 timeout。

本发现不改判 F008（终态判据：全套件确定性绿可由 F006 侧一行修复达成；F008 交付物与此无因果）。

---

## 3. 环境与产物纪律记录

- 未起任何 dev/standalone server（:3000 未触碰）；未跑视觉测试（归 READINESSS）；
- 未修改任何产品代码/测试代码；本报告为唯一新增产物；
- L2（apify-kol 真拉取 / embedding 真灌）F008 acceptance 不涉，未执行；TikHub 零调用（P1）；
- D-H 测毕清态实测：夹具租户（`test-tenant-*`）零残留；MatchPlan/PlanKol/MatchCandidate/PendingAction/OperationLog 全 0；Kol 2526 = 2524 基线 + 2 视觉夹具（VK-FULL/VK-NULL，基线态**不清**，符合边界）。
