# M2-B-CREATORS F001 复验记录 — apify-kol client + zod 契约（真样本 pin）+ env

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23（reverifying，fix_rounds=1）
- **结论：** **PASS**（首轮 PARTIAL 指向面三点全部消失，无新回归；含首轮次要注记一并闭合）
- **复验对象：** commit `7cebb52`（fix）相对首轮验收基线 `544e625`
- **依据：** 首轮报告 `M2-B-CREATORS-verify-F001.md` §3 指向面 + features.json F001 acceptance + spec §2 F001；评估基于实物（代码 + 测试运行输出 + L2 真服务 DB 实测），未采信任何实现叙述。

---

## 1. L1 环境前置

- `npx prisma generate` 先行（testing-env-patterns §15）→ tsc 干净环境。
- 端口纪律：:3000 全程未触碰（READINESS 专用）；本 feature 无 dev server 需求。
- 产品 dev DB 零读写（F001 验收不涉；D-H 基线态不受影响）。

## 2. 首轮 PARTIAL 指向面逐点复验（audit-methodology §5：逐字复现首轮取证路径）

| # | 首轮指向 | 复验结果 | 证据 |
|---|---|---|---|
| 1 | fixture 缺 X 平台样本（实物三平台 6 行） | **已消失** | `tests/fixtures/apify-kol-samples.json` 现 8 行四平台；X 2 行 = `id=71723 Korianax87` + `id=45107 HBST_DigiNeko`。真实性三重实证见 §3 |
| 2 | fixture note 文实不符（声称与实物不一致） | **已消失** | note 现为「四平台：YT/IG/TT 2026-07-23 首轮 + X 2 行 fix_round 1 补齐」——据实表述含修复轮次溯源 |
| 3 | 测试标题「四平台」超陈述（无断言背书） | **已消失** | `apify-client.test.ts:46-50`：行数 `>=8` + 平台集合硬断言 `[...new Set(platforms)].sort() === ['instagram','tiktok','x','youtube']`。**断言活性证明**：对 fixture 模拟去除 X 行后同一逻辑判红（缺任一平台即红，回归 pin 成立） |
| 4 | （次要注记）x-api-key header 声称断言而未断言 | **已闭合** | `apify-client.test.ts:98-110`：capturingFetch 经 `new Headers(init?.headers).get('x-api-key')` 捕获**产品 client 本体**（`client.ts:79-81` 的 `init.headers` 传参路径），断言 `=== 'test-key'`（env 注入值）——真经 header，非 URL 平替 |

## 3. X 样本真实性实证（「真样本 pin」acceptance 核心）

1. **首轮 L2 记录交叉**：`id=45107/x/HBST_DigiNeko` 三元组与首轮全量扫描独立记录完全一致。
2. **snowflake 自洽**（零成本本地核验）：两行 X 的 platformUserId 内嵌时间戳与 joinedDate 秒级自洽（Korianax87 Δ=0.8s；HBST_DigiNeko Δ=11.9s）——伪造样本几乎不可能做到 ID↔注册时间自洽。
3. **L2 DB 直查逐字段比对**（授权内，最小用量）：真服务 `apify_kol.kols` 表 `WHERE platform='x'` **恰好 2 行**，与 fixture 在 id/username/displayName/platformUserId/followers/following/postsCount/location/joinedDate/verified 十字段**逐字段一致**。存量 X 行 2/2 全部 pin 入——CI 可重复的 X 形状回归保护缺口闭合。

**脱敏同规核验**：全 8 行联系方式族（emails/phones/telegrams/discords）仅 redacted 占位或空数组 + `raw={"_sanitized":true}`；DB 实测两行 X 联系方式族本为空（无可脱敏项，fixture 空数组=真值），raw 真值存在（1627/1312 字节）已按同规剥离。形状保持，规则与首轮 YT/IG/TT 行一致。

**附带发现（非缺陷）**：`GET /kol/:platform/:userId` 详情端点对 platform=x 同样 HTTP 500（`invalid_enum_value: Expected 'instagram'|'tiktok'|'youtube'`）——与首轮列表过滤 500 同源，**再实证 P2 绕行设计**（listKols 不带 platform 过滤）的必要性覆盖详情面。

## 4. 无新回归核验（audit-methodology §6）

- **修复未越界**：`git show 7cebb52 --stat` 中 F001 指向面仅动 `tests/fixtures/apify-kol-samples.json` + `tests/unit/apify-client.test.ts`；`src/lib/apify/*` 零触碰（产品代码零变更）。
- **套件**：`vitest run` **358/358 passed（34 文件）**（首轮 356 → +2）；`apify-client.test.ts` 10/10；`tsc --noEmit` exit 0；`next lint` 0 errors 0 warnings。
- **消费方排查**：fixture 全仓运行时消费者仅 `apify-client.test.ts`（`schemas.ts` 为注释引用）——行数 6→8 无隐藏消费者受影响。
- 首轮 PASS 面（错误分类/分页/health/passthrough/信封/env 占位/P7 注入）断言原样在场未削弱。

## 5. L2 用量申报与清理

- 隧道 `ssh -f -N -L 3004:localhost:3004 deploysvr`：HTTP 只读 ×3（health + 详情探针 ×2，后者 500 于枚举缺口）；ssh 只读：key 读取 ×1 + `docker ps` ×1 + psql 只读 SELECT ×6（含定位库表）。**零写入 / 零上游花费 / TikHub 零调用 / /admin/seeds 零触碰 / embedding 零灌注**（P1 遵守）。
- 隧道用毕即拆（:3004 已释放）；探针文件已从 scratchpad 删除；BUSINESS key 仅存 shell 变量未落盘。

## 6. 判定

F001 acceptance 全项成立（首轮 8/9 PASS 面无回归 + 第 6 项「四平台 fixture pin」由 PARTIAL 转 PASS）。**PASS**。
