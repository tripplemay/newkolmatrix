# M3-B-DELIVERY · F006 验收报告

- **Feature：** F006 — `distribute_keys` 工具（outbound）+ GameKey 分发
- **验收者：** Andy / evaluator-subagent（隔离上下文）
- **阶段：** verifying（fix_rounds=0，首轮）
- **日期：** 2026-07-23
- **判定：** **PASS**
- **HEAD：** `13eebb0`
- **L2 授权：** 未授权 — 本批 P1 硬约束「零真实资金动作」，全程 mock 适配器路径，无 L2 项需外部服务。

---

## 1. 取证范围（实物，非转述）

| 类别 | 文件 |
|---|---|
| 工具实现 | `src/lib/agent/tools/distribute-keys.ts` |
| mock 适配器 | `src/lib/ops/partner/mock-key-distributor.ts` · `types.ts` · `index.ts` |
| 明文守卫 | `src/lib/delivery/key-ref.ts` |
| key 池写入口 | `src/app/api/delivery/deals/[id]/keys/route.ts` · `src/lib/delivery/register.ts` · `src/lib/data/schemas/delivery.ts` |
| schema | `prisma/schema.prisma`（GameKey model :583-599） |
| 注册 | `src/lib/agent/registry.ts`（delivery 人格 tools :153-158） · `src/lib/agent/tools/index.ts` |
| 闸门链路 | `src/lib/agent/gate/gate.ts`（execute 同事务收尾 :364-391） · `src/lib/agent/execute.ts`（outbound 门控 :41-53） |
| Generator 交付测试 | `tests/integration/distribute-keys.test.ts`（12 断言） |
| **Evaluator 独立探针** | `tests/integration/distribute-keys.evaluator-probe.test.ts`（16 断言，本次新增） |

---

## 2. Acceptance 逐条核对

| # | Acceptance 条款 | 结论 | 证据 |
|---|---|---|---|
| 1 | distribute_keys 注册且挂 delivery 人格 | ✅ | registry.ts:157 `distribute_keys` 在 delivery.tools；tools/index.ts:34 装配；探针 H「同源断言」PASS |
| 2 | class=outbound + buildHarm 三要素（领取方全名单不折叠 / key 数量 / 不可回收红标） | ✅ | tool.class='outbound'（distribute-keys.ts:220）；buildHarm 产 `targets=[recipient]` / `quantity` / `summary 含「一经发放不可回收」` / `irreversible=true` / `label='对外·不可撤销'`；探针 G「harmSchema.parse 通过 + 5 key 全量列引用 + 无『等 N 个』折叠」PASS |
| 3 | 无令牌 → pending | ✅ | executeTool outbound 且无 confirmationToken → PendingActionEnvelope（execute.ts:41-53）；探针 B/E/G 均先落 pending；副作用零发生断言 PASS |
| 4 | 执行后 GameKey distributed + distributedAt + gateLogId 非空，同事务 | ✅ | distribute-keys.ts:176-189 条件 updateMany；**同事务硬证**：探针 A 人为回滚外层事务 → GameKey 翻牌 / partner 留痕 / Deliverable met 三处写入全部消失 → 证明确在同一事务（gate.ts:364-391） |
| 5 | keyRef 不含明文 key 值（schema 注释 + 断言） | ✅ | 三面独立核（探针 D）：① schema.prisma keyRef 注释「明文 key 值不得入库」+ model header「存**引用不存明文 key 值**」；② 写入口守卫 registerKeyPool 对形似激活码整批拒绝、一条不入库；③ 全库落库行 + 分发日志 payloadJson.keyRefs 扫描零明文形状 |
| 6 | 库存不足时明示拒绝不猜（P3 同源纪律） | ✅ | resolveKeys:91-96 `available < quantity` 抛 `KEYS_OUT_OF_STOCK_MSG`；探针 E「已 distributed 行不计入可用（3 行 2 已发 → 请求 2 被拒）」+「PendingAction 不产生」+「0 个发出」PASS |
| 7 | 幂等重入不双发 | ✅ | 执行体层（gateActionId 查已 distributed → already=true，distribute-keys.ts:134-159）+ 闸门层（探针 C 同票重放拒 / 再确认拒 / 新票因库存已扣拒 / gateLogId 全等单一 paId）PASS |
| 8 | P1 零真实外呼 | ✅ | **网络哨兵硬证**（探针 B）：全链执行期间 `globalThis.fetch` 换成抛错哨兵 → 仍成功 + 哨兵零调用；mocked=true；DISTRIBUTED_MARKER 计数留痕；静态面 grep ops/partner + tool 源码无 fetch/axios/http |

**8/8 acceptance 条款全部 PASS。**

---

## 3. 测试执行结果

| 套件 | 结果 |
|---|---|
| `distribute-keys.test.ts`（Generator） | **12 passed** |
| `distribute-keys.evaluator-probe.test.ts`（Evaluator，16 断言） | **16 passed** |
| tsc（F006 产品源 + 本探针文件） | **clean**（4 处 tsc 报错均在**其他 evaluator** 的 F003/F004/delivery-check 探针文件，与 F006 无关，不在本 feature 范围） |
| lint（F006 5 个产品源文件） | **✔ No ESLint warnings or errors** |

### 变异测试（隔离 worktree /tmp/f006-mut @ HEAD，5/5 全杀）

| # | 注入的缺陷 | 被杀断言 |
|---|---|---|
| M1 | 库存检查恒真通过（`available<quantity` → `false`） | 库存不足 4 断言翻红 |
| M2 | `gateLogId` 恒 null | GameKey 三字段 + 幂等 4 断言翻红 |
| M3 | partner 留痕逃逸事务（`ctx.db ?? prisma` → `prisma`） | **探针 A 同事务回滚证**翻红（唯一捕获者） |
| M4 | 明文守卫恒不触发 | 守卫 3 断言翻红 |
| M5 | harm 披露 quantity 造假（恒 1） | harm 折叠/三要素 2 断言翻红 |

变异全部被杀 = 检测器有活性，PASS 非空转。

---

## 4. Soft-watch / 观察项（不阻断，明文兜底）

| 项 | 事实 | 兜底 |
|---|---|---|
| S1 明文守卫盲区 | `looksLikePlaintextKey` 正则只匹配**大写**段（`[A-Z0-9]`）；小写同形串 `abcde-12345-xyz99` 可穿过（探针 D④ 取证记录） | **非缺陷**：key-ref.ts 头注已明文声明「保守形状识别，是防呆而非安全边界，真正边界是录入口只让人填引用」。acceptance 未要求覆盖所有 key 格式。真实安全边界在产品约定层，M5 接真时另议。 |
| S2 兄弟 feature tsc 噪声 | `tests/{integration/m3b-f003-evaluator,unit/delivery-check.evaluator-probe,unit/partner-adapters.evaluator-probe}` 4 处 `TS7018 implicitly any`（其他 evaluator 的探针文件 InputJsonValue 未标注） | 与 F006 无关，归属对应 feature 的验收者处置；不影响 F006 判定与产品 `src/` 编译 |

两条均有明文兜底，符合「首轮 PASS 硬条件 (c)」。

---

## 5. 结论

F006 acceptance 8 条全 PASS；Generator 交付测试 12/12 + Evaluator 独立探针 16/16；5 变异全杀；产品源 tsc/lint 干净；P1「零真实资金动作」经网络哨兵 + mock 观测标记双重实证。**判定 PASS。**

> 注：本报告仅覆盖 F006。批次整体 signoff 需 F001–F012 全条 PASS 后由汇总环节统一出具，本报告不代签整批。
