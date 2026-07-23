# M2-B-CREATORS F002 复验记录 — 深字段派生纯函数 + kol-deep zod 契约

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **阶段：** reverifying（fix_rounds=1）
- **首轮结论：** PARTIAL（`docs/test-reports/M2-B-CREATORS-verify-F002.md`）
- **本轮结论：PASS**（首轮指向面全部消失，无新回归）
- **验收依据：** 实物（`src/lib/kol-sync/derive.ts` 修复后逐行 + fix commit 7cebb52 diff 触及面核对 + `tests/unit/kol-deep.test.ts` / `tests/integration/kol-sync.test.ts` 实跑 + 复验探针 12 例实跑 + dev DB 清态实测），不采信 commit message / session_notes 叙述。

---

## 首轮 PARTIAL 指向面逐点复验

### 指向 1：deriveCredibility 缺 followers 因子 — **已消失 ✓**

- **实装取证：** `derive.ts:132-140`——`typeof row.followers === 'number' && row.followers >= 0` 守卫入场，log10 归一 `Math.min(1, Math.log10(row.followers + 1) / FOLLOWERS_LOG_CAP)`（`FOLLOWERS_LOG_CAP=7` 导出常量 `:83`，10^7 封顶），权重 `CREDIBILITY_WEIGHTS.followers=0.1`（`:77`，注释明记「规模是弱可信信号非主导」），signal 人话依据 `粉丝规模 9,240,000`（toLocaleString）。
- **复现锚逐字重放（首轮 probe-4）：** `deriveCredibility(row({followers: 9_240_000}), AT)` → **非 null**，score = round(log10(9,240,001)/7 × 100)（单因子重归一直通），signals=`['粉丝规模 9,240,000']`，method='rule-derived-from-crawl'——复验探针 RP-1 实跑 ✓（首轮同案例为 null 即偏离实证）。
- **回归 pin 入正式套件：** `tests/unit/kol-deep.test.ts:146-154`「fix_round 1 回归 pin：followers-only 行派生非 null（首轮验收探针案例）」——防线永久化。

### 指向 2：P8 hasBusinessEmail 信号未实装 — **已消失 ✓**

- **实装取证：** `derive.ts:141-147`——`typeof row.hasBusinessEmail === 'boolean'` 入场，权重 `businessEmail=0.05`（`:79`，注释明记「P8：仅作派生输入不落列」），true/false 双向 signal（`商务邮箱信号 ✓/✗`，false 计 0 但依据仍在——诚实）。上游契约 `src/lib/apify/schemas.ts:34` `hasBusinessEmail: z.boolean().nullish()` 在场（P8 明细不落列语义保持：仅布尔信号，无 emails/phones 明细）。
- **探针 RP-2：** hasBusinessEmail-only(true) → score=100 非 null；(false) → score=0 非 null，signal 在场——双向 ✓。
- **单测覆盖：** `kol-deep.test.ts:156-176` 五因子齐备案例（0.3+0.24+0.25+0.1+0.05=0.94→94 精确断言）+ false 分支 signal 断言。

### 指向 3：文件头注释与实现自相矛盾 / 无偏离说明 — **已消解 ✓**

- `derive.ts:10` 头注释已改为「credibility ← 弱信号规则合成（verified/qualityScore/tier/followers/hasBusinessEmail 五因子）」——与实现 `:107-147` 五因子一致，自相矛盾消除。
- `:66-67` docstring 明记 fix_round 1 修复来由（首轮 F002 PARTIAL → 补 followers + hasBusinessEmail 五因子重归一）——偏离处置有迹可循，走的是首轮建议的修复路径 1（补实装）而非路径 2（spec 收窄），acceptance/spec:98 四因子 + P8 hasBusinessEmail = 五因子全集，与实物吻合。

### 权重重归一（和=1）— **✓**

`CREDIBILITY_WEIGHTS = {verified:0.3, quality:0.3, tier:0.25, followers:0.1, businessEmail:0.05}`，和精确=1；单测 `:134-144` 键集断言（五键 sort 相等）+ toBeCloseTo(1,10) 双守门；探针 RP-3 独立复算 ✓。

---

## 无新回归核验

