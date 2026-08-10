---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.1c-CENSUS-SCANNER ✅ done（2026-08-10）**，签收 GRANTED（`docs/test-reports/M5.1c-CENSUS-SCANNER-signoff.md`），fix_rounds=1
  - F001 importer 普查钉判据 **正则 → TS AST**；等价性审计 384 文件多重集 1241/1241 **0 分歧**
  - F002 `src/lib/db` 叙述面**删承诺句**改纯指路；`src/` 除注释外零改动（emit + token 双判据自证）
  - 链路：verify-1（2/2 PARTIAL）→ 对抗复核（两条维持，其一判为**低估**）→ fix-1 → 复验两路 PASS → 独立签收
  - **6 个隔离 agent**，各自独立 worktree + fresh context；12 条遗留项无一阻断
- **M5.1b ✅ done**（8/8 PASS，fix_rounds=4）· M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅ · M4.8→M0 全 ✅
- **未做＝租户覆盖面（M5.2）**：入口面 78 条**仅包裹 3 条**，差集落盘 `docs/specs/M5.1-uncovered-entrypoints.md`
- **生产行为零变化**：`DB_APP_ROLE_RUNTIME` 仍未设，运行时仍特权连接

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34…`**（回滚点 = M4.8 `c9236af1…`）
- 生产库 24 policy / 24 表启用；开关的前置与回滚见 `docs/dev/deploy.md`（移除该键重启即回滚，无数据面变更）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog high：**BL-M52-TENANT-COVERAGE**（输入＝那份 75 条清单）· BL-COST-CAP · BL-AGENT-COST-CALIBRATE ·
  BL-M51B-CARRYOVER（①②③ 组已由 M5.1c 消费，余 ④⑤⑥⑦）
- **待人类 L2 手测**：注册真账号走通登录→对话 · 真多用户会话 · M4.7 原始故障场景复测
- proposed-learnings **6 条待裁**（本批新增 2 条：测量台落仓 / 验收链的三条结构性规律）

## 关键技术坑（M4→M5.1c 精选）
- **「已由 X 守住」类句子必须当场变异证活**（→ `audit-methodology.md` §7.1）；**变异要看红了几条**
- **该族的根因是顺序不是态度**：先写说明再（不）去量。治法＝把测量台落进仓，先量出红格才有资格写那句话
- **合并/改写用例会静默消掉探针鉴别力**——本批漏抄探针的第三行，断言照绿、全仓照绿、零信号
- **判据先验活要延伸到测量仪器**：变异台把 `Tests no tests` 当 0 failed → 假阴性「无鉴别力」
- 变异还原不得用 `git checkout`（反向编辑 + shasum 对账）· `git grep` 只搜已跟踪文件，新文件恒空绿
