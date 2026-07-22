# M1-B-BRIEF F006 验收报告 — BL-FE-17 + image/ 死代码删除

- **批次：** M1-B-BRIEF（verifying 首轮，fix_rounds=0）
- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-21
- **被验 commit：** `6c8018f`（F006）；验收基于 main HEAD `126b410` 工作树实物
- **判定：PASS**

## 0. 验收依据

- features.json F006 acceptance 全文
- spec `docs/specs/M1-B-BRIEF-spec.md` §2 F006 + §4 F006 行
- 实装期审计裁决 `docs/specs/M1-B-BRIEF-f006-p2probe-audit.md`（就绪回归口径修订：四条 p2 探针 → 三条 p2:f001/f002/f004，p2:f003 随 image/ 一并退役——验收以本裁决为准）
- 行为规范 `.auto-memory/role-context/evaluator.md`（「0 findings 必须配检测器活性证明」三道交叉）
- L1 前置 `framework/patterns/testing-env-patterns.md` §3（tsc 前先 prisma generate；本项目无 .nvmrc，§4 不适用）

## 1. 逐条 acceptance 判定

### 1.1 删除整个 src/components/image/（Avatar.tsx + Image.tsx）— PASS

- `ls src/components/image` → `No such file or directory`；`ls src/components/` 列表中已无 `image` 目录
- `git show --stat 6c8018f`：`src/components/image/Avatar.tsx`（-54）+ `src/components/image/Image.tsx`（-32）两文件删除，与勘查一致（该目录仅此两文件）

### 1.2 全仓零悬空引用（含 scripts/、tests/）— PASS（含检测器活性证明）

**终态 grep（HEAD 工作树，含未跟踪文件）：**

```
grep -rn -E "components/image|NextAvatar|ChakraNextAvatar" \
  --include=*.{ts,tsx,js,mjs,json,yml,yaml} \
  src/ scripts/ tests/ prisma/ sdk/ .github/ package.json tsconfig.json next.config.js
→ 零命中（exit 1）
```

tracked 全仓 `git grep -E "components/image|NextAvatar|ChakraNextAvatar|image/Avatar|image/Image"` 排除 docs/、framework/ 后仅剩 1 处：features.json F006 acceptance 自身文本（规格描述，非代码引用）。docs/ 与 framework/ 残留命中均为历史规格/验收报告/归档（P2-CLEANUP 系列、本批 spec 与审计文档），属历史记录非悬空 import。

**检测器活性证明（evaluator.md v1.0.6 三道交叉）：**

1. 检测器为本 evaluator 现场手打 grep，无脚本篡改面；
2. 前基线可复现——同一 pattern 在删除前父 commit 跑：`git grep -nE "components/image|NextAvatar|from './Image'|image/Avatar" 6c8018f^` 复现全部删除前引用：定义文件 2 处（Avatar.tsx/Image.tsx）+ `f003-harness/`3 文件 + `f003-reverify/`2 文件 + `p2-cleanup-f003-avatar-colormode.mjs`（:47 `const AVATAR = 'src/components/image/Avatar.tsx'`）+ backlog.json:18 BL-FE-17 条目——证明 pattern 有捕获能力，0 命中是真删净不是探测失灵；
3. 终态判据独立成立（上述工作树 grep = 0）。

### 1.3 退役 scripts/test/f003-harness/ + f003-reverify/ — PASS

- 两目录 `ls` 均 `No such file or directory`；commit diff 删除 7 个 tracked 文件（含各自 .gitignore；commit 记录未跟踪 out/ 构建产物一并清理，现场 `git status --short` 干净无残留）

### 1.4 第三处引用（审计裁决）：p2:f003 探针一并退役 — PASS

- `scripts/test/p2-cleanup-f003-avatar-colormode.mjs` 已删（ls 不存在，commit diff -193 行）
- package.json scripts 现存 `p2:f001`/`p2:f002`/`p2:f004` 三条，`p2:f003` 已移除（commit diff package.json -1）
- `grep -rn "p2:f003\|p2-cleanup-f003" .github/ package.json scripts/ tests/ src/` → 零命中
- 三条存续探针的脚本文件（p2-cleanup-f001-drawer-close.mjs / f002-colormode-persist.mjs / f004-handoff-panel.mjs）均在位，且（由 1.2 终态 grep 覆盖）不引用任何被删路径。三条探针的实际运行归批次级就绪回归 agent，不在本分报告重复

### 1.5 BL-FE-17 作废登记，无需修白名单+补测试 — PASS

- 删除前 backlog.json:18-30 存在 BL-FE-17（`git grep 6c8018f^` 实证「ChakraNextAvatar + showBorder 边框恒不渲染」条目）；HEAD backlog.json 已无该条（commit diff backlog.json -13）
- 作废登记见 `.auto-memory/project-status.md`「BL-FE-17 已作废（F006 删 image/ 兑现）」+ commit 6c8018f 正文；缺陷载体文件已消亡，白名单修复与补测试自然作废，未发现任何为其新增的测试/修复代码（符合「无需」）

### 1.6 BL-FE-16 不做、backlog 条目保留 — PASS

- backlog.json 现为单条数组，唯一条目即 BL-FE-16（useColorMode 跨实例不同步），原文保留
- 「本批亦不引入纯读取方消费者」实证：`grep -rn "useColorMode" src/` 排除 hook 定义后仅 `src/components/navbar/index.tsx:32`（持 toggle 的已知正常消费者）+ `src/hooks/index.ts:2`（barrel 导出）；全批次 diff（`git diff e946b49^..126b410 --name-only -- src/`）触及文件中无任何新增 useColorMode 消费（grep -l 零命中）

### 1.7 lint + tsc 绿 — PASS

- 前置 `npx prisma generate` 后 `npx tsc --noEmit` → 零输出，exit 0（零悬空 import 的编译级独立证据）
- `npx next lint` → `✔ No ESLint warnings or errors`，exit 0（0 error 0 warning，无需套用 lint warning 处理矩阵）

## 2. spec §4 F006 行对照

| §4 判据 | 结果 |
|---|---|
| `src/components/image/` 已删且全仓（含 scripts/tests）零悬空 import | PASS（§1.1 + §1.2 + §1.7 tsc） |
| f003-harness / f003-reverify 已退役 | PASS（§1.3；p2:f003 探针按审计裁决同退役，§1.4） |
| BL-FE-17 作废登记 | PASS（§1.5） |

## 3. 边界与备注

- 本 feature 纯删除，不触 UI 渲染路径；:3000 standalone（HEAD 构建产物）未做浏览器实测（无实测对象），未 kill/重启该服务
- L2 不涉及：无外部调用/计费面
- 批次级就绪回归（全量 lint/tsc/test:unit/test:visual/三条 p2 探针）由专门 agent 执行，本报告的 lint/tsc 为 F006 针对性证据（悬空 import 检测），非替代
- 本 evaluator 未修改任何产品代码；本报告为唯一新增产物

## 4. 结论

**F006 = PASS。** 7 项 acceptance 全部实物核验通过，0 findings 配三道检测器活性证明，问题清单为空。
