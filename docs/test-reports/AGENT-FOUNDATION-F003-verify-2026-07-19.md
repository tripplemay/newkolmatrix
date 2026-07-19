# AGENT-FOUNDATION F003 验收报告

- **Feature：** F003 — aigcgateway ⇄ Vercel AI SDK provider 封装（chat tool-calling + embeddings 双链路）
- **被验收提交：** `52adead` feat(AGENT-FOUNDATION-F003)
- **验收阶段：** verifying（首轮）
- **验收方式：** fresh context 隔离 evaluator subagent，逐条实测（读码 + 真实网关 smoke + 构建门）
- **验收环境：** node v25.7.0 / npm 10.8.2 / macOS Darwin 25.5.0
- **署名：** Andy/evaluator-subagent
- **日期：** 2026-07-19

> 独立性声明：本报告结论仅基于我亲自运行的命令输出与亲自读到的代码，不采信任何实现叙述。真实 API key 一律 mask（`pk_099****`）。

---

## 总判定：**PASS**

F003 的 3 条 acceptance + 关联的 AI 门 / 密钥门 / 构建门全部满足。真实经 aigcgateway 完成 chat(tool-call) + bge-m3(1024) 双链路，密钥全程走 env 无硬编码，缺 env 清晰报错不静默吞，构建门三项退出码 0。

---

## 逐条 acceptance

### A1 — smoke 脚本经网关完成 1 次 chat（含 tool-call 触发）+ 1 次 bge-m3 embedding：**PASS**

命令：`npm run ai:smoke`（= `node --env-file=.env --import tsx scripts/test/ai-gateway-smoke.ts`），**退出码 0**。

实测输出（真实网关，非 mock）：
```
链路1: chat + tool-call（model=deepseek-v3）
  ✓ finishReason=tool-calls（实际 tool-calls）
  ✓ chat 触发了 tool-call（共 1 次）
  ✓ tool-call 命中 get_kol_count（工具名正确）
  ✓ tool-call 参数含 platform（={"platform":"youtube"}）
[ai/gateway] usage model=deepseek-v3 in=368 out=58 total=426 est=~$0.000118
链路2: embedding（model=bge-m3）
  ✓ embedding 为数组
  ✓ bge-m3 维度 = 1024（须 = 1024，匹配 Kol.embedding vector(1024)）
  ✓ embedding 全为有限数值
[ai/gateway] usage model=bge-m3 in=0 out=0 total=0 est=(单价未登记)
[ai-smoke] ✅ 双链路全部通过
```

证据判定：
- **真实经网关**：usage `in=368 out=58 total=426` 为真实 token 计量（非 mock 恒定值），且触发真实计费 `~$0.000118`。
- **chat tool-call 触发**：`finishReason=tool-calls` + 命中 `get_kol_count` 工具名 + 参数 `{"platform":"youtube"}`——模型真实发出 tool-call，非文本 mock。脚本用「tool 不带 execute + 单步停」证明 tool-calling 链路触发（`scripts/test/ai-gateway-smoke.ts:44-53` 注释说明规避 deepseek 对 tool-call-only 空 content 消息的拒绝），充分满足 acceptance「chat 含 tool-call 触发」；完整 tool 往返执行分期到 F005，符合 spec §5 依赖链。
- **bge-m3 embedding 维度=1024**：`embedding.length === EMBEDDING_DIMENSIONS(1024)` 断言通过，`scripts/test/ai-gateway-smoke.ts:79-82` 明确断言维度须匹配 `Kol.embedding vector(1024)`（F002/F004 契约位）。

### A2 — 密钥走 env（AIGCGATEWAY_BASE_URL / AIGCGATEWAY_API_KEY）无硬编码：**PASS**

- **gateway.ts 从 env 读**：`src/lib/ai/gateway.ts:34-42` `requireEnv()` 从 `process.env[name]` 读，`getGateway()`（L48-54）用 `requireEnv('AIGCGATEWAY_BASE_URL')` + `requireEnv('AIGCGATEWAY_API_KEY')` → `createOpenAI({ name:'aigcgateway', baseURL, apiKey })`。baseURL 与 apiKey **均来自 env**，代码内无字面量端点/密钥（`aigc.guangai.ai` 仅出现在第 3 行注释，非运行时值）。
- **全仓无硬编码密钥**：`grep -rnE "pk_[A-Za-z0-9]{6,}|sk-[A-Za-z0-9]{6,}|Bearer [A-Za-z0-9]{8,}" src/ scripts/` → **exit=1（无任何匹配）**。
- **.env.example 只含 placeholder**：`AIGCGATEWAY_API_KEY=pk_your_key_here`（占位符，非真实 key）、`AIGCGATEWAY_BASE_URL=https://aigc.guangai.ai/v1`（端点 URL，非机密）。
- **.env 被 gitignore 且未 track**：`git check-ignore .env` → exit 0；`git ls-files .env` → 空（未追踪）。本机 `.env` 内真实 key 前缀 `pk_099****`（len=67），不入 git。

