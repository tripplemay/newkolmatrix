---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.1b-TENANT-INJECTION，status=reverifying，fix_rounds=1（2026-08-08）**。首轮验收 4 PASS / 4 PARTIAL / 0 FAIL；
  三条 PARTIAL（F003/F004/F008）已修并各配变异证活，F001（executor:evaluator）待复验
- **本批兑现＝机制层**：三层 client + ALS 感知代理三分支 + `withTenant`（事务内 SET LOCAL / 同租户嵌套复用 /
  跨租户抛 / 嵌套传选项抛）+ 引导白名单 5 文件双钉 + 13 处 `$transaction` 迁移 +
  ALS 三上下文传播实测 + **开关开且真连 kol_app 的六段最小闭环 e2e**（`npm run rls:e2e` → 15 passed）+ 文档/普查钉
- **未做＝覆盖面（M5.2）**：入口面实测 78 条、**已包裹 3 条**，差集 75 条落盘
  `docs/specs/M5.1-uncovered-entrypoints.md`（普查产出，`npm run census:entrypoints` 可复跑）
- **生产行为零变化**：`DB_APP_ROLE_RUNTIME` 仍未设，运行时仍特权连接；本批未改 `.env` 默认值
- L1 实跑（fix-1 后）：tsc 0 · lint 0 warning · `npx vitest run` 148 files / **1875** tests 全绿 · `rls:e2e` 15 passed · gate:smoke / delivery:e2e exit 0
- M5.1 以「未完成」收束（F001 实现在 main @ `e6ecef1`，acceptance 六条未验，债已并入本批 F001）
- M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅ · M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34bd7682edc19f0535797c00a2d822baf7`**
  （回滚点 = M4.8 `c9236af1cc65cc64a0e7ecd50f15c86def0428d9`）
- 生产库 24 policy / 24 表启用，kol_app 未设变量 Project=0 行 vs 特权 6 行 → default-deny 成立
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本
- 开关打开的前置与回滚已写进 `docs/dev/deploy.md`（回滚＝移除该键重启 app，无数据面变更）

## 需求池 / 待人类
- backlog high：**BL-M52-TENANT-COVERAGE**（覆盖面收口，输入＝上面那份未覆盖清单）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE
- **不要再绑 codex 作 evaluator**，除非先解自定义中转与 `--ignore-user-config` 的冲突
- **待人类 L2 手测**（M5 上线后未做）：注册真账号走通登录→对话 · 真多用户会话 · M4.7 原始故障场景复测
- proposed-learnings **8 条待裁**（本批新增 3 条：vitest 动态 import mock 并发失效 · 并发用例「集合相等」是伪断言 · **「声称在守它的防线并不存在」是独立缺陷族**）

## 关键技术坑（M4→M5.1b 精选）
- **vitest 4.1.10 对动态 import 模块的 mock 在并发下失效**：一路拿到真模块，泄漏后进缓存导致其后全部走真链
- **`mergeConfig` 对数组是拼接不是替换**：vitest e2e config 用它覆盖 include，会把默认测试面一起拖进来
- **变异证活要看「红了几条」**：F005 变异只红一半，才暴露并发断言用「集合相等」是伪断言（互换后集合仍相等）
- **普查模块会把自己算进去**：判定用的字面量出现在自己源码里；量尺须排除自己
- **「已由 X 守住 / 已由既有用例覆盖」这类转移举证责任的句子必须当场变异证活**——全绿的仓库看不见这一族（首轮 3/4 条 PARTIAL 同形态）
- **doc-freshness 类「陈旧句零残留」钉必须排除历史记录面**（test-reports/archive），否则验收报告一落盘就自钉红
- 变异还原不得用 `git checkout`（还原后以 shasum 逐位对账）· `git grep` 类断言只搜已跟踪文件，新文件恒空绿
