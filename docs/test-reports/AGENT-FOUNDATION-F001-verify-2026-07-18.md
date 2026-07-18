# AGENT-FOUNDATION · F001 隔离验收报告

- **Feature：** F001 — TypeScript 5 微批迁移 + 运行时版本锁定（AI SDK v5 前置）
- **被验收提交：** `d4cd942`（feat(AGENT-FOUNDATION-F001)）
- **验收方式：** fresh-context 隔离 evaluator subagent，逐条按 features.json F001 `acceptance` 权威副本 + spec §6 构建门验收
- **验收人：** Andy/evaluator-subagent
- **验收日期：** 2026-07-18
- **环境：** node v25.7.0 / npm 10.8.2 / macOS（darwin 25.5.0）
- **总判定：** **PASS**（6/6 acceptance 子条全部 PASS；无 FAIL/PARTIAL）

> 独立性声明：以下每条结论均基于本人亲自运行的命令输出与亲自读到的文件，未采信任何实现叙述。tsc 前已删除 `tsconfig.tsbuildinfo` 与 `.next/cache/.tsbuildinfo`，排除 incremental 缓存假象。

---

## 逐条验收

### 1. typescript 升到 5.x — PASS

四处版本一致，且为 exact 硬锁（无 `^`）：

| 来源 | 值 |
|---|---|
| `node_modules/typescript/package.json` | 5.9.3 |
| `package.json` dependencies.typescript | `5.9.3`（无 `^`，硬锁） |
| `package-lock.json` root deps.typescript | `5.9.3` |
| `package-lock.json` node_modules/typescript.version | 5.9.3 |
| `npx tsc --version`（实际编译器） | Version 5.9.3 |

主版本 = 5，满足「typescript 主版本为 5」。

### 2. tsconfig 现代化（target ≥ES2020；strict 打开或列豁免清单）— PASS

`tsc --showConfig` 有效配置实测：

| 选项 | 有效值 |
|---|---|
| `target` | es2020（≥ES2020 ✓） |
| `moduleResolution` | bundler（前置 F003 exports-only ESM，非本条要求，附带说明） |
| `strict` | **true** |
| `noImplicitAny` | true |
| `strictFunctionTypes` | true |
| `strictBindCallApply` | true |
| `useUnknownInCatchVariables` | true |
| `alwaysStrict` | true |
| `noImplicitThis` | true |
| `strictNullChecks` | **false（豁免）** |
| `strictPropertyInitialization` | **false（豁免）** |

采用形态：`strict: true` + **明确列出的 2 项豁免清单**（strictNullChecks / strictPropertyInitialization），豁免在 `tsconfig.json` 注释、commit message、session_notes 三处均有文档说明。acceptance 允许「strict 打开**或**列豁免清单」，此处两者兼具。

**自洽性抽查（命令行覆盖 `--strictNullChecks --strictPropertyInitialization`，不改文件）：** 开启后暴露 **42** 个 `error TS`，全部落在 Horizon vendor scaffold（Links.tsx ×19、NavbarAuth.tsx ×12、componentsrtl/Links.tsx ×5、utils/navigation.ts ×4、Configurator.tsx ×1、NavLink.tsx ×1），**无一落在 F001 改动文件（AppWrappers.tsx）或任何 net-new 代码**。证明豁免确为规避 vendor 层既有错误，非掩盖 F001 引入的类型错——豁免自洽且正当。
- 非阻断文档小误差：tsconfig 注释与 commit 声称「43 个」，实测 42（off-by-one），不影响判定。

### 3. 修复 Horizon scaffold 因升级产生的类型错误 — PASS

`npx tsc --noEmit`（已删 tsbuildinfo）→ **退出码 0，零错误输出**。无遗留类型错。

`noImplicitAny` 生效后唯一暴露的错误（`AppWrappers.tsx` 的 `_NoSSR` children 隐式 any）已正当修复：`import React, { ReactNode } from 'react'` 后标注 `{ children: ReactNode }`——正规类型标注，非 `any` 抑制、非 `@ts-ignore` hack。

### 4. next/react/typescript 版本锁定并提交 lockfile — PASS

三包三处一致，均 exact 硬锁（无 `^`）：

| 包 | package.json | lock root deps | node_modules |
|---|---|---|---|
| next | 15.5.20 | 15.5.20 | 15.5.20 |
| react | 19.2.7 | 19.2.7 | 19.2.7 |
| react-dom | 19.2.7 | 19.2.7 | 19.2.7 |
| typescript | 5.9.3 | 5.9.3 | 5.9.3 |

`package-lock.json` 已在 `d4cd942` 提交（`git show d4cd942 --stat` 含 `package-lock.json | 17 +++---`）。附带：`@types/node` 幽灵依赖（deps 侧原 `^12.20.55`，与全栈错版本）已从 dependencies 清除，devDeps 保留正确的 `^18.7.6`。

### 5. tsc --noEmit + build + lint 全绿 — PASS

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `npx tsc --noEmit`（无缓存） | 0 | 无任何输出（0 error） |
| `npx next lint` | 0 | `✔ No ESLint warnings or errors`（deprecation 提示非错误） |
| `npx next build` | 0 | `✓ Compiled successfully` + `✓ Generating static pages (10/10)`，10 条路由全出，无 error/Failed |

三件套全绿。

### 6. F001 必须先于 F003（顺序约束）— PASS

F001 交付物自身成立：升级 + 锁定 + 构建门全绿，不依赖任何 F003 产物。`package.json` dependencies 无 `ai` / `@ai-sdk` / vercel-ai 相关包（正确：F003 未开工，AI SDK 尚未引入属正常）。`moduleResolution: bundler` 是为 F003 的 exports-only ESM 包所做的前置准备，当前不破坏任何构建（三件套全绿佐证）。顺序约束满足。

---

## 总判定

**PASS** — F001 全部 6 条 acceptance 子条均 PASS，构建门（spec §6）在本 feature 通过。无 FAIL/PARTIAL。

**唯一非阻断提示（记录不打回）：** tsconfig 注释/commit 声称 strictNullChecks 暴露「43 个」既有错误，实测为 42（off-by-one 文档误差）。建议未来顺手订正注释文案，不影响 F001 验收结论。

验收人署名：**Andy/evaluator-subagent**
