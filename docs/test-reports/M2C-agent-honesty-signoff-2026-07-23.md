# M2-C-AGENT-HONESTY 验收 Signoff（2026-07-23，fix_rounds=1）

> **验收形态：** 首轮 fan-out（5 隔离 evaluator + 2 对抗复核，均 UPHELD）→ 3 PASS + 2 PARTIAL（F003/F005，均 minor）→
> fixing（commit 42bacb3）→ 复验（隔离 evaluator subagent，fresh context，全 PASS）。
> 结论逐字取自复验实测证据，主上下文未改写任何判定。
> **署名：** Mark/evaluator-subagent

---

## 批次概述

触发源 = 用户实证的幻觉编排事故（`docs/test-reports/user_report/M2C-agent-honesty-2026-07-23.md`）：
Copilot 对编排 Agent 说「创建王者荣耀东南亚推广项目」，得到杜撰 5 个名册外专家 + 声称已编排的长文，
零落库、项目页无物。三层根因：写路径不存在 / 诚实护栏缺失 / 名册未注入。

本批 5 features（全 generator）：F001 createProject 服务 + create_project 工具（internal，OperationLog 留痕）·
F002 POST /api/projects + 列表页创建入口（布局变更三同步）· F003 诚实护栏（BASE_SYSTEM 行动承诺三条 +
无工具分支强化）· F004 编队名册注入（listPersonas 同源禁杜撰）· F005 端到端闭环 + 文档翻牌。

---

## 结果总览

| # | Feature | 首轮 | 复验 | 终判 |
|---|---|---|---|---|
| F001 | createProject 服务 + create_project 工具（internal） | PASS | —（修复面仅额外触及 registry.ts，抽验为纯增量，挂载面零变更） | PASS |
| F002 | POST /api/projects + 列表页创建入口（布局变更） | PASS | —（修复 commit 零触及其验收面，免复验） | PASS |
| F003 | 诚实护栏（行动承诺条款 + 无工具分支强化） | PARTIAL | **PASS** | PASS |
| F004 | 编队名册注入（同源防杜撰） | PASS | —（测试文件仅格式化重排，6/6 绿抽验） | PASS |
| F005 | 端到端闭环 + 文档翻牌 | PARTIAL | **PASS** | PASS |

**终判：5/5 PASS · fix_rounds=1 · status → done**

---

## 首轮 PARTIAL → 修复 → 复验消解链

### 问题 1（F003，minor，对抗复核 UPHELD）— 复验 RESOLVED

**首轮指向：** acceptance 要求「单测 prompt 拼接断言（三要素全人格+无工具文案）」，无工具分支文案仅内联于
`src/app/api/agent/route.ts:116`，全仓 tests/ 零命中（换词穷尽证伪）——后续改动可静默漂移而测试不报；
三要素断言只覆盖 registry 层，不覆盖 route 层无工具分支拼接。

**修复（42bacb3）：** 提示语提为 `registry.ts:171` 导出常量 `NO_TOOL_CLAUSE`，`route.ts:120` 引用；
`tests/unit/agent-honesty.test.ts` +2 例：文案四要点钉死（:23-28）+ contract-surface 读源码断言
route.ts 实际拼接该常量 ≥2 处（:30-34，防丢接线）。

**复验证据：**
1. **steps_to_reproduce 原样重跑翻转**：`grep -rn '没有可调用\|没有执行任何动作\|页面入口' tests/`
   → exit 0，4 处命中（agent-honesty.test.ts:23/:24/:25/:27）；首轮为 exit 1 零命中。
2. **acceptance 正面达标**：三要素全人格断言在场（test :12-20，遍历 listPersonas() 断言要素 a/b/c +
   禁虚构执行态）+ 无工具文案断言在场（新 2 例）；`npx vitest run tests/unit/agent-honesty.test.ts`
   verbose 6/6 全绿，新 2 例逐名可见。
3. **行为零变更字节级实证**：程序化提取 42bacb3^ 内联字面量与修复后 `NO_TOOL_CLAUSE` 常量，
   还原转义后 74 字符逐字相同（`BYTE-IDENTICAL: true`）；route.ts diff 仅 2 hunk（import + 常量替换），
   拼接位置不变 → 无工具分支运行时输出与修复前逐字一致。
4. **断言活性证明（scratchpad 模拟，零触碰产品代码）**：模拟「丢接线」（route.ts 副本去除
   NO_TOOL_CLAUSE 引用）→ 出现次数 0 < 2，contract-surface 断言翻红；模拟「改词」
   （「没有执行任何动作」→「已尽力协助」）→ toContain 断言翻红。新断言非摆设。

### 问题 2（F005，minor，对抗复核 UPHELD）— 复验 RESOLVED

**首轮指向：** acceptance/spec 要求 architecture.md §8 装配层翻牌，F005 commit 只加 §10.1.1+§14 两行，
§8 三处未翻：(1) :989 工具表仍「已实装工具（3 个）」（实物 7）；(2) :1035 §8.3.1 基座 as-built 未注记
行动承诺条款+名册段；(3) :1092-1093 §8.6 名册表 orchestrator 仍 tools=[]、strategy 仍 [get_kol_detail]，
与 registry.ts:90/:101 批内反向漂移。

**修复（42bacb3）：** 三处定点翻牌 + 顺手校准同域两处陈旧（§8.3.1 ⑤行「未实装」→已实装 M1-D F005；
:1045 装配句 → NO_TOOL_CLAUSE 新口径）。

