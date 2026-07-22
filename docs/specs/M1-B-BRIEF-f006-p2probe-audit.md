# M1-B-BRIEF F006 — 实装期审计：p2:f003 探针与 image/ 删除冲突

> 触发：Generator 实装 F006 删除前 grep 实证时，发现 spec 勘查遗漏的第三处引用。
> 快车道即时裁决（pre-impl-adjudication.md §4.6 豁免条款：同会话裁决，分段标注角色切换）。

## 【Generator】发现（2026-07-21）

F006 acceptance 断言 `src/components/image/` 除 `f003-harness/` + `f003-reverify/`
两处外全仓零引用。实际 grep 到**第三处**：

- `scripts/test/p2-cleanup-f003-avatar-colormode.mjs:47-48` —
  `readFileSync('src/components/image/Avatar.tsx')` **硬读该文件**；
- 该探针接着 npm script **`p2:f003`**（package.json:32），且被 spec §4 就绪回归
  「四条 p2 探针无回归」点名。

**冲突：** 删除 image/（F006 主旨）→ p2:f003 探针在 :48 直接 ENOENT 崩溃 →
违反 §4「四条 p2 探针无回归」。两条 acceptance 无法同时满足。

**事实补充：**
1. 该探针是 P2-CLEANUP F003（BL-FE-15 Avatar 深浅色边框）的回归探针——与
   f003-harness/f003-reverify 同一批次遗留，审计对象正是本 F006 要删除的 Avatar.tsx；
2. 探针自己的注释（:8-9）就写明「image/Avatar.tsx 全仓零引用……产品里没有能导航
   到它的路由」——它守护的是一个死文件上的修复；
3. BL-FE-17（showBorder 恒不渲染）随删除作废已由 spec 裁定；BL-FE-15 的修复
   随文件删除同理失去守护对象。

**Generator 判断（供裁决）：** 探针的审计对象消亡 → 探针一并退役（连同 npm script
`p2:f003`），就绪回归口径由「四条 p2 探针」改「三条（p2:f001/f002/f004）」。
无其他可行解：保留探针必崩，重指无对象，不删 image/ 违背 F006 主旨。

---

## 【Planner 裁决】（同会话主上下文，角色切换标注）

**裁决：按 Generator 方案执行。**

1. `scripts/test/p2-cleanup-f003-avatar-colormode.mjs` 与 npm script `p2:f003`
   随 image/ 一并退役——它与 f003-harness/f003-reverify 同属"P2-CLEANUP F003 遗留"，
   spec F006「一并退役 P2-CLEANUP F003 遗留」的语义天然涵盖它，勘查时漏列是
   grep 面口径问题（audit-methodology §2.1 语义划面的又一实例：按「f003」字面
   grep 漏掉了按「image/」路径 grep 才能命中的这一处）；
2. 就绪回归口径修订：「四条 p2 探针无回归」→「**三条 p2 探针（p2:f001/f002/f004）
   无回归**」。p2:f003 的守护对象（BL-FE-15 修复）随死代码删除消亡，与 BL-FE-17
   作废同一逻辑；
3. 本裁决对 spec §4 的修订即由本文档承载，spec 原文不改（验收时以本文档为准）；
4. 沉淀候选：勘查 grep 面按语义划全（v1.0.8 audit-methodology §2.1 已有此条，
   本例是其反面新证）——追加 proposed-learnings 由 done 阶段一并处理。
