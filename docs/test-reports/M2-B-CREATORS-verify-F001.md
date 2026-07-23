# M2-B-CREATORS F001 首轮验收记录 — apify-kol client + zod 契约（真样本 pin）+ env

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **结论：** **PARTIAL**（功能面全通过；acceptance 中「四平台 fixture pin」一项实物为三平台，详见 §3）
- **验收对象：** commit `544e625`（`src/lib/apify/client.ts` / `src/lib/apify/schemas.ts` / `tests/unit/apify-client.test.ts` / `tests/fixtures/apify-kol-samples.json` / `.env.example`）
- **依据：** features.json F001 acceptance + spec §2 F001 / §4 / §5；评估基于实物（代码 + 测试运行输出 + L2 真服务实测），未采信任何实现叙述。

---

## 1. L1 环境前置

- `npx prisma generate` 先行（testing-env-patterns §3）→ tsc 干净环境。
- 项目无 `.nvmrc`；本机 Node v25.7.0，本 feature 无 jsdom/localStorage 面，不构成误报源。
- 未起任何 dev/standalone server（端口纪律：:3000 归 READINESS 专用，全程未触碰）。
- 未触碰 DB（本 feature 验收零 DB 读写；D-H 基线态不受影响，无需清理）。

## 2. 逐条 acceptance 判定

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | `client.ts` x-api-key fetch 封装 + `APIFY_KOL_BASE_URL`/`APIFY_KOL_API_KEY` requireEnv | PASS | `client.ts:20-28`（requireEnv 空值抛错）、`:74-80`（双 env + `x-api-key` header）。L2 实测错 key → 服务端 401 → `kind=auth`（key 真实被消费，见 §4 [2]） |
| 2 | `listKols` 分页 +【P2】不带 platform 过滤 | PASS | `client.ts:117-134`；单测断言 URL `=/kol?page=3&pageSize=50` 且 `not.toContain('platform=')`。L2 实证 `GET /kol?platform=x` → HTTP 500（枚举缺口真实存在，绕行合理） |
| 3 | `health()` | PASS | `client.ts:137-145`（ok→true；不可达→false 不抛错）；单测双态覆盖；L2 真服务 `health() → true` |
| 4 | 错误分类：401/403 终态 auth、429 尊重 Retry-After、5xx/超时可重试 | PASS | `client.ts:90-109`（auth / rate_limit+retryAfterSec / retryable 三类 + 契约漂移 contract 第四类）；单测 4 用例逐类覆盖（401/403、429+`retry-after:7`→`retryAfterSec=7`、502、网络异常）；超时走 `AbortSignal.timeout` 落同一 retryable 分支 |
| 5 | `schemas.ts` zod passthrough 宽容 + 真样本 pin（YT qualityScore null / IG businessCategory 空串 / following null / matchedTags 空数组 / 信封 `{data,page,pageSize,total}`） | PASS | `schemas.ts:13-57`（消费子集具名 + `.passthrough()` ×2）；单测逐项 pin 四种 nullable 形态 + passthrough 未知字段携带 + 信封缺键拒收；**L2 全量复验：真服务 8837 行逐行过 `apifyKolRowSchema`，0 失败**（含 2 行 X 平台） |
| 6 | 单测 pin **四平台**脱敏 fixture（去联系方式明细保形状） | **PARTIAL** | fixture 实物 = **三平台 6 行**（youtube×2 / instagram×2 / tiktok×2），**无 X 行**——与 acceptance「四平台」及 commit 544e625 message「四平台 6 行真样本」不符（后者对实物的描述失实）。脱敏合规：emails/discords 置 redacted、raw 置 `{"_sanitized":true}`，形状保持。L2 实测证明 X 行**存在**（存量 2 行，`id=45107 HBST_DigiNeko` 等）且当前 schema 可通过——功能风险已闭，但 CI 可重复的 X 形状回归 pin 缺位 |
| 7 | `.env.example` 补两条占位 | PASS | `.env.example:47-48`（`APIFY_KOL_BASE_URL` / `APIFY_KOL_API_KEY` 占位）+ `:49` 超时 + `:45` ssh 隧道 L2 说明；密钥未入 git |
| 8 | 【P7】client 注入可替换；真服务属 L2 | PASS | `ApifyKolClientDeps.fetch` 注入点（`client.ts:60-62`）；单测全程 fakeFetch 零真发；L2 已在授权内实测（§4） |
| 9 | lint + tsc + test:unit 绿 | PASS | `tsc --noEmit` exit 0；`next lint` 0 errors 0 warnings；`vitest run` **356/356 passed（34 文件）**，其中 `apify-client.test.ts` 10/10 |