| 面 | 取证 | 结果 |
|---|---|---|
| 既有三因子行为保持 | verified+quality(0.8)+tier hot →（0.3+0.24+0.25)/0.85=0.9294→**93**，与首轮期望值一致（RP-4 + 单测 :178-193） | ✓ |
| 缺席重归一化语义保持 | quality 缺席 (0.3+0.25)/0.55=1→100（单测 :195-200）；YT null 不冤枉计 0 | ✓ |
| 全缺→null 不编造 | `deriveCredibility(row(), AT)` → null（RP-4 + 单测 :202-206） | ✓ |
| refine 防线未松动 | `assertCredibility` signals `['   ']` 仍抛错（RP-6） | ✓ |
| 溯源互操作 | 五因子派生产物逐条过 `fieldProvenanceEntrySchema`，source='crawl'（RP-6，首轮 probe-3 重放） | ✓ |
| followers 边界 | =0 因子在场 value 0 非 null / 10^9 钳 1→100 / 负数守卫不入场（RP-5） | ✓ |
| 满值不溢出 | 五因子全满 → 100 钳制在场（RP-4） | ✓ |
| kol-sync 集成随更新 | `kol-sync.test.ts:175-176` r2 followers-only 现应派生（derivedCredibility=3）+ `:203-218` r2 credibility 落库读回断言——真库实跑 23/23 绿 | ✓ |
| 修复触及面 | fix commit 7cebb52 F002 相关仅 `derive.ts` + 两测试文件（其余属 F001/F004/F006 修复面），无越界产品代码改动 | ✓ |
| L1 全量 | `prisma generate` → `tsc --noEmit` exit 0 → lint「✔ No ESLint warnings or errors」→ `test:unit` **358/358 passed（34 files，含 integration 打真库非跳过）** | ✓ |

## 复验探针（独立取证，测毕已删除 D-H）

临时文件 `tests/unit/kol-deep.evaluator-f002-reverify-probe.test.ts`，**12/12 全过**后删除：RP-1 首轮 probe-4 逐字复现 / RP-2 hasBusinessEmail 双向 / RP-3 权重和 / RP-4 三因子无回归 ×3 / RP-5 followers 边界 ×3 / RP-6 契约+溯源互操作 ×2。

## D-H 清态核查（复验收尾）

dev DB 实测（docker exec psql）：Kol=2526（2524 CSV + 2 视觉夹具，基线态保持）；Tenant=1（集成测试夹具租户自清理成功）；MatchPlan/MatchCandidate/PendingAction/OperationLog 全 0；dataSource 分布 crawl=1 / user_upload=2525 与首轮基线完全吻合。本复验零 DB 残留、零产品代码修改、未起 :3000。

## L2 边界

同首轮：纯函数 + zod 契约，零 L2 项——未动用 apify-kol 隧道 / embedding / TikHub（P1 零调用零投喂铁律零触碰）。

## 观察项（soft-watch，不阻断，建议下批顺手清理）

- **OBS-A（文本枚举陈旧）：** `derive.ts:195` fieldProvenance.credibility.detail 仍为「由采集弱信号规则合成（verified/互动质量/热度分层）」——只列三因子未随五因子更新。acceptance 条 9 判据「detail 明示派生非实测」仍满足（所列因子无一错误，仅列举不全），不构成行为回归；建议补全为五因子枚举（1 行 edit）。
- **OBS-B（测试注释陈旧）：** `tests/unit/kol-deep.test.ts:184`「0.35*1 + 0.35*0.8 + 0.3*1 = 0.93」/ `:197`「(0.35*1 + 0.3*1) / 0.65」仍引旧三因子权重数学式——断言值在新权重重归一下恰好不变（93/100），断言正确，纯注释瑕疵。

## 结论

**PASS。** 首轮三条指向面（followers 因子缺失 / P8 hasBusinessEmail 未实装 / 头注释自相矛盾无偏离说明）全部消失；权重重归一和=1 有双守门；回归 pin 已永久化入正式套件；三因子既有行为、refine 防线、溯源互操作、集成落库全无回归；L1 全绿。两条 soft-watch 均为注释/文本枚举级，不阻断。
