---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.1b-TENANT-INJECTION ✅ done（2026-08-09）**。8/8 全 PASS，独立 evaluator 签收 GRANTED
  （`docs/test-reports/M5.1b-TENANT-INJECTION-signoff.md`）。**fix_rounds=4**
- **兑现＝机制层**：三层 client + ALS 代理三分支 + `withTenant`（事务内 SET LOCAL / 同租户复用 / 跨租户抛 /
  嵌套传选项抛）+ 引导白名单 5 文件双钉 + 13 处 `$transaction` 迁移 + ALS 三上下文传播实测 +
  **开关开且真连 kol_app 的六段最小闭环 e2e**（`npm run rls:e2e` → 15 passed）+ 文档/普查钉
- **未做＝覆盖面（M5.2）**：入口面 78 条、**已包裹 3 条**，差集 75 条落盘 `docs/specs/M5.1-uncovered-entrypoints.md`
- **生产行为零变化**：`DB_APP_ROLE_RUNTIME` 仍未设，运行时仍特权连接；`.env` 默认值全程未改
- L1（签收方独立复跑）：tsc 0 · lint 0 · `vitest run` **148 files / 1885 tests** · rls:e2e 15 · gate:smoke / delivery:e2e / reach:e2e(降级) 全绿
- M5.1 以「未完成」收束（其债已由本批 F001 补验，本批 F001 = PASS）
- M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅ · M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34…`**（回滚点 = M4.8 `c9236af1…`）
- 生产库 24 policy / 24 表启用；开关打开的**前置与回滚**已写进 `docs/dev/deploy.md`（回滚＝移除该键重启 app，无数据面变更）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog high：**BL-M52-TENANT-COVERAGE**（输入＝上面那份未覆盖清单）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE
- **本批遗留 17 条 open items**，见 `progress.evaluator_feedback.open_items_carried`。最高优先级：
  **U2——本批修复引入的潜伏回归**（re-export `[^;]*?` 会凭空捏造 importer，当前靠 Prettier 分号不可达）
- **待人类 L2 手测**：注册真账号走通登录→对话 · 真多用户会话 · M4.7 原始故障场景复测
- proposed-learnings 待裁（本批新增多条，含「声称在守它的防线并不存在」缺陷族）

## 关键技术坑（M4→M5.1b 精选）
- **「已由 X 守住 / 已由既有用例覆盖」这类转移举证责任的句子必须当场变异证活**——本批四轮里三轮栽在这一族，
  每次都复发在「为消灭它而写的那句话」里；靠「有界收口 + 整族转 backlog」才退出递归
- **变异证活要看「红了几条、红的是哪几条」**，只看「红没红」会把别的钉的红误当成自己的鉴别力
- **判据先验活**（本批至少 6 次救场）：emit 比对器方向反了 · 未加引号的 zsh glob 静默返回 0 ·
  `$` 在双引号里被当行尾锚点 · `find -exec cat` 顺序不定致哈希不稳 · 父目录短路 · 探针污染普查计数
- **正则 `(?:...)?` 是贪婪可选**（非 `??`），内部惰性量词会跨行吞噬——本批 importer 扫描器的病根
- 变异还原不得用 `git checkout`（用反向编辑 + shasum 逐位对账）· `git grep` 只搜已跟踪文件，新文件恒空绿
