# M1-D-KNOWLEDGE F006 首轮验收（round 1）— 部署面：materials 卷 + env + 文档

- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-22
- **被验 commit：** `ecde6cd`（feat(M1-D-KNOWLEDGE-F006)，HEAD @ main，工作树 clean）
- **判定：PASS**（acceptance 全部子项满足；「部署验证随上线执行」为 acceptance 自身声明的延后项，不计入本轮）
- **L2 用量：无**——F006 为部署配置/文档验收，全程未调用网关（chat/vision 授权未消耗）

---

## 1. 验收方法

一切判定基于本 subagent 自行从磁盘读取的文件与自行运行的命令输出，不采信 commit message /
主上下文叙述。commit message 中的每条声明（compose config 验证过、探针无受损、lint+tsc 绿）
均独立复跑核实。

## 2. 逐项判定表

| # | acceptance 子项 | 判定 | 实证 |
|---|---|---|---|
| 1 | docker-compose.prod.yml 新增 `newkolmatrix-materials` 卷挂 app `/app/materials` | **PASS** | 文件 :58-60（app.volumes `newkolmatrix-materials:/app/materials`）+ :79-81（named volume 声明）；`docker compose -f docker-compose.prod.yml config`（注入 dummy 必填 env）渲染成功 = 语法合法，渲染输出含 `source: newkolmatrix-materials / target: /app/materials` |
| 2 | app env `MATERIALS_DIR` / `AIGCGATEWAY_VISION_MODEL` | **PASS** | 文件 :55（`MATERIALS_DIR=${MATERIALS_DIR:-/app/materials}`）+ :57（`AIGCGATEWAY_VISION_MODEL=${AIGCGATEWAY_VISION_MODEL:-qwen3.5-flash}`）；config 渲染出 `MATERIALS_DIR: /app/materials`、`AIGCGATEWAY_VISION_MODEL: qwen3.5-flash`，.env 插值可覆盖语法正确 |
| 3 | .env.example 补两项注释 | **PASS** | :33-40 新增「M1-D-KNOWLEDGE F006」段：`# MATERIALS_DIR=./.materials`（注明 dev 默认 / prod 挂卷无需手设）+ `# AIGCGATEWAY_VISION_MODEL=qwen3.5-flash`（注明 P4 路由 + active channel 前提）；额外含 `# DISABLE_UPLOAD_RATELIMIT=1`（P8 escape，超出 acceptance 的正向补充） |
| 4 | .gitignore 补 `.materials/` | **PASS** | .gitignore:40-42 存在（含 U2 注释）；`git log -S'.materials/'` 溯源 = 随 F002 commit `ba13696` 入库——判据落终态（条目在盘），归属批内，满足 |
| 5 | deploy.md 更新（materials 卷备份纳入 R7 记账） | **PASS** | deploy.md 拓扑表新增「素材卷」行（明示**备份纳入 R7 演练范围**（architecture §13.3，归 M5）+ 跨机迁移随卷搬）；另有两处超出 acceptance 的正向补充：回滚段数据卷保留说明（D12 expand 安全）+ ⚠️ compose 变更批次前置警示（VPS compose 为人工副本，deploy-prod 不同步——上线前必须先拷，直接服务本批上线链路） |
| 6 | architecture.md §7.6/§11.3 as-built 翻牌 | **PASS** | §7.6「演进目标」→「已实装（M1-D F001-F005）」+ 字段级 as-built 描述；§11.3「演进目标」→「已实装（M1-D F002-F005）」+ 动线 as-built；连带 §5.3 ⑤⑥ 状态机翻牌、§13.3 R7 行补素材卷记账、§14 M1-D 置已交付。**文档新鲜度 clause 交叉验证**（翻牌声明逐条 grep 实物）全部核实在盘，见 §3 |
| 7 | agent-architecture.md 相应段落（spec §2 F006） | **PASS** | 柱一流程补「⑤层知识注入（M1-D F005 as-built）」段；§2.1 AgentPersona 形状补 `knowledgeKinds?` + FR-8.4.8 映射说明——两处声明的实物均已 grep 核实（§3） |
| 8 | 探针/测试漂移扫描（v1.0.5：grep 引用部署文件的探针） | **PASS** | 自行重跑：全仓 grep `docker-compose.prod` 命中 17 文件（docs/specs/workflow/memory 类），**tests/ 与 scripts/ 零命中**——0 findings 的检测器活性由同一次 grep 在其他目录的 17 处命中证明；扩大面 grep tests/ scripts/ 的 `compose|/app/materials|deploy-prod` 仅命中两处注释（scripts/test/db-smoke.ts:8 指 dev compose 用法说明、scripts/deploy/migrate-seed.sh:8 指 env 注入说明），无任何探针对 prod compose 内容做断言 → 无受损项 |
| 9 | lint + tsc 绿 | **PASS** | 自行运行：`npm run lint` → `✔ No ESLint warnings or errors`；`npm run typecheck`（tsc --noEmit）→ exit 0 |
| 10 | 部署验证随上线执行 | **N/A（延后）** | acceptance 原文即声明「部署验证随上线执行」——属 done 后用户闸门 deploy-prod 环节，不阻塞本轮。注意 deploy.md 新增的 ⚠️ 前置：上线前必须先把新 compose 拷到 VPS `/opt/apps/newkolmatrix/`，否则 materials 卷缺失 → 上传文件落容器层，容器重建即丢（静默缺口） |

