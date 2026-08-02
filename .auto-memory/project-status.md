---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4.7-FRONTDESK reverifying（2026-08-02，快车道，fix_rounds=3）** — 单一前台 + 专家降为内部能力。轮二复验 7 PASS / 4 PARTIAL（F006/F007/F009/F010）**不予签收**：产品红线经 6 条独立变异未击穿，**卡点全在测试鉴别力与文档一致性**——轮一 §9 七条最小修复清单只有 3 条真闭环。fix_round3 已修 §19 的 1-6（RV-4 反向陈述 4 处改齐 + 接力抬/咨询不抬钉成行为 · RV-2 主 loop 默认闸 + 真双向绑定 + 下界护栏 · F009 清态断言两层 · S-RV2-9 钉子不再 CI 恒 skip · S-RV2-10 遥测等待下沉测试床 · RV-7 悬空 JSDoc）。**§19-7 三条待 Planner 裁决**（S-RV2-5 规则冲突 / S-RV2-8 主 loop 超时零告知是否开为下批 feature / S-M47-G3-5 落库口径）。报告 `docs/test-reports/M4.7-FRONTDESK-signoff.md`（§11-§20 为轮二）
- **M4.6-CTX done ✅（2026-07-26，快车道，fix_rounds=1）** — 生产实测缺陷修复 **1/1 PASS**。用户在项目环节页对话时模型反问「请提供项目ID」：`ctx.projectId` 服务端已解析但**从未进入 system 段**，而 13 个工具把它当模型入参 → 模型无从得知。修复 = `project-context.ts` 注入「当前上下文」段（id + 名 + 「不要索要」指令），起始人格与接力后目标人格共用同一段。首轮 PARTIAL（D1 真 route 证据缺失 / D2 降级断言是死的 / D3 夹具清态泄孤儿行 / D4 as-built 文档漂移，**全在交付面**）→ 一轮 fixing → 复验 PASS。signoff `docs/test-reports/M4.6-CTX-signoff.md`
- **M4.5-AGENT-LOOP done ✅（2026-07-25，快车道，fix_rounds=1）** — agent 循环放开面 **11/11 PASS**。首轮 fan-out 5 组隔离 evaluator + 对抗复核 ×1 = 10 PASS + F010 PARTIAL（三条缺陷全在交付物：e2e 脚本 + 文档翻牌，**零产品代码缺陷**）→ 一轮 fixing 全闭环 → 复验 11/11。闸门两步票据 / 时刻隔离 / 行动承诺诚实三条红线经各组独立取证 + 变异测试均未击穿。signoff `docs/test-reports/M4.5-AGENT-LOOP-signoff-2026-07-25.md`（§8 有 soft-watch 全量清单及逐条兜底）
- **交付面**：按人格步数预算（`AgentPersona.maxSteps` 深链 10/常规 5，registry 单一真相源）+ loop 遥测（只记元数据，budgetHit 可查）+ **循环内跨人格接力**（`handoff_to` → `prepareStep` 切 system/activeTools）+ 行动计划卡（认可只留痕**不解锁执行权**）+ 跨项目 ROI 追问 + 合规核查单 + 批量备好聚合确认（逐项两步票据，**无批量端点**）+ 渐进渲染（裁决 C）+ mock-model 测试床。验收入口 `npm run agentloop:e2e`
- **F008 裁决记录**：用户实答选 C（`docs/specs/M4.5-AGENT-LOOP-f008-preimpl-audit.md` §6）；方案 A（产物流）入 backlog `BL-TOOL-STREAM-OUTPUT`
- **M4-INSIGHT done ✅（2026-07-25，fix_rounds=2）** — 洞察域 12/12 PASS。三表 + `roi.compute`/`attribution.gaps` + `compute_roi`/`draft_report`/`create_share_link` + `ops/share` mock（**零真实公开暴露**）+ weekly-draft 例程。signoff `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`
- **机制化守门**：`architecture-doc-freshness.test.ts`（现覆盖 architecture.md **+ agent-architecture.md**：计数/枚举/工具表/名册/例程表 + 已作废流式 API 名 / stepCountIs 数字字面量 / 工具清单 / 档位值）· `e2e-cleanup-hygiene.test.ts`（清理段卫生）
- M0→M3-B 全 done ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M4 + M4.5 @ `fd751ad5cd0e1de306a2f59c17344e7ba26e2be2`**（2026-07-26 部署，用户授权后由主实例触发；上一版 M3-B `49308c1a…` 即回滚点）
- 部署实况：migrate one-shot 正常 · db/app 均 Healthy · 公网复核 `/api/health` ok、`/` 307→`/admin/today` 200。⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本
- **上线后未做的事**：M4/M4.5 全部为 L1 验收（mock，零外呼），真网关面在生产是首次曝光——模型自主接力质量 / 渐进渲染真流 / `draft_report` 真实生成 / 聚合确认真实 fetch 链，均待人工手测确认

