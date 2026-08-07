---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **无进行中批次（status=new，2026-08-07）**。M5.1-TENANT-INJECTION 以**「未完成」收束**——不是 done
- **M5.1 实际交付：F001 已在 main @ `e6ecef1`**（三层 client `privilegedDb`/运行时/ALS 感知代理 + 单层 `withTenant`；零调用点接线、开关默认关，属惰性底座）。**但 acceptance 六条一条未验** —— 收编只证 diff 对账 / L1 在沙箱快照重跑 / 禁改清单，证不了断言鉴别力（尤其 ⑤ 的两条变异证活）
- **为什么没验成**：绑定的 evaluator(codex) 确定性断认证 —— 个人 config 走自定义中转 provider，`auth.json` 的 key 属该中转，而适配器的 `--ignore-user-config` 使其忽略 provider 段直连 `api.openai.com` → 401。**修复路径全部锁死**：改 registry/adapter 会漂 `execution_provenance_sha256`（实测 `8fdf3314`→`65529517`）→ resolver 硬停；换绑定须 `status∈{new,done}` 而到 done 又必先验收。用户裁决**破例**把 verifying 回调到批次边界重划。全貌 `docs/test-reports/M5.1-verify-blocked-report.md`
- **异构实测成本**：kimi 写 F001 用 2910s(48.5min)；codex 两派两停（网络瞬断 + 确定性 401）。**重派本身是诊断手段**——两次错因不同，只看第一次会误判为偶发
- M5-DEPLOY-FIX ✅ · M5-AUTH-RLS ✅ · M4.8 ✅ · M4.7 ✅ · M4.6 ✅ · M4.5 ✅ · M4 ✅ · M0→M3-B 全 ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M5 + M5-DEPLOY-FIX @ `9f010a34bd7682edc19f0535797c00a2d822baf7`**（回滚点 = M4.8 `c9236af1cc65cc64a0e7ecd50f15c86def0428d9`）。2026-08-06 复核 `health=200`
- 生产库 24 policy / 24 表启用，kol_app 未设变量 Project=0 行 vs 特权 6 行 → default-deny 成立
- **`DB_APP_ROLE_RUNTIME` 保持未设**（运行时仍特权连接）；启动哨兵持续告警是刻意可见态。M5.1 的底座虽已入 main，但**未接线、未验收**，不改变生产行为
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- **下一批次开工前置：人类须在控制台重新签发模式意图**（`role_assignments` / `mode_intent` / `lane` 已随批次收束清空）。**不要再绑 codex 作 evaluator**，除非先解自定义中转与 `--ignore-user-config` 的冲突
- backlog 9 条，high：**BL-M51B-TENANT-INJECTION-REST**（含 **F001 补验义务** + F002-F007 原文）· BL-M52-TENANT-COVERAGE · BL-COST-CAP · BL-AGENT-COST-CALIBRATE
- **待人类 L2 手测**（M5 上线后未做）：注册真账号走通登录→对话 · 真多用户会话 · `__auth-audit__` 占位租户不出现在用户可见面 · M4.7 原始故障场景复测
- proposed-learnings **5 条待裁**：docs.spec 路径基准 · 派活端 `active_target` 半供给 + accept clean 检查与全局 gitignore 交互（三坑合一条）· **`--ignore-user-config` 与自定义 provider 冲突（并撤回「设为模板默认」的旧建议）** · 另两条旧条目

## 关键技术坑（M4→M5.1 精选）
- **派活链路的失败成本前置且不对称**：本批三处缺陷全部只在「跑完之后」才暴露（kimi 跑满 48min 才在回执阶段炸假 `ARTIFACT_INVALID`）
- **`--ignore-user-config` 解崩溃却断认证**：个人 config 依赖自定义 provider 时二者不可兼得；且不能简单摘 flag（该 config 含 `danger-full-access` + `approval_policy=never`）
- **跨环境形态差**：psql 不认 Prisma `?schema=` · CI 空库无 dev 租户 · accept 用 `GIT_CONFIG_GLOBAL=/dev/null` 看仓库，只靠全局 gitignore 排除的文件会让它恒判「不 clean」
- 变异还原不得用 `git checkout` · `git grep` 类断言只搜已跟踪文件，新文件未 commit 时恒空绿