**复验证据：**
1. **steps_to_reproduce 原样重跑翻转**：
   - `grep -n '已实装工具' docs/dev/architecture.md` → `:989 已实装工具（7 个，M2-C 校准）`（首轮「3 个」）；
   - §8 范围（:960-:1110）grep `create_project|行动承诺` → 4 处命中（工具表 create_project 行 /
     §8.3.1 ①基座行动承诺三条+名册段注记 / §8.6 两行）（首轮零命中）；
   - `sed -n 1090,1102p` 名册表：orchestrator `[create_project]（M2-C）`、strategy
     `[get_kol_detail, compute_health, create_project]（M1-B / M2-C 扩）`。
2. **翻牌内容与实物逐项对齐（防翻错牌）**：
   - 工具表 7 行 ↔ `src/lib/agent/tools/` 实物 7 工具文件 + `index.ts` NATIVE_TOOLS 7 条逐一对应；
     归属人格列与 registry.ts PERSONA_SEED 各 tools 数组逐条一致（orchestrator :90 / strategy :101 /
     match :113 / reach :123 / delivery :133 / insight :142 / compliance :151）；
   - §8.3.1 ①注记 ↔ registry.ts BASE_SYSTEM :46-53 行动承诺三条 + ROSTER_SECTION :160-164 实物在场；
   - 顺手校准两处核实：⑤行「已实装」↔ `src/lib/agent/knowledge-context.ts` 存在 +
     route.ts:39 import / :102 调用；:1040 装配句 NO_TOOL_CLAUSE 口径 ↔ route.ts 实际拼接。
3. **§8 剩余新鲜度抽查（防第四处漂移）**：§8 全部残留「未实装/未注入/未建」声明逐条核物——
   `prompt.ts` 不存在 ✓ / `OUTBOUND_TOOL_NAMES` 全仓零命中 ✓ / iso 文案⊆outbound 断言 tests/ 零命中 ✓ /
   route.ts 无 ④环节上下文注入 ✓ / 溯源与语言约定未入 BASE_SYSTEM ✓。全部与实物一致，无新漂移。

---

## 回归面结论：PASS

| 项 | 证据 |
|---|---|
| route.ts 行为零变更 | 修复前内联串 vs NO_TOOL_CLAUSE 常量 74 字符字节级相同（程序化提取比对 `BYTE-IDENTICAL: true`）；diff 仅 import + 替换 2 hunk |
| registry.ts 纯增量 | diff 唯一 hunk = +8 行（注释 + 常量），PERSONA_SEED / BASE_SYSTEM / ROSTER_SECTION / buildSystemPrompt 零触碰——F001 挂载面、F004 名册面无回归 |
| agent-honesty.test.ts F004 段 | 仅 expect 调用格式化重排，断言语义逐字不变；6/6 verbose 全绿 |
| lint | `next lint` → 0 errors 0 warnings |
| tsc | `prisma generate` 前置后 `tsc --noEmit` exit 0 |
| test:unit | 378/378（38 files）全绿，与 fix commit 声明一致（376+2 新例） |
| test:visual | 免跑——fix commit 零触及 UI/视觉面文件（仅 route.ts 系统拼接 / registry 常量 / 文档 / 测试） |
| F002 验收面 | fix commit 零触及（api/projects、campaigns 页、原型、基线均无变更），首轮 PASS 免复验成立 |
| DB / 环境 | 本轮零 DB 操作零测试数据创建（修复均为断言/文档面），dev 库 D-H 清态未触碰；:3000 未起 |

---

## L2 用量申报汇总

| 轮次 | 用量 | 说明 |
|---|---|---|
| 首轮（round 1） | chat x2 + embedding x1 | F003 行为探针：无工具人格创建请求→明说不支持+指路；超能力请求→逐项「还不支持」零虚构；F002 视觉误触 lazy（副作用已全量删除复原）。零投喂零充值 |
| 复验（round 2） | **0** | 两处修复均为断言/文档面，无需真网关；未触碰任何外部服务 |

---

## Ops 副作用记录

本批次复验无数据库 ops（零写入零读改）。

---

## Soft-watch / 遗留 observations（首轮 notable_observations 原样带出，不阻塞 done）

| ID | 描述 | 风险等级 | 建议处置 |
|---|---|---|---|
| S1 | F001: `createProject` name 无 `.trim()`，纯空白名可建项目（acceptance 外） | low | 后续批次顺手兜底（zod `.trim().min(1)` 一行） |
| S2 | F002: 建议 `workbench.spec.ts` 注明本地跑法（伪造网关凭据）防下个 evaluator 踩 match lazy 超时 | low | 下批测试注释顺手补 |
| S3 | F003 L2 正向记录：两次真对话提及协作者全为名册内 7 人格，零杜撰（非问题，正向证据留档） | — | 无需处置 |

---

## Harness 说明

本批改动经 Harness 状态机完整流程（planning → building → verifying → fixing → reverifying → done）交付。
复验由隔离 evaluator subagent（fresh context）执行：自行从磁盘读取 progress.json / features.json /
spec / 代码 / fix commit，不采信 commit message 与实现叙述，全部结论基于实测。
`progress.json` 已设 `status: "done"`，signoff 路径已填入 `docs.signoff`。

## Framework Learnings

本批次无 framework learnings（首轮已提的观察项均已列入 Soft-watch 记账）。
