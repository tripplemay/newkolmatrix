---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M5.2-TENANT-COVERAGE 🔨 building（1/8）**，F001 ✅ done（`2bbbf79`，CI success）
  - F001 是**口径条**，产出是口径不是 5 条 route。用户三条裁决落盘
    `docs/specs/M5.2-F001-actions-wiring-adjudication.md` §5
  - ① D-3 选**处置③**（作用域下沉领域层）：实测处置②会丢 `status='failed'` 并让一次性执行票可重放
  - ② 范围 **44 → 53**：原「排除 scripts/test 29 条」的理由「无人跑」经核 package.json 证伪，9 条是活 npm script
  - ③ 追裁：`confirmPendingAction` 的惰性过期翻转同属「先写后抛」，一并走③
  - **口径：会话面默认入口层包；只有「先写后抛」才下沉。已确定 execute / confirm 两处，
    再遇第三处必须提审，不得自行类推**
  - 实跑：gate:smoke 开关开着 53 条✓全绿 · rls:e2e 15 passed · vitest 1897 全绿 · tsc/lint 净
- **M5.1c ✅ done**（签收 GRANTED，fix_rounds=1）· M5.1b ✅（8/8，fix_rounds=4）· M5-DEPLOY-FIX ✅ · M4.8→M0 全 ✅
- **生产行为零变化**：`DB_APP_ROLE_RUNTIME` 仍未设，运行时仍特权连接；入口面 78 条**已包裹 7 条**

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34…`**（回滚点 = M4.8 `c9236af1…`）
- 生产库 24 policy / 24 表启用；**M5.2 未收口前生产开关一律不动**（开了那 71 条入口全 500）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog high：BL-COST-CAP · BL-AGENT-COST-CALIBRATE · BL-M51B-CARRYOVER（余 ④⑤⑥⑦）
- **新登记**：`scripts/test/` 剩 20 条已废探针待盘点清理（本批已排除，理由已核实）
- **待人类 L2 手测**：注册真账号走通登录→对话 · 真多用户会话 · M4.7 原始故障场景复测
- proposed-learnings **6 条待裁**

## 关键技术坑（M4→M5.2 精选）
- **源码级扫描器不剔注释**：注释里照字面写违规/包裹形态，会被自己的钉点名，或把覆盖数**虚报高**
  （本批实测两次：普查把 execute route 误判已覆盖 8→7）。写反例一律改述
- **「已由 X 守住」类句子必须当场变异证活**；**变异要看红了几条**（本批一次变异翻红 3 文件 4 条，
  其中一条暴露的是改动自身的缺陷，不是变异目标）
- **入口一包，事务就罩住外呼**：任何调网关的工具都被默认 5s 罩住，实测时序性超时（gate-smoke G3）
- 变异还原不得用 `git checkout`（反向编辑 + `shasum -c` 对账）· `git grep` 只搜已跟踪文件
