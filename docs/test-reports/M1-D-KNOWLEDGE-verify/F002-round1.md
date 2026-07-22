# M1-D-KNOWLEDGE F002 首轮验收证据（round 1）

- **Feature:** F002 存储通道 + 上传 API（本地盘卷，U2）
- **判定：PASS**
- **Evaluator:** Andy/evaluator-subagent（隔离 fresh context）
- **日期:** 2026-07-22 · **HEAD:** ecde6cd · **Feature commit:** ba13696
- **L2 用量:** 0（F002 为上传/列表 API，纯本地 IO + DB，不涉网关调用；真网关授权未动用）
- **裁决口径：** 小图处置按 `docs/specs/M1-D-KNOWLEDGE-f002-smallimage-adjudication.md` 方案 A——最短边 ≤10px = **HTTP 400 拒收，不落盘不落库**（spec §2 行内括注作废）。本次验收全程按此口径执行。

## 1. 测了什么 / 怎么测

| # | 验证面 | 手段 |
|---|---|---|
| 1 | 存储通道代码审读 | 读 `src/lib/knowledge/storage.ts` / `upload.ts` / `rate-limit.ts` / `dto.ts` / `src/app/api/materials/route.ts` 全文，对照 acceptance 逐项 |
| 2 | dev 默认目录 + gitignore + prod 卷对位 | `storage.ts:19`（`?? '.materials'`）· `.gitignore:42`（`.materials/`）· `docker-compose.prod.yml:55/60/80`（`MATERIALS_DIR=/app/materials` + `newkolmatrix-materials:/app/materials` 卷）· `.env.example:36` |
| 3 | Generator 测试活性复跑 | `npx vitest run tests/unit/knowledge-upload.test.ts tests/integration/materials-upload.test.ts --reporter=verbose`（集成测打真库 + 真磁盘临时目录） |
| 4 | Evaluator 独立对抗实测（19 案例，非 Generator 用例） | 自写脚本（scratchpad，进程内直调 POST/GET，真库 + 临时 MATERIALS_DIR）：恶意文件名穿越经完整上传链路 / 小图裁决精确边界 10px↔11px / route 层真实限流 11 连发 / DTO 泄露 / csv 白名单 |
| 5 | L1 门（环境前置：`npx prisma generate` 先行，testing-env-patterns §3） | `npx tsc --noEmit` · `npm run lint` · `npm run test:unit` |
| 6 | 铁律 10 归属 + 同 commit | `git show --stat ba13696` |
| 7 | D-H 基线复原 | 开跑前/测毕 psql 计数比对（Game/Material/GameKnowledge） |

## 2. 关键输出摘录

**L1 门：**
```
npx prisma generate     → 完成（先于 tsc）
npx tsc --noEmit        → exit 0
npm run lint            → ✔ No ESLint warnings or errors（0 warn 0 err，§15 矩阵无需 soft-watch）
npm run test:unit       → Test Files 20 passed (20) · Tests 224 passed (224)
```

**Generator 测试复跑（verbose）：** `knowledge-upload.test.ts` 13/13 + `materials-upload.test.ts` 8/8 = **21/21 全绿**。覆盖：sanitize 白名单化（`../../etc/passwd`→`passwd`、CJK 保留）/ resolveMaterialPath 越根抛错 / 非 cuid gameId 抛错 / 落盘往返 storageRef=`{gameId}/{cuid}-{safeName}` / 白名单外 400 / 20MB+1→413 / 小图 ≤10px→400（8×100 拒、32×32 放行）/ 坏图 400 / 视频族 parseable=false / 限流三案例（第 11 次拒+Retry-After、tenant 隔离、escape env）/ 集成：txt→201 pending 落盘落库实证、穿越形状 gameId→404、413 不落库、8×8→400 文案含 10px 不落库、mp4→201 failed+parseError、非法 type→400、GET 列表含 parseStatus 按序、缺 gameId→400。

**Evaluator 独立对抗实测：19 pass / 0 fail**（exit 0）：
```
A1 文件名 ../../evil-escape.txt → 201（名字白名单化后放行）
A2 POST 响应 DTO 不含 storageRef
A3 落库 storageRef 无 ".." 且 resolve 后仍在根内
A4 文件实际落在 MATERIALS_DIR/{gameId}/ 内
A5 根目录之外无逃逸文件
B1 10×10 png → 400（裁决口径 ≤10px 拒收）    B2 400 文案明示约束（含 10px + vision）
B3 10×10 不落库    B4 10×10 不落盘    B5 11×11 png → 201（>10px 放行）
C1 窗口内第 4-10 次照常 201（7/7）    C2 第 11 次 → 429    C3 429 带 Retry-After 头
C4 被限流请求不落库    C5 DISABLE_UPLOAD_RATELIMIT=1 后同窗口放行 → 201
E1 csv → 201 + parseStatus=pending
D1 GET 200 + 条数 = 实际成功入库数    D2 列表每条含 parseStatus/parseError    D3 列表不泄露 storageRef
复原：删除 Material 11 行 + 夹具 Game 1 行；全库余量 Material=0 GameKnowledge=0 Game=4；临时目录已删
```