### A3 — 失败有清晰错误（不静默吞）+ 成本/错误处理骨架就位：**PASS**

- **缺 env 清晰报错**：不加载 env 直接跑 `npx tsx scripts/test/ai-gateway-smoke.ts`（未改任何文件/代码）→ **exit=1**，输出：
  ```
  [ai-smoke] ❌ 失败： [ai/gateway] 调用失败: Error: [ai/gateway] 缺少必需环境变量 AIGCGATEWAY_BASE_URL。请参照 .env.example 配置（密钥只走 env，不入 git）。
      at requireEnv (src/lib/ai/gateway.ts:37:11)
      ...
  ```
  清晰中文错误 + 完整堆栈，`main().catch` 经 `describeGatewayError` 打印后 `process.exit(1)`——非零退出、不静默吞。
- **错误处理骨架**：`describeGatewayError()`（gateway.ts:109-118）归一化 Error/非 Error，携带 `error.cause`；smoke 顶层 catch（L99-104）打印错误 + stack + 退出码。
- **成本骨架**：`logUsage()`（gateway.ts:88-103）按 `MODEL_PRICE_PER_MTOKEN` 估算并打印 token 用量与成本；实测 chat 链路输出 `est=~$0.000118`。真实成本持久化标注 `EXTENSION POINT`（对齐 ai-action-contract §4.7 cost-cap），符合「骨架就位」要求。
- **懒校验设计**：env 校验在 `getGateway()` 工厂内（非模块顶层），F005 route import 后无 secret 也不会顶层 throw 破坏 build/CI——与下方构建门实测一致。

---

## 关联门（spec §6，AI 门 / 密钥门 / 构建门在 F003 检查）

### AI 门：**PASS**
`npm run ai:smoke` 经 aigcgateway 完成 chat(tool-call) + bge-m3 embedding，exit 0（见 A1）。

### 密钥门：**PASS**
无硬编码密钥（grep exit=1）；走 env；`.env.example` 无明文真实 key（见 A2）。

### 构建门：**PASS**（删 `tsconfig.tsbuildinfo` + `.next/cache` 后重跑）
| 命令 | 退出码 | 证据 |
|---|---|---|
| `npx tsc --noEmit` | **0** | `TSC_EXIT=0`，无类型错误输出 |
| `npx next lint` | **0** | `✔ No ESLint warnings or errors`，`LINT_EXIT=0` |
| `npx next build` | **0** | `✓ Compiled successfully in 5.4s`；`✓ Generating static pages (10/10)`；路由表正常产出，无 secret 时构建不崩（懒校验生效） |

---

## D2 / 设计约束核对

- **D2（AI 门实现）**：`createOpenAI` 自定义 `baseURL` 指向 aigcgateway OpenAI 兼容端点（env 注入）；用 `.chat(modelId)` 走 `/chat/completions`（`chatModel()` gateway.ts:57-59），**非默认 callable（Responses API）**——网关不支持 Responses API，此处正确规避。embedding 用 `textEmbeddingModel()`（L62-64）。均满足 D2「Agent 运行时 = Vercel AI SDK；模型出口 = aigcgateway（OpenAI 兼容 baseURL）」。
- **版本说明（非阻断）**：实现用 Vercel AI SDK v7（`ai@7.0.31` + `@ai-sdk/openai@4.0.16`），spec 写「v5」。commit message 说明 v5 是 planning 版本标签，acceptance 为功能性要求（chat tool-call + embedding 双链路）非版本锁，F001 TS5 前置对 v7 同样满足。实测双链路与构建门均通过，功能性 acceptance 达成——记为**符合**，版本号差异不构成 FAIL。

---

## 备注 / 下游（不影响本判定）
- `bge-m3` usage 返回 `total=0`（`est=(单价未登记)`）：embedding 端点未回传 token 用量、且 bge-m3 未登记单价，属网关侧行为，不影响维度/链路验证，成本骨架逻辑正确（无 usage 时跳过）。可选下游：补 embedding 单价登记。
- 完整 tool 往返执行、真实成本持久化 / 预算闸门为已声明 `EXTENSION POINT`，分期到 F005 / 后续批次，非本 feature 缺陷。

---

## 最终判定：**F003 = PASS**（3/3 acceptance + AI 门 + 密钥门 + 构建门全绿）

署名：Andy/evaluator-subagent · 2026-07-19