## 3. PARTIAL 详情（唯一问题）

**问题：** acceptance 明文「单测 pin 四平台脱敏 fixture」，`tests/fixtures/apify-kol-samples.json` 实物只含 youtube/instagram/tiktok 三平台（6 行），X 平台真样本未 pin；commit 544e625 message 声称「四平台 6 行真样本」与实物不符。测试标题「四平台真样本逐行过 row schema」同样超陈述。

**追溯（按「计数不符先逐站点追溯」规约）：** X 平台不可经 `GET /kol?platform=x` 过滤获取（L2 实证 HTTP 500，上游枚举缺口），且 X 行在存量中仅 2/8837（0.02%）——获取需全量翻页定位，成因可解释；但 spec 头部「真样本 4 平台 9 行 pin」表明勘查期声称已获 4 平台样本，fixture 未兑现，acceptance 也未据实修订。

**风险评估（低）：** schema 不锁 platform 枚举、全字段 nullish + passthrough；L2 全量扫描证实现存 2 行 X 全部通过契约——**当前**无功能缺陷。残余风险 = 未来 schema 收紧若破坏 X 形状，CI 无 fixture 可拦截（pin 的回归保护对 X 缺位）。

**修复建议（≈10 分钟）：** 从真服务取 1-2 行 X 样本（已定位 `id=45107` platform=x username=HBST_DigiNeko；隧道 `ssh -L 3004:localhost:3004 deploysvr` 全量翻页可复取），按同规脱敏后补入 fixture `rows`，fixture note 与测试标题据实对齐（或若裁决维持三平台，则修订 acceptance/commit 表述据实——二选一，不得保持文实不符）。

**次要注记（不计入判定）：** 单测标题「x-api-key 经 headers」但断言仅覆盖 URL 未断言 header——L2 错 key 实测已闭合该验证面；建议顺手补 header 断言。

## 4. L2 真服务实测记录（授权内，最小用量）

前置：`ssh -f -N -L 3004:localhost:3004 deploysvr` + `APIFY_KOL_BASE_URL=http://localhost:3004` + BUSINESS key（取自 deploysvr `/opt/apps/apify-kol-service/.env` 的 `BUSINESS_API_KEY`，用毕即从本机临时目录删除，不入 git）。探针脚本消费**产品 client 本体**（`lib/apify/client` + `lib/apify/schemas`，非平行实现）。

```
[1] health() → true
[2] 错 key → ApifyKolError kind=auth（期望 auth）
[3] listKols(p1,100) → data=100 page=1 pageSize=100 total=8837
[4] 扫描 8837 行 / 89 页；zod parse 失败 0 行
    平台分布: {"tiktok":4097,"instagram":600,"youtube":4138,"x":2}
    X 平台样本: {"id":"45107","platform":"x","username":"HBST_DigiNeko"}
[5] GET /kol?platform=x → HTTP 500（P2 枚举缺口实证：不可过滤，绕行合理）
[usage] 本探针共发 93 个只读 HTTP 请求（含 platform=x 试探；零上游花费/零投喂/零写入）
```

用量申报：93 个只读 GET（我方 apify-kol 服务 DB 查询，**零上游花费**）；TikHub 零调用；`/admin/seeds` 零触碰（P1 铁律遵守）；embedding 零灌注（F001 不涉）；隧道用毕即拆。

## 5. 产物与清理

- 新增：本报告（docs/test-reports/）。产品代码零修改；DB 零写入；:3000 全程未占用。
- 探针脚本与密钥文件均在会话 scratchpad（临时目录），密钥已删除。
