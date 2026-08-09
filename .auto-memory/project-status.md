---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.1c-CENSUS-SCANNER 🔨 building（2026-08-09 立项）**，2 条 feature，spec `docs/specs/M5.1c-CENSUS-SCANNER-spec.md`
  - F001 `db-layer-importer-census.test.ts` 的 `importSpecifiers` **正则 → TS AST**（+ 回归用例随实现换代重验）
  - F002 `src/lib/db/*.ts` 叙述面**删承诺句**（改纯指路），保留 🔒④ 黑名单并复核其鉴别力
  - 两条决策均为用户裁决：**不再修补正则**（复验方已实证 AST 对全仓 384 文件 0 分歧）·
    **不再加钉钉断言**（走消除路线：不写承诺就不存在「声称 > 实际」）
  - 消费 `BL-M51B-CARRYOVER` 的 ①②③ 组；`src/` 产品代码零改动（除注释）
- **M5.1b-TENANT-INJECTION ✅ done（2026-08-09）**。8/8 全 PASS，独立 evaluator 签收 GRANTED。**fix_rounds=4**
  - 兑现＝机制层：三层 client + ALS 代理 + `withTenant` + 引导白名单双钉 + 13 处 `$transaction` 迁移 +
    **开关开且真连 kol_app 的最小闭环 e2e**（`npm run rls:e2e` 15 passed）
  - 未做＝覆盖面（M5.2）：入口面 78 条、**已包裹 3 条**，差集落盘 `docs/specs/M5.1-uncovered-entrypoints.md`
  - **生产行为零变化**：`DB_APP_ROLE_RUNTIME` 仍未设，运行时仍特权连接
- M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅ · M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34…`**（回滚点 = M4.8 `c9236af1…`）
- 生产库 24 policy / 24 表启用；开关打开的**前置与回滚**已写进 `docs/dev/deploy.md`（回滚＝移除该键重启 app，无数据面变更）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog high：**BL-M51B-CARRYOVER**（M5.1b 遗留 17 条合并归档；①②③ 组正由 M5.1c 消费，④⑤⑥⑦ 待排期）·
  **BL-M52-TENANT-COVERAGE**（输入＝那份 75 条未覆盖清单）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE
- **待人类 L2 手测**：注册真账号走通登录→对话 · 真多用户会话 · M4.7 原始故障场景复测
- proposed-learnings：本批两条已沉淀 framework v1.0.14（`audit-methodology.md` §7.1/§8.1 ·
  `testing-env-patterns.md` §13/§14）；**其余 5 条待裁**（派活链路为主）

## 关键技术坑（M4→M5.1b 精选）
- **「已由 X 守住 / 已由既有用例覆盖」这类转移举证责任的句子必须当场变异证活**——本批四轮里三轮栽在这一族，
  每次都复发在「为消灭它而写的那句话」里；靠「有界收口 + 整族转 backlog」才退出递归
- **变异证活要看「红了几条、红的是哪几条」**，只看「红没红」会把别的钉的红误当成自己的鉴别力
- **判据先验活**（本批至少 6 次救场）：emit 比对器方向反了 · 未加引号的 zsh glob 静默返回 0 ·
  `$` 在双引号里被当行尾锚点 · `find -exec cat` 顺序不定致哈希不稳 · 父目录短路 · 探针污染普查计数
- **正则 `(?:...)?` 是贪婪可选**（非 `??`），内部惰性量词会跨行吞噬——本批 importer 扫描器的病根
- 变异还原不得用 `git checkout`（用反向编辑 + shasum 逐位对账）· `git grep` 只搜已跟踪文件，新文件恒空绿