## 需求池 / 待人类
- backlog 5 条：`BL-COST-CAP` · `BL-AGENT-ROUTINE` · `BL-TOOL-STREAM-OUTPUT` · **`BL-E2E-CLEANUP-PIN`**（断言强度升级：行为级 / 正向精确匹配 / 钉子覆盖面对齐——源码级正则与黑名单否定断言均已被 evaluator 实测绕过）· **`BL-TENANT-SCOPE-PROJECTREF`**（三口径项目解析收口 tenantId，实测可跨租户取名，**M5 前必须收口**）。下批候选：**M5**（真实认证+RLS / 真 partner / reach·conversions 真回传源 / 真实公开分享页）· **M3-C**（真入站收信 + send_bulk_outreach）· soft-watch 小批
- L2 未消耗：模型自主接力/追问质量 · 渐进渲染真流表现（mock 测试床不发 tool-input-delta）· 浏览器内真实渲染（persona_switch 换头 / 聚合卡逐项确认动线）· draft_report 全程降级验收
- soft-watch 续记：F003-low-1 · 洞察侧栏徽标恢复 · O2 + **S-M45-1**（e2e 每跑净增标记 OperationLog，**留不删**是显式决定，spec §9 写定）· O11 · O-G2-1（接力后 `ctx.agentId` 仍为起始人格）· S-G5-4（BATCH_EMPTY_MSG 死分支）· 无 `.nvmrc`
- proposed-learnings：M3-A 4 条已沉淀 ✅ v1.0.12；**M3-B 1 + M4 3 + M4.5 4 + M4.6 4 = 12 条挂起待确认**

## 关键技术坑（M4 → M4.6 新证）
- 注入缝 LLM caller 必须无条件调用 · 测试钉「恰好 N 条」清单会连坐后续扩展 · 新基线 CI 首推必红走 update-visual-baselines workflow
- **M4.5 新证**：装配入口不得被成员反向 import（循环只在 `next build` 炸）· `git grep` 断言只搜已跟踪文件，新文件未 commit 时恒空绿 · `fullPage:false` 基线对折叠线以下的新卡零覆盖 · **本地 dev 租户有 pending 时 admin 视觉基线全线翻红属预期**（重生基线前必须先清 dev pending 与 e2e 标记行）· **e2e 清理段自身绝不可再抛**（一抛就掩盖首因 + 跳过后续清理 + 污染 dev 库）· **源码级正则断言可被写法绕过，行为级断言才免疫**
- **M4.7 新证**：**改文档 ≠ 那句话被守住**（摘掉 `budgetChain.add` 全量无一条会红——函数级用例证不了它被接在哪个分支）· 清理登记表杜绝子集漂移，但**删掉整条登记时断言跟着消失**，须再压一层不从登记表派生的整表普查 · **`next build` 后必须重启 serve-standalone**，否则旧进程 chunk 指纹对不上、页面不 hydrate，伪装成整套视觉基线翻红
- **M4.6 新证**：**mock-model 测试床把工具入参写死 → 系统性掩盖「模型能否自己发现入参」类缺陷**（M4.5 以 11/11 PASS 收尾，上线首轮真实对话即撞到）· **黑名单式否定断言不可穷尽，正向精确匹配才根治** · **机械钉覆盖 N-1 段 = 留静默门**（钉子覆盖面必须与它守护的那句话逐项对齐）· `OperationLog`/`Handoff` 对 `Tenant` **软引用无 FK 不级联**，只断言 tenant 残留 0 = 假信心，漏清即留孤儿行