## 3. as-built 翻牌的实物交叉验证（文档新鲜度 clause）

翻牌段落声明的每个符号逐一 grep 实物（防「文档说已实装、实物不存在」的正向注水）：

| 文档声明 | 实物 | 结果 |
|---|---|---|
| §7.6 读取恒经 `lib/knowledge/query.ts::getKnowledgeHeads` | `src/lib/knowledge/query.ts:12 export async function getKnowledgeHeads(` | 在盘 |
| §7.6/agent-arch `knowledge-context.ts` 的 `gameKnowledgeSection` | `src/lib/agent/knowledge-context.ts:56 export async function gameKnowledgeSection(` | 在盘 |
| agent-arch `persona.knowledgeKinds` + FR-8.4.8 映射 | `registry.ts:41 knowledgeKinds?:` + :86 strategy 三类全量 / :96 match=['audience'] / :106 reach=['selling_point'] / :134 compliance=['compliance_redline'] | 在盘且映射与文档一致 |
| §7.6 storageRef `MATERIALS_DIR` 内相对路径 | `storage.ts:19 path.resolve(process.env.MATERIALS_DIR ?? '.materials')` | 在盘（dev 默认与 .env.example 注释一致） |
| §11.3 vision=qwen3.5-flash（P4 路由） | `parse.ts:35 process.env.AIGCGATEWAY_VISION_MODEL ?? 'qwen3.5-flash'` | 在盘且与 compose 默认值一致 |
| §5.3 ⑤ D20 变异测试已配 | `tests/integration/knowledge-parse.test.ts` | 在盘（行为深验属 F003 验收范围） |
| §11.3 上传/解析 API | `src/app/api/materials/route.ts` + `src/app/api/materials/[id]/parse/route.ts` | 在盘 |
| §7.6 flags 命名空间「**仍为演进目标**」 | `src/lib/compliance/` 目录不存在 | 文档诚实，无反向漂移 |

## 4. 关键命令与输出摘录

```
$ POSTGRES_PASSWORD=dummy AIGCGATEWAY_API_KEY=dummy docker compose -f docker-compose.prod.yml config
  # 渲染成功（语法合法），关键渲染片段：
  AIGCGATEWAY_VISION_MODEL: qwen3.5-flash
  MATERIALS_DIR: /app/materials
  volumes: - type: volume / source: newkolmatrix-materials / target: /app/materials
  volumes: newkolmatrix-materials: name: newkolmatrix-materials

$ grep -rln "docker-compose.prod" --exclude-dir={node_modules,.next,.git} .
  # 17 文件命中，tests/ scripts/ 零命中（检测器活性由 17 处他域命中证明）

$ npm run lint       → ✔ No ESLint warnings or errors
$ npm run typecheck  → exit 0
```

## 5. 决定论纪律（D-H）复核

本轮验收全程只读：未写 DB、未落盘临时产物（除本报告）、未起服务、未绑端口。
测毕基线态自查：

```
$ docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -tAc \
    'SELECT (SELECT count(*) FROM "Material"), (SELECT count(*) FROM "GameKnowledge"), (SELECT count(*) FROM "Game");'
0|0|4    # Material=0 / GameKnowledge=0 / Game=4 canonical —— 视觉基线态干净
```

## 6. 备注（非缺陷，供 done 阶段与上线链路参考）

- deploy.md 新增的「compose 人工副本」⚠️ 前置对本批上线是**硬前置**（materials 卷缺失属静默持久化
  缺口，不报错）——建议 deploy-prod 执行清单把「先拷新 compose 到 VPS」列为第 0 步。
  Generator 已在 `framework/proposed-learnings.md` 挂对应条目待用户裁决。