> 对抗实测价值点：Generator 用例的小图边界取样 8px/32px，未测裁决临界值——本实测补 **10×10（=10px，拒）与 11×11（>10px，放行）** 精确边界，与裁决「≤10px 拒收」逐字一致；限流仅有单测（注入时钟），本实测在 route 层不设 escape env 真发 11 连请求验证 429 + `Retry-After` 头 + 不落库。

**双层穿越防护结构（代码审读）：** ① 写入侧 `assertGameIdShape`（cuid 形状硬校验，gameId 作目录名）+ `sanitizeFileName`（basename → unicode 白名单替换 → `..` 折叠，storage.ts:37-42）；② 读写侧 `resolveMaterialPath` resolve 后断言仍在根内（storage.ts:45-54），`readMaterialBytes`/`createMaterialReadStream`/`removeMaterialFile` 全部过此兜底。route 层第三重：gameId 先查库（查无 → 404 不触盘，route.ts:60-66）。落库失败回滚删文件（route.ts:98-101，代码层证据）。fail-open：限流器 try/catch 全包 + console.warn 放行（rate-limit.ts:43-46，代码层证据；异常注入分支未单测，逻辑简单可审读确认）。

**铁律 10 / 同 commit（ba13696 --stat）：** storage/upload/rate-limit/dto/route + unit + integration + 裁决文档 + gitignore + deps（image-size@2 / @paralleldrive/cuid2）同一 commit；tag `feat(M1-D-KNOWLEDGE-F002)` 对应 features.json F002 ✓。P1 确认：实现为 route handler（`src/app/api/materials/route.ts` + `runtime='nodejs'`），非 server action。

## 3. acceptance 逐条判定

| acceptance 子项 | 判定 | 证据 |
|---|---|---|
| storage.ts：MATERIALS_DIR（dev 默认 ./.materials 入 gitignore，prod /app/materials） | PASS | storage.ts:19 默认 `.materials`；.gitignore:42；compose:55/60 prod 卷 + env（F006 对位） |
| {gameId}/{cuid}-{safeName} 落盘 + 路径穿越防护 | PASS | 双层防护代码审读 + unit 4 案例 + 对抗 A1-A5（恶意文件名经完整链路无逃逸） |
| POST /api/materials formData（file+gameId+type）+ 类型白名单 pdf/txt/md/csv/png/jpg/webp | PASS | upload.ts PARSEABLE_MIME（服务端按扩展名权威判定）；unit 白名单外 400；对抗 E1 csv 201 |
| 20MB 上限 | PASS | MAX_UPLOAD_BYTES=20MB；unit + integration 20MB+1 → 413 不落库 |
| 【P5】图片最短边 >10px 前置校验（裁决：≤10px = 400 拒收不落盘不落库） | PASS | upload.ts:96 `min(w,h) <= 10` → 400；integration 8×8 拒 + 文案 + 不落库；对抗 B1-B5 精确边界 10↔11px；坏图 400 |
| 存盘 → Material 落库 pending | PASS | integration txt→201 pending + `existsSync(storageRef)` 落盘实证 + 行落库（id=文件 cuid 前缀同源）；落库失败回滚删文件（代码层） |
| 【P6】video/不可解析类型落库即 failed+parseError 明示 | PASS | route.ts:90-91；unit + integration mp4 → 201 failed + '暂不支持' 文案 |
| 【P8】rate-limit 10 req/min/tenantId fail-open + DISABLE_UPLOAD_RATELIMIT | PASS | unit 三案例（拒+Retry-After / tenant 隔离 / escape）+ 对抗 C1-C5 route 层真实 429；fail-open 代码层确认 |
| GET /api/materials?gameId= 轮询列表 | PASS | integration 2 案例（含 parseStatus 按序 / 缺参 400）+ 对抗 D1-D3（且不泄露 storageRef） |
| 集成测试：上传落盘落库/路径穿越拒/超限拒/小图拒 | PASS | tests/integration/materials-upload.test.ts 8/8 复跑全绿（真库真磁盘） |
| lint + tsc 绿 | PASS | tsc exit 0 · lint 0/0（unit 224/224 附带全绿） |

## 4. 环境与复原记录（D-H）

- Node v25.7.0（项目无 .nvmrc；本批测试 node 环境无 jsdom/localStorage 路径，无 testing-env-patterns §4 误报面）。
- `prisma generate` 先于 tsc（§3）。
- **端口纪律：** 全程未绑定任何端口（对抗实测为进程内直调 route handler，未起 dev/standalone 服务；127.0.0.1:3000 归另一验收流独占，未触碰。standalone 重建会覆盖 `.next` 影响并行流，故弃用 HTTP 层冒烟，进程内直调与集成测试同构，证据等价）。
- **DB/磁盘复原：** 本流足迹全清——对抗脚本终态自证 `Material=0 GameKnowledge=0 Game=4`；集成测试夹具自建自清（临时目录 + 专用 Game 行）；项目根无 `.materials/` 目录；scratchpad 脚本不入 repo。
- **并行流观察（非本流足迹）：** 测毕 psql 复核时 GameKnowledge 出现 3 行（game-xg，selling_point/audience/compliance_redline，createdAt 14:08:40Z）——产生于本流对抗脚本结束（自证 GameKnowledge=0）之后，归属并行验收流（F003/F005 解析实测），不属本流清理责任，未动。基线最终复原以 F003/F005 流的复原记录为准。
